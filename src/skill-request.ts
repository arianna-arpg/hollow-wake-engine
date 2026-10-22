import type { AdmissionDelivery } from './skill-admission.js';

/** A handled request need not have started a cast or delivered an effect. */
export type SkillRequestResult = boolean | 'continue';

export interface RequestInstance {
  readonly def: {
    readonly id: string;
    readonly tags?: readonly string[];
    readonly delivery: AdmissionDelivery;
    readonly hivecall?: unknown;
    readonly mimic?: unknown;
  };
  sockets: unknown;
  extraMods?: unknown;
  replenishmentPaused?: boolean;
  state?: { triggerOff?: boolean; trigDepth?: number };
}

export interface RequestActor<I, Id = number> {
  readonly id: Id;
  readonly dead: boolean;
  readonly downed?: unknown;
  readonly hiveForm?: unknown;
  readonly throngDriven?: unknown;
  readonly throngCarried?: unknown;
  readonly skills: readonly (I | null)[];
  readonly heldBy?: Id;
  readonly gripping?: { readonly id: Id; struggle: number };
  readonly clingTo?: unknown;
  readonly cling?: { readonly gnaw?: unknown };
  readonly mountId?: Id;
  readonly activeAuras: ReadonlyMap<string, unknown>;
  readonly overdrive: { readonly mana?: { readonly debt: number }; readonly life?: { readonly debt: number } };
  readonly life: number;
  useLock: number;
}

/** Trusted, validated effects: relocateConstruct carries a finite radius. */
export interface RequestEffect { readonly type: string; readonly radius?: number }

/** Synchronous live ports. Skipped lanes are not read. Exceptions propagate;
 * earlier mutations are not rolled back. canUse may create ammunition state. */
export interface SkillRequestPorts<A, I extends RequestInstance, S, Aim, Id = number> {
  castSealed(actor: A, inst: I): { readonly line?: string } | null | undefined;
  hivecallMeta(actor: A, inst: I): boolean | undefined;
  throngTravelProtected(actor: A): boolean;
  replenishingDelivery(inst: I): { readonly replenish?: { readonly toggle?: boolean } } | undefined;
  forgetReplenishment(actor: A, inst: I): void;
  seatOf(actor: A): S | undefined;
  /** Exact body identity lookup; not possession-aware seatOf. */
  triggerSeat(actor: A): S | undefined;
  markMetaDirty(seat: S): void;
  markCharacterDirty(): void;
  replenishmentFeedback(actor: A, inst: I): void;
  markSeatActed(actor: A): void;
  isReflex(actor: A, inst: I): boolean;
  actorById(id: Id): A | undefined;
  mashPress(): number;
  failNote(actor: A, key: string, text: string): void;
  maxLife(actor: A): number;
  trigger(inst: I): unknown;
  triggerArmed(inst: I): boolean;
  requirementRefusal(actor: A, inst: I): string | undefined;
  conversion(inst: I): { readonly when: string; readonly skillId: string } | undefined;
  definition(id: string): I['def'] | undefined;
  conversionHolds(when: string, actor: A, inst: I): boolean;
  mint(actor: A, host: I, id: string): I;
  dispatch(actor: A, inst: I, aim: Aim, seatPress: boolean): boolean;
  time(): number;
  mimicSelected(actor: A, time: number): { readonly sid: string } | null;
  mimicPowerMods(inst: I): I['extraMods'];
  unmetGate(actor: A, inst: I): { readonly note?: string } | null | undefined;
  effects(inst: I): readonly RequestEffect[];
  relocationTarget(actor: A, inst: I, radius: number): unknown;
  canUse(actor: A, inst: I): boolean;
}

/** One host's ordered request prefix. Retains no actors, instances or query
 * results. The host continues with reserve pricing and delivery only when the
 * return value is exactly 'continue'. Redirects re-enter the host dispatcher. */
