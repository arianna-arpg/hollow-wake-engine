import { localeProgram } from './locales';
import type { ZoneTheme, SkyExposure, ObjectiveSpec, PackSpec } from '../data/zones';

export interface ComplexStage {
  id: string; label: string; locale: string;
  /** Interior geometry alternatives; entries stay pinned. Activity, population and level remain stage-owned. */
  locales?: string[];
  /** Map-space displacement from the entrance; rotated together per instance. */
  offset: [number, number];
  theme?: Partial<ZoneTheme>;
  sky?: SkyExposure;
  levelDelta?: number;
  /** Explicit inhabitants; absent stages keep the receiving biome's packs. */
  packs?: PackSpec;
  /** A stage's own activity, independent of its receiving biome. */
  objective?: Extract<ObjectiveSpec, { kind: 'clear' | 'unearth' | 'rifts' | 'pyres' }>;
}
export interface ComplexForm {
  id: string;
  offsets: Record<string, [number, number]>;
  extras?: ComplexStage[];
  links: LandmarkComplex['links'];
}
export interface LandmarkComplex {
  id: string; version: number; label: string;
  entrance: string;
  stages: ComplexStage[];
  forms?: ComplexForm[];
  links: { from: string; to: string; fromAt?: [number, number]; toAt?: [number, number];
    /** Commission opens an optional leaf; its work lives on the reachable from-stage. */
    bountyPassage?: string;
  }[];
}
/** Saved on every member; the map graph and locale plans are the durable content. */
export interface ComplexMembership {
  root: string; kind: string; version: number; label: string;
  stage: string; stageLabel: string;
  form?: string;
  /** Resolved once with the graph; opened only by the issuing board's collection. */
  bountyPassageBoard?: true;
  bountyPassage?: { to: string; label: string; opened: boolean };
}
const COMPLEXES: Record<string, LandmarkComplex> = {};
export const landmarkComplex = (id: string) => COMPLEXES[id];
export const landmarkComplexes = () => Object.values(COMPLEXES);
export function validateLandmarkComplex(def: LandmarkComplex): string[] {
  const errors: string[] = [], ids = new Set(def.stages.map(s => s.id));
  if (!def.id || !def.label || !Number.isInteger(def.version) || def.version < 1) errors.push('invalid identity/version');
  if (def.stages.length < 2 || def.stages.length > 8 || ids.size !== def.stages.length || !ids.has(def.entrance)) errors.push('invalid stage identities/budget');
  for (const s of def.stages) {
    if (s.id === def.entrance && s.locales) errors.push('entrance locale alternatives cannot override the pinned entry');
    if (s.locales && (!s.locales.length || new Set(s.locales).size !== s.locales.length || s.locales.some(id => !localeProgram(id)))) errors.push(`invalid locale alternatives ${s.id}`);
    if (!s.id || !s.label || !localeProgram(s.locale)) errors.push(`unknown locale or stage ${s.id}`);
    if (s.offset.length !== 2 || !s.offset.every(n => Number.isFinite(n) && Math.abs(n) <= 400)) errors.push(`invalid offset ${s.id}`);
    if (s.levelDelta !== undefined && (!Number.isInteger(s.levelDelta) || s.levelDelta < 0 || s.levelDelta > 5)) errors.push(`invalid level step ${s.id}`);
    if (s.id === def.entrance && s.offset.some(n => n !== 0)) errors.push('entrance must stand at the feature seat');
    if (def.links.filter(l => l.from === s.id || l.to === s.id).length > (s.id === def.entrance ? 2 : 4)) errors.push(`too many links ${s.id}`);
  }
  for (let a = 0; a < def.stages.length; a++) for (let b = a + 1; b < def.stages.length; b++) {
    const [ax, ay] = def.stages[a].offset, [bx, by] = def.stages[b].offset;
    if (Math.hypot(ax - bx, ay - by) < 48) errors.push('stages overlap on chart');
  }
  const links = new Set<string>();
  for (const l of def.links) {
    const key = [l.from, l.to].sort().join('/');
    if (!ids.has(l.from) || !ids.has(l.to) || l.from === l.to || links.has(key)) errors.push('invalid or duplicate link');
    if ([l.fromAt, l.toAt].some(p => p && (p.length !== 2 || !p.every(n => Number.isFinite(n) && n >= 0.08 && n <= 0.92)))) errors.push('invalid transition landing');
    if (l.bountyPassage !== undefined) {
      const from = def.stages.find(s => s.id === l.from);
      if (!l.bountyPassage.trim() || l.to === def.entrance
        || def.links.filter(e => e.from === l.to || e.to === l.to).length !== 1
        || def.links.filter(e => e.from === l.from && e.bountyPassage !== undefined).length !== 1
        || !from?.objective || !['clear', 'unearth', 'rifts', 'pyres'].includes(from.objective.kind))
        errors.push('invalid bountyPassage: requires reachable activity and exclusive optional leaf');
    }
    links.add(key);
  }
  const reached = new Set([def.entrance]);
  for (let i = 0; i < ids.size; i++) for (const l of def.links) {
    if (reached.has(l.from)) reached.add(l.to);
    if (reached.has(l.to)) reached.add(l.from);
  }
  if ([...ids].some(id => !reached.has(id))) errors.push('disconnected complex');
  // Every commissioned task must be reachable before any sealed wing opens.
  const open = new Set([def.entrance]);
  for (let i = 0; i < ids.size; i++) for (const l of def.links) {
    if (l.bountyPassage !== undefined) continue;
    if (open.has(l.from)) open.add(l.to);
    if (open.has(l.to)) open.add(l.from);
  }
  for (const l of def.links) if (l.bountyPassage !== undefined && !open.has(l.from))
    errors.push('bountyPassage task behind a seal');
  if (def.forms) {
    if (!def.forms.length || new Set(def.forms.map(f => f.id)).size !== def.forms.length) errors.push('unique nonempty complex forms required');
    for (const form of def.forms) {
      if (!form.id || Object.keys(form.offsets).length !== def.stages.length || def.stages.some(s => !form.offsets[s.id])) {
        errors.push('form must position every base stage'); continue;
      }
      const gates = (links: LandmarkComplex['links']) => links.filter(l => l.bountyPassage !== undefined)
        .map(l => [l.from, l.to, l.bountyPassage].join('/')).sort();
      if (JSON.stringify(gates(form.links)) !== JSON.stringify(gates(def.links))) errors.push(form.id + ': form must preserve bountyPassage contracts');
      errors.push(...validateLandmarkComplex(resolveComplexForm(def, form)).map(e => form.id + ': ' + e));
    }
  }
  return errors;
}
/** Forms vary only geometry and optional side ground; base activities stay intact. */
export function resolveComplexForm(def: LandmarkComplex, form: ComplexForm): LandmarkComplex {
  return { ...structuredClone(def), forms: undefined,
    stages: [...def.stages.map(s => ({ ...structuredClone(s), offset: form.offsets[s.id] })), ...structuredClone(form.extras ?? [])],
    links: structuredClone(form.links) };
}
export function registerLandmarkComplex(def: LandmarkComplex): void {
  const errors = validateLandmarkComplex(def);
  if (errors.length) throw new Error(`complex ${def.id}: ${errors.join('; ')}`);
  COMPLEXES[def.id] = def;
}
