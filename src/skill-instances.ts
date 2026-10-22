export interface ComboCursor {
  comboAt?: number;
  comboIdx?: number;
  comboSelf?: number;
}
export interface IntentDefinition {
  readonly id: string;
  readonly effects: readonly { readonly type: string }[];
  readonly comboChain?: { readonly skills: readonly string[]; readonly window: number };
  readonly mimic?: unknown;
  readonly pool?: { readonly id: string; readonly min?: number };
}
/** Shared payload fields are opaque to this policy and retain host identity. */
export interface IntentInstance {
  readonly def: IntentDefinition;
  readonly level: number;
  readonly bonusLevels?: number;
  readonly devGift?: boolean;
  hostSkillId?: string;
  chainOf?: string;
  sockets: unknown;
  grafts?: unknown;
  state?: ComboCursor;
  comboTreeMods?: unknown;
  extraMods?: unknown;
}
export interface InstanceActor<I> {
  readonly construct?: unknown;
  readonly skills: readonly (I | null)[];
  readonly metaInsts: Map<string, I>;
}
export interface SkillInstancePorts<I extends IntentInstance> {
  /** Coherent synchronous content reads; the factory returns a fresh instance. */
  skill(id: string): I['def'] | undefined;
  create(definition: I['def'], level: number): I;
  effectiveLevel(inst: I): number;
  treeMods(inst: I): I['comboTreeMods'];
}

/** One simulation's transient ownership. Actor caches remain borrowed; weak
 * keys prevent the private cursors and relocation associations owning actors. */
export class SkillInstances<A extends InstanceActor<I>, I extends IntentInstance> {
  readonly #ports: Readonly<SkillInstancePorts<I>>;
  readonly #cursors = new WeakMap<A, Map<string, ComboCursor>>();
  readonly #relocations = new WeakMap<I, I>();
  constructor(ports: SkillInstancePorts<I>) { this.#ports = Object.freeze({ ...ports }); }

  definition(id: string): I['def'] | undefined { return this.#ports.skill(id); }
  relocationHost(inst: I): I | undefined { return this.#relocations.get(inst); }

  cursor(actor: A, inst: I): ComboCursor {
    if (!actor.construct || actor.skills.includes(inst)) return (inst.state ??= {});
    let cursors = this.#cursors.get(actor);
    if (!cursors) { cursors = new Map(); this.#cursors.set(actor, cursors); }
    let cursor = cursors.get(inst.def.id);
    if (!cursor) { cursor = {}; cursors.set(inst.def.id, cursor); }
    return cursor;
  }

  step(actor: A, inst: I, index: number): I | null {
    const chain = inst.def.comboChain;
    if (!chain || index <= 0 || index > chain.skills.length) return null;
    const id = chain.skills[index - 1];
    if (id === inst.def.id) return null;
    const definition = this.#ports.skill(id);
    if (!definition) return null;
    const key = inst.def.id + ':combo' + index;
    const level = inst.level + Math.floor(inst.bonusLevels ?? 0);
    let step = actor.metaInsts.get(key);
    if (!step || step.def.id !== id || step.level !== level) {
      step = this.#ports.create(definition, level);
      step.hostSkillId = inst.def.id;
      step.chainOf = inst.def.id;
      actor.metaInsts.set(key, step);
    }
    step.sockets = inst.sockets;
    step.grafts = inst.grafts;
    step.comboTreeMods = this.#ports.treeMods(inst);
    return step;
  }

  meta(actor: A, host: I, skillId: string): I {
    const key = host.def.id + ':' + skillId;
    let inst = actor.metaInsts.get(key);
    const definition = this.#ports.skill(skillId);
    if (!definition) throw new Error(`Unknown meta skill: ${skillId}`);
    const relocation = definition.effects.some(effect => effect.type === 'relocateConstruct');
    if (!inst || inst.level !== this.#ports.effectiveLevel(host)
      || (relocation && this.#relocations.get(inst) !== host)) {
      inst = this.#ports.create(definition, this.#ports.effectiveLevel(host));
      inst.hostSkillId = host.def.effects.some(effect => effect.type === 'commandMinions')
        ? undefined : host.def.id;
      actor.metaInsts.set(key, inst);
      if (relocation) this.#relocations.set(inst, host);
    }
    return inst;
  }
}
