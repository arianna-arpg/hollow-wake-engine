import type { CastSealSpec } from './cast-seals.js';
import type { AdmissionChargeCost } from './skill-admission.js';
import type { InstanceActor, IntentInstance, SkillInstances } from './skill-instances.js';

export interface IntentActor<I> extends InstanceActor<I> {
  readonly activeAuras: ReadonlyMap<string, unknown>;
  readonly strobes: ReadonlyMap<string, unknown>;
  readonly venting: ReadonlySet<string>;
  readonly pools: ReadonlyMap<string, number>;
  readonly charges: ReadonlyMap<string, number>;
}
export interface SkillIntentPorts<A, I extends IntentInstance, S, T extends CastSealSpec = CastSealSpec> {
  time(): number;
  castSeal(): T | undefined;
  sealShuts(spec: T, actor: A, inst: I): boolean;
  seat(actor: A): S | undefined;
  knownSkill(seat: S, id: string): boolean;
  requirementShortfall(id: string, seat: S): string | undefined;
  trigger(inst: I): boolean;
  gatesMet(actor: A, inst: I): boolean;
  chargeCost(inst: I): AdmissionChargeCost | undefined;
  targeting(inst: I): { readonly requiresStatus?: unknown; readonly target?: string } | undefined;
  qualifiedTargetAvailable(actor: A, inst: I): boolean;
  canUse(actor: A, inst: I): boolean;
  mimicSelected(actor: A, time: number): { readonly sid: string } | null;
  mimicPowerMods(inst: I): I['extraMods'];
  conversion(inst: I): { readonly when: string; readonly skillId: string } | undefined;
  conversionHolds(when: string, actor: A, inst: I): boolean;
}

/** Query policy for one simulation. This is not actual cast request dispatch.
 * Ports and actor records stay live; queries may lazily mint or select a skill. */
export class SkillIntent<A extends IntentActor<I>, I extends IntentInstance, S, T extends CastSealSpec = CastSealSpec> {
  readonly #ports: Readonly<SkillIntentPorts<A, I, S, T>>;
  readonly #instances: SkillInstances<A, I>;
  constructor(instances: SkillInstances<A, I>, ports: SkillIntentPorts<A, I, S, T>) {
    this.#instances = instances;
    this.#ports = Object.freeze({ ...ports });
  }
  get instances(): SkillInstances<A, I> { return this.#instances; }

  castSealed(actor: A, inst: I): T | null {
    const spec = this.#ports.castSeal();
    if (!spec) return null;
    return this.#ports.sealShuts(spec, actor, inst) ? spec : null;
  }

  requirementRefusal(actor: A, inst: I): string | undefined {
    const p = this.#ports, seat = p.seat(actor);
    if (!seat || inst.devGift || !p.knownSkill(seat, inst.def.id)) return undefined;
    if (actor.activeAuras.has(inst.def.id) || actor.strobes.has(inst.def.id)) return undefined;
    return p.requirementShortfall(inst.def.id, seat);
  }

  hudUsable(actor: A, inst: I): boolean {
    const p = this.#ports, def = inst.def;
    if (p.trigger(inst)) return false;
    if (this.castSealed(actor, inst)) return false;
    if (def.pool && !actor.venting.has(def.pool.id)
      && (actor.pools.get(def.pool.id) ?? 0) < (def.pool.min ?? 1)) return false;
    if (!p.gatesMet(actor, inst)) return false;
    const cost = p.chargeCost(inst);
    if (cost && !cost.optional) {
      const have = actor.charges.get(cost.charge) ?? 0;
      const need = cost.amount === 'all' ? (cost.minimum ?? 1) : Math.max(cost.amount, cost.minimum ?? 0);
      if (have < need) return false;
    }
    const targeting = p.targeting(inst);
    if (targeting?.requiresStatus && targeting.target !== 'corpse') return p.qualifiedTargetAvailable(actor, inst);
    return true;
  }

  queuedStep(actor: A, inst: I): I | null {
    const chain = inst.def.comboChain;
    if (!chain?.skills.length) return null;
    const cursor = this.#instances.cursor(actor, inst);
    if (cursor.comboAt === undefined) return null;
    if (this.#ports.time() - cursor.comboAt > chain['window']) return null;
    return this.#instances.step(actor, inst, cursor.comboIdx ?? 0);
  }

  slotFace(actor: A, inst: I): I['def'] {
    const p = this.#ports, instances = this.#instances;
    if (inst.def.mimic) {
      const selected = p.mimicSelected(actor, p.time());
      const definition = selected && instances.definition(selected.sid);
      if (definition) return definition;
    }
    const step = this.queuedStep(actor, inst);
    if (step) return step.def;
    const conversion = p.conversion(inst);
    const definition = conversion && instances.definition(conversion.skillId);
    return conversion && definition && p.conversionHolds(conversion.when, actor, inst) ? instances.definition(conversion.skillId)! : inst.def;
  }

  pressUsable(actor: A, inst: I): boolean {
    const p = this.#ports, instances = this.#instances;
    if (this.castSealed(actor, inst)) return false;
    if (inst.def.mimic) {
      const selected = p.mimicSelected(actor, p.time());
      if (!selected || !instances.definition(selected.sid)) return false;
      const minted = instances.meta(actor, inst, selected.sid);
      minted.sockets = inst.sockets;
      minted.extraMods = p.mimicPowerMods(inst);
      return p.canUse(actor, minted);
    }
    const step = this.queuedStep(actor, inst);
    if (step) return p.canUse(actor, step);
    const conversion = p.conversion(inst);
    if (conversion && instances.definition(conversion.skillId) && p.conversionHolds(conversion.when, actor, inst)) {
      const minted = instances.meta(actor, inst, conversion.skillId);
      minted.sockets = inst.sockets;
      return p.canUse(actor, minted);
    }
    return p.canUse(actor, inst);
  }
}
