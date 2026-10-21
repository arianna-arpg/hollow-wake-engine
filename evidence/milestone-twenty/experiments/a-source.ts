import type { Modifier } from './types.js';
import type { PassiveGraft } from './passive-policy.js';
import { validateModifier } from './stat-rules.js';
import { copy, finite, freeze, integer } from './validation.js';

export type ConduitPool = 'life' | 'mana' | 'es' | 'poise' | 'ward' | 'guard' | 'insight';
export interface PassiveConduit {
  from: ConduitPool; to: ConduitPool; drainPct?: number; drainFlat?: number; ratio: number; floor?: number;
}
export interface PassiveGrant {
  attributes?: Record<string, number>; attributesPct?: Record<string, number>; mods?: Modifier[];
  conduit?: PassiveConduit; graft?: PassiveGraft;
}
export interface PassiveGrantNode extends PassiveGrant { id: string; name?: string; description?: string; choiceGroup?: string }
export interface PassiveGrantOption extends PassiveGrant { id: string; name: string; description: string }
export interface PassiveGrantPack {
  schemaVersion: 1; capability: 'passive-grants/v1'; contentId: string;
  attributes: { id: string; perPoint: Modifier[] }[];
  statIds: string[]; supportIds: string[];
  nodes: PassiveGrantNode[];
  groups: { id: string; options: PassiveGrantOption[] }[];
}
export interface ResolvedPassiveGraft { key: string; name: string; description: string; graft: PassiveGraft }
interface CompiledGrant {
  flat?: Float64Array; pct?: Float64Array; mods: readonly Modifier[];
  conduit?: PassiveConduit; graft?: PassiveGraft;
}
interface GrantRow { grant: CompiledGrant; key: string; name: string; description: string }
const reserved = new Set(['__proto__','constructor','prototype']);
function identity(value: string): void { if (typeof value !== 'string' || !value || reserved.has(value)) throw new Error('Invalid grant identity'); }
function fields(value: object, allowed: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unsupported grant field: ${key}`);
}
function unique(values: string[]): void { values.forEach(identity); if (new Set(values).size !== values.length) throw new Error('Duplicate grant identity'); }
/** For already validated schema rows: only tags contain mutable nested state. */
function copyModifier(m: Modifier): Modifier {
  const result = { ...m };
  if (m.tags !== undefined) result.tags = [...m.tags];
  return result;
}

/** Immutable grants. Compiles attribute vectors once; retains every modifier's original order and scope. */
export class PassiveGrants {
  readonly pack: PassiveGrantPack;
  #attrs = new Map<string, number>();
  #stats: Set<string>;
  #nodes = new Map<string, { definition: PassiveGrantNode; row: GrantRow }>();
  #options = new Map<string, Map<string, { definition: PassiveGrantOption; grant: CompiledGrant }>>();
  constructor(input: PassiveGrantPack) {
    const p = copy(input);
    fields(p, ['schemaVersion','capability','contentId','attributes','statIds','supportIds','nodes','groups']);
    if (p.schemaVersion !== 1 || p.capability !== 'passive-grants/v1') throw new Error('Unsupported passive grant content');
    identity(p.contentId); unique(p.attributes.map(a => a.id)); unique(p.statIds); unique(p.supportIds);
    unique(p.nodes.map(n => n.id)); unique(p.groups.map(g => g.id));
    if (!p.attributes.length) throw new Error('Attribute registry must not be empty');
    this.#stats = new Set(p.statIds); const supports = new Set(p.supportIds);
    p.attributes.forEach((a, i) => this.#attrs.set(a.id, i));
    for (const a of p.attributes) {
      fields(a, ['id','perPoint']); for (const m of a.perPoint) this.validate(m);
    }
    const vector = (values: Record<string, number> | undefined): Float64Array | undefined => {
      if (values === undefined) return undefined;
      const out = new Float64Array(p.attributes.length);
      for (const [id, value] of Object.entries(values)) {
        const index = this.#attrs.get(id); if (index === undefined) throw new Error(`Unknown grant attribute: ${id}`);
        out[index] = finite(value, 'attribute grant');
      }
      return out;
    };
    const compile = (g: PassiveGrant): CompiledGrant => {
      for (const m of g.mods ?? []) this.validate(m);
      if (g.conduit) {
        const c = g.conduit, pools = ['life','mana','es','poise','ward','guard','insight'];
        fields(c, ['from','to','drainPct','drainFlat','ratio','floor']);
        if (!pools.includes(c.from) || !pools.includes(c.to)) throw new Error('Unknown conduit pool');
        for (const value of [c.drainPct ?? 0, c.drainFlat ?? 0, c.ratio, c.floor ?? 0]) {
          if (finite(value, 'conduit value') < 0) throw new Error('Negative conduit value');
        }
        if ((c.floor ?? 0) > 1) throw new Error('Conduit floor exceeds its pool');
      }
      if (g.graft) {
        fields(g.graft, ['support','level']);
        if (!supports.has(g.graft.support)) throw new Error('Unknown graft support');
        if (g.graft.level !== undefined) integer(g.graft.level, 1, 'graft level');
      }
      return { flat: vector(g.attributes), pct: vector(g.attributesPct), mods: g.mods ?? [], conduit: g.conduit, graft: g.graft };
    };
    const grantFields = ['attributes','attributesPct','mods','conduit','graft'];
    for (const g of p.groups) {
      fields(g, ['id','options']); unique(g.options.map(o => o.id)); const options = new Map();
      for (const o of g.options) {
        fields(o, ['id','name','description',...grantFields]);
        if (typeof o.name !== 'string' || typeof o.description !== 'string') throw new Error('Invalid choice grant labels');
        options.set(o.id, { definition: o, grant: compile(o) });
      }
      this.#options.set(g.id, options);
    }
    for (const n of p.nodes) {
      fields(n, ['id','name','description','choiceGroup',...grantFields]);
      if (n.name !== undefined && typeof n.name !== 'string') throw new Error('Invalid node name');
      if (n.description !== undefined && typeof n.description !== 'string') throw new Error('Invalid node description');
      if (n.choiceGroup !== undefined && !this.#options.has(n.choiceGroup)) throw new Error('Unknown node choice group');
      this.#nodes.set(n.id, { definition: n, row: { grant: compile(n), key: n.id, name: n.name ?? n.id, description: n.description ?? '' } });
    }
    this.pack = freeze(p);
  }
  /** Validate authored/input modifiers independently of the narrower resolved-hit capability. */
  validate(m: Modifier): void {
    fields(m, ['stat','kind','value','fromStat','tags','when','gauge','gaugeAt']); validateModifier(m);
    if (!this.#stats.has(m.stat) && !this.#attrs.has(m.stat)) throw new Error(`Unknown grant stat: ${m.stat}`);
    if (m.fromStat !== undefined && !this.#stats.has(m.fromStat)) throw new Error(`Unknown linked stat: ${m.fromStat}`);
    if (m.tags !== undefined && (!Array.isArray(m.tags) || m.tags.some(t => typeof t !== 'string'))) throw new Error('Invalid modifier tags');
    for (const value of [m.when, m.gauge]) if (value !== undefined && typeof value !== 'string') throw new Error('Invalid modifier scope');
  }
  attributeIndex(id: string): number | undefined { return this.#attrs.get(id); }
  begin(base: Readonly<Record<string, number>>, allocated: ReadonlySet<string>, choices: Readonly<Record<string, readonly string[]>>,
    unknown: 'reject' | 'skip' = 'reject'): PassiveGrantBuild {
    if (unknown !== 'reject' && unknown !== 'skip') throw new Error('Invalid unknown-grant policy');
    const rows: GrantRow[] = [];
    for (const id of allocated) {
      const n = this.#nodes.get(id);
      if (!n) { if (unknown === 'reject') throw new Error(`Unknown allocated grant: ${id}`); continue; }
      rows.push(n.row);
      if (n.definition.choiceGroup !== undefined) for (const oid of Object.hasOwn(choices, id) ? choices[id] : []) {
        const o = this.#options.get(n.definition.choiceGroup)!.get(oid);
        if (!o) { if (unknown === 'reject') throw new Error(`Unknown chosen grant: ${id}:${oid}`); continue; }
        rows.push({ grant: o.grant, key: `${id}:${oid}`, name: o.definition.name, description: o.definition.description });
      }
    }
    return new PassiveGrantBuild(this, base, rows);
  }
}

/** One rebuild accumulator. The host supplies item/container rows in their authoritative order. */
class PassiveGrantBuild {
  #values: Float64Array;
  #pct: Float64Array;
  #mods: Modifier[] = [];
  #conduits: PassiveConduit[] = [];
  #grafts: ResolvedPassiveGraft[] = [];
  constructor(readonly content: PassiveGrants, base: Readonly<Record<string, number>>, rows: GrantRow[]) {
    const attributes = content.pack.attributes;
    this.#values = new Float64Array(attributes.length);
    // The immutable content order is authoritative. Fill the owned vector
    // directly instead of constructing an iterable list and mapping callback.
    for (let i = 0; i < attributes.length; i++) this.#values[i] = finite(base[attributes[i].id] ?? 0, 'base attribute');
    this.#pct = new Float64Array(this.#values.length);
    for (const row of rows) this.#fold(row.grant, row);
  }
  /** @internal Called only while constructing a build; vectors are never exposed by content. */
  #fold(g: CompiledGrant, source: { key: string; name: string; description: string }): void {
    if (g.flat) for (let i = 0; i < this.#values.length; i++) this.#values[i] += g.flat[i];
    if (g.pct) for (let i = 0; i < this.#pct.length; i++) this.#pct[i] += g.pct[i];
    this.#mods.push(...g.mods);
    if (g.conduit) this.#conduits.push(g.conduit);
    if (g.graft) this.#grafts.push({ key: source.key, name: source.name, description: source.description, graft: g.graft });
  }
  get passiveModifiers(): Modifier[] { return this.#mods.map(copyModifier); }
  get conduits(): PassiveConduit[] { return this.#conduits.map(c => ({ ...c })); }
  get grafts(): ResolvedPassiveGraft[] { return this.#grafts.map(g => ({ ...g, graft: { ...g.graft } })); }
  /** Attribute lines feed the common accumulator; other lines retain their source order. Atomic on invalid input. */
  addItemModifiers(input: readonly Modifier[]): Modifier[] {
    const mods = copy(input), values = this.#values.slice(), pct = this.#pct.slice(), sheet: Modifier[] = [];
    for (const m of mods) {
      this.content.validate(m); const index = this.content.attributeIndex(m.stat);
      if (index === undefined) sheet.push(m);
      else if (m.kind === 'flat') values[index] = finite(values[index] + m.value, 'attribute sum');
      else if (m.kind === 'increased') pct[index] = finite(pct[index] + m.value, 'attribute percent sum');
      // Original attribute item lines of other kinds have no effect; retained explicitly as compatibility.
    }
    this.#values = values; this.#pct = pct; return sheet;
  }
  attributes(): Record<string, number> {
    return Object.fromEntries(this.content.pack.attributes.map((a, i) => [a.id,
      Math.max(0, Math.round(finite(this.#values[i] * (1 + this.#pct[i]), 'derived attribute')))]));
  }
  attributeModifiers(): Modifier[] {
    const attributes = this.attributes(), result: Modifier[] = [];
    for (const a of this.content.pack.attributes) {
      const points = attributes[a.id]; if (!points) continue;
      for (const m of a.perPoint) {
        const row = copyModifier(m); row.value = finite(m.value * points, 'attribute modifier'); result.push(row);
      }
    }
    return result;
  }
}