export class SkillRequest<A extends RequestActor<I, Id>, I extends RequestInstance, S, Aim, Id = number> {
  readonly #ports: Readonly<SkillRequestPorts<A, I, S, Aim, Id>>;
  constructor(ports: SkillRequestPorts<A, I, S, Aim, Id>) { this.#ports = Object.freeze({ ...ports }); }

  preflight(actor: A, inst: I, aim: Aim, seatPress = false): SkillRequestResult {
    const p = this.#ports;
    const seal = p.castSealed(actor, inst);
    if (seal) {
      if (seal.line && seatPress) p.failNote(actor, 'castseal', seal.line);
      return false;
    }
    if (actor.hiveForm && inst.def.hivecall) return p.hivecallMeta(actor, inst) ?? false;
    if (p.throngTravelProtected(actor) || actor.throngDriven || actor.throngCarried) return false;
    if (p.replenishingDelivery(inst)) {
      if (seatPress && p.replenishingDelivery(inst)?.replenish?.toggle
        && !actor.dead && !actor.downed && actor.skills.includes(inst)) {
        if (inst.replenishmentPaused) delete inst.replenishmentPaused;
        else inst.replenishmentPaused = true;
        p.forgetReplenishment(actor, inst);
        const seat = p.seatOf(actor);
        if (seat) p.markMetaDirty(seat);
        p.markCharacterDirty();
        p.replenishmentFeedback(actor, inst);
        return true;
      }
      if (seatPress) p.failNote(actor, inst.def.id + ':replenish', 'replenishes while on your bar');
      return false;
    }
    p.markSeatActed(actor);
    if (actor.heldBy !== undefined && !p.isReflex(actor, inst)) {
      const holder = p.actorById(actor.heldBy);
      const hold = holder?.gripping;
      if (hold && hold.id === actor.id) hold.struggle += p.mashPress();
      p.failNote(actor, 'grab:held', 'held fast — struggle!');
      return false;
    }
    if (actor.clingTo && actor.cling?.gnaw && !p.seatOf(actor)) return false;
    if (actor.mountId !== undefined && inst.def.tags?.includes('movement')) return false;
    {
      const delivery = inst.def.delivery;
      if (delivery.type === 'aura' && delivery.mode === 'toggle' && delivery.overdrive
        && actor.activeAuras.has(inst.def.id)
        && (actor.overdrive[delivery.overdrive.lane]?.debt ?? 0) > 0) {
        p.failNote(actor, inst.def.id + ':debt', 'debt outstanding');
        return false;
      }
      if (delivery.type === 'aura' && delivery.mode === 'toggle' && delivery.lockAboveLife !== undefined
        && actor.activeAuras.has(inst.def.id)
        && actor.life > delivery.lockAboveLife * p.maxLife(actor)) {
        p.failNote(actor, inst.def.id + ':locked', 'it will not let go');
        return false;
      }
    }
    if (p.trigger(inst)) {
      if (!seatPress) return false;
      const state = (inst.state ??= {});
      state.triggerOff = p.triggerArmed(inst);
      const seat = p.triggerSeat(actor);
      if (seat) p.markMetaDirty(seat);
      actor.useLock = Math.max(actor.useLock, 0.25);
      return true;
    }
    if (inst.state?.trigDepth) inst.state.trigDepth = 0;
    const why = p.requirementRefusal(actor, inst);
    if (why) { p.failNote(actor, inst.def.id + ':req', why); return false; }
    const conversion = p.conversion(inst);
    if (conversion && p.definition(conversion.skillId) && p.conversionHolds(conversion.when, actor, inst)) {
      const minted = p.mint(actor, inst, conversion.skillId);
      minted.sockets = inst.sockets;
      return p.dispatch(actor, minted, aim, seatPress);
    }
    if (inst.def.mimic) {
      const selected = p.mimicSelected(actor, p.time());
      if (!selected || !p.definition(selected.sid)) {
        p.failNote(actor, inst.def.id + ':empty', 'no art captured');
        return false;
      }
      const minted = p.mint(actor, inst, selected.sid);
      minted.sockets = inst.sockets;
      minted.extraMods = p.mimicPowerMods(inst);
      return p.dispatch(actor, minted, aim, seatPress);
    }
    const unmet = p.unmetGate(actor, inst);
    if (unmet) {
      p.failNote(actor, inst.def.id + ':gate', unmet.note ?? 'not ready');
      return false;
    }
    for (const effect of p.effects(inst)) {
      if (effect.type === 'relocateConstruct' && !p.relocationTarget(actor, inst, effect.radius!)) {
        p.failNote(actor, inst.def.id + ':device', 'no device from this skill in reach');
        return false;
      }
    }
    if (!p.canUse(actor, inst)) return false;
    return 'continue';
  }
}
