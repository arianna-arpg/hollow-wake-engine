import {commitAmmunitionPress, type AmmunitionPressPorts, type UseChargeSpec} from './ammunition.js';
import {castDuration} from './casting.js';
import {channelInterval, channelWindup, type ChannelCastSpec, type ChannelCurve} from './channel-casting.js';
import {chargeCastDuration, overchargeCastDuration, overchargeMarker,
  type ChargeCastSpec, type OverchargeCastSpec, type StrikeTiming} from './charged-casting.js';
import {focusCastDuration, type FocusCastSpec} from './interactive-casting.js';
import type {ResourceCost} from './resource-payment.js';
import type {AdmissionReserve} from './skill-admission.js';
import type {RequestInstance, SkillRequestResult} from './skill-request.js';

export type DispatchMode = 'cast' | 'channel' | 'charge' | 'perfect' | 'timed'
  | 'multitude' | 'guard' | 'overcharge' | 'concentration';

export interface DispatchInstance extends RequestInstance {
  readonly def: RequestInstance['def'] & {
    readonly tags: readonly string[];
    readonly useTime: number;
    readonly cooldown: number;
    readonly cooldownAt?: string;
    readonly color: string;
    readonly effects: readonly {readonly type: string}[];
    readonly comboChain?: {readonly skills: readonly string[]; readonly window: number};
    readonly reflex?: boolean;
    readonly guard?: unknown;
    readonly gauge?: unknown;
    readonly concentration?: FocusCastSpec;
    readonly chargeUp?: ChargeCastSpec;
    readonly delivery: RequestInstance['def']['delivery'] & {
      readonly strobe?: {readonly reservePct?: number};
    };
  };
  readonly hostSkillId?: string;
  state?: RequestInstance['state'] & {pressAt?: number};
}

export interface DispatchChannel extends ChannelCastSpec {
  move: 'normal' | 'slowed' | 'immobile';
  moveFactor?: number;
  intervalJitter?: [number, number];
}
/** New casts belong to the actor. Existing casts may carry additional host fields. */
export interface DispatchCast<I, Aim, Id = number> {
  inst: I;
  mode: DispatchMode;
  aim: Aim;
  elapsed: number;
  total: number;
  held: boolean;
  baseMult: number;
  targetInfo?: unknown;
  paidCost?: ResourceCost;
  chargesSpent?: number;
  quarryId?: Id;
  plantTotem?: boolean;
  plantChannel?: boolean;
  gather?: DispatchChannel;
  lockedAim?: Aim;
  stage?: number;
  sinceStage?: number;
  channelTime?: number;
  pulseTimer?: number;
  hitSpool?: number;
  shield?: number;
  maxShield?: number;
  indicatorAt?: number;
  presses?: number;
  sparkWindow?: number;
  ventRounds?: number;
}
export interface DispatchShell {
  side: 'front' | 'rear' | 'all';
  arcDeg: number;
  max: number;
  pool: number;
  regenDelay: number;
  regenRate: number;
  lastHitAt: number;
  broken: boolean;
  color: string;
  shellVisual?: string;
  fromAura?: string;
}
export interface DispatchActor<I, Aim, Facing, Id = number> {
  readonly construct?: unknown;
  readonly reserves?: ReadonlyMap<string, {cur: number; ventUntil: number; lastSpendAt: number}>;
  readonly reserveSpecs?: readonly AdmissionReserve[];
  readonly statuses: readonly {readonly id: string; readonly power?: number}[];
  readonly skills: readonly (I | null)[];
  readonly aiActionInsts?: ReadonlyMap<string, I>;
  readonly activeAuras: ReadonlyMap<string, unknown>;
  readonly summonToggles: ReadonlyMap<string, unknown>;
  readonly strobes: Map<string, {inst: I; timer: number; reserved: number}>;
  readonly hexToggles: Map<string, {inst: I; reserved: number}>;
  readonly cooldowns: Map<string, number>;
  readonly cooldownTotals: Map<string, number>;
  reservedMana: number;
  useLock: number;
  reflexLock: number;
  aimPos?: Aim | null;
  facing: Facing;
  casting: DispatchCast<I, Aim, Id> | null;
  shellGuard?: DispatchShell;
}
export interface DispatchZone<A, I> {
  readonly caster: A;
  readonly toggled?: boolean;
  readonly follow?: unknown;
  readonly inst: I;
}
export interface DispatchGather {
  readonly premium?: number;
  readonly decay?: number;
  readonly minRelease?: number;
  readonly minScale?: number;
  readonly maxScale?: number;
  readonly curve?: ChannelCurve;
}
export interface DispatchShellGraft {
  readonly side?: DispatchShell['side'];
  readonly arcDeg?: number;
  readonly max: number;
  readonly regenDelay?: number;
  readonly regenRate?: number;
  readonly color?: string;
  readonly shellVisual?: string;
}
export interface DispatchDelivery<Target> {
  targetInfo?: Target;
  dmgMult: number;
  paidCost?: ResourceCost;
  chargesSpent: number;
  repeat?: number;
  ventRounds?: number;
  primed?: true;
}
export type DispatchStat = 'castAsTotem' | 'totemPlaceTime' | 'channelPersist'
  | 'guardStrength' | 'effectDuration' | 'sparkWindow';

/** Trusted content and synchronous live ports. No request-wide snapshot is taken.
 * Redirects must re-enter the host's complete request entry. Exceptions propagate
 * with earlier mutations intact. The temporary scramble latch is cleared even
 * when a redirected host request throws; gameplay payments are not rolled back. */
export interface SkillDispatchPorts<A, I extends DispatchInstance, Aim, Facing, Target, Tags, Mods,
  Zone extends DispatchZone<A, I>, Id = number> {
  preflight(actor: A, inst: I, aim: Aim, seatPress: boolean): SkillRequestResult;
  time(): number;
  failNote(actor: A, key: string, text: string): void;
  canAct(actor: A): boolean;
  canUse(actor: A, inst: I): boolean;
  comboCursor(actor: A, inst: I): {comboAt?: number; comboIdx?: number; comboSelf?: number};
  definition(id: string): unknown;
  comboStep(actor: A, inst: I, index: number): I | null | undefined;
  dispatch(actor: A, inst: I, aim: Aim, seatPress?: boolean): boolean;
  /** Each call returns a fresh owned copy, preserving every host dimension. */
  copyAim(aim: Aim): Aim;
  facingTo(actor: A, aim: Aim): Facing;
  status(id: string): {readonly interruptChance?: number; readonly scrambleChance?: number;
    readonly label: string; readonly color: string} | undefined;
  random(): number;
  applyStatus(actor: A, id: string, dps: number, durationScale: number, sourceName: string): void;
  scrambleLatch(): boolean;
  setScrambleLatch(value: boolean): void;
  trigger(inst: I): unknown;
  feedback(actor: A, kind: 'scramble' | 'strobe-off' | 'hex-off' | 'hex-on', color: string): void;
  deactivateAura(actor: A, id: string): void;
  dismissSummon(actor: A, id: string): void;
  maxMana(actor: A): number;
  cost(actor: A, inst: I): ResourceCost;
  pay(actor: A, inst: I, cost: ResourceCost): void;
  curseOnHit(inst: I): {readonly reservePct?: number} | undefined;
  curseField(inst: I): {readonly mode: string} | undefined;
  /** Return the current live list on each call, including after expiry callbacks. */
  zones(): Zone[];
  expireZone(zone: Zone): void;
  castMode(inst: I): DispatchMode;
  tags(def: I['def']): Tags;
  modifiers(inst: I): Mods;
  stat(actor: A, key: DispatchStat, tags: Tags, modifiers: Mods, base?: number): number;
  useTime(actor: A, inst: I): number;
  targeting(inst: I): {readonly fallback?: string} | undefined;
  resolveTarget(actor: A, inst: I, aim: Aim): Target | null;
  lightweightCount(): number;
  promoteTarget(actor: A, aim: Aim, radius: number, max: number): readonly unknown[];
  useCharges(inst: I): UseChargeSpec | undefined;
  /** Resolve at request time: a host may initialize this service later. */
  ammunition(): AmmunitionPressPorts<A, I>;
  channel(inst: I): ChannelCastSpec | undefined;
  gather(inst: I): DispatchGather | undefined;
  speed(actor: A, inst: I): number;
  consumeCharges(actor: A, inst: I): {mult: number; consumed: number};
  spendGauge(actor: A, inst: I): number;
  stampCooldown(actor: A, inst: I, duration: number): void;
  opening(actor: A, inst: I, aim: Aim, multiplier: number): void;
  quarry(target: Target): {readonly id: Id} | undefined;
  guardCapacity(actor: A, inst: I): number;
  refreshGuard(actor: A, state: DispatchCast<I, Aim, Id>): void;
  guardRaised(actor: A, inst: I): void;
  shellGraft(inst: I): DispatchShellGraft | undefined;
  overcharge(inst: I): OverchargeCastSpec | undefined;
  strikeTiming(inst: I): StrikeTiming | undefined;
  assaultLock(actor: A, inst: I, aim: Aim): void;
  primedPourOpen(actor: A, inst: I): boolean;
  execute(actor: A, inst: I, aim: Aim, payload: DispatchDelivery<Target>): void;
  isReflex(actor: A, inst: I): boolean;
  reflexRecovery(): number;
}

function reserveCostOf(spec: AdmissionReserve, id: string): number {
  return Math.max(0, spec.costs?.[id] ?? spec.perCast ?? 0);
}

/** One simulation's complete request orchestration. Actual effects, target lookup
 * and updates of the resulting cast remain host operations. No per-call result
 * wrapper, actor snapshot, cache or database query is introduced. */
export class SkillDispatch<A extends DispatchActor<I, Aim, Facing, Id>, I extends DispatchInstance,
  Aim, Facing, Target, Tags, Mods, Zone extends DispatchZone<A, I>, Id = number> {
  readonly #ports: Readonly<SkillDispatchPorts<A, I, Aim, Facing, Target, Tags, Mods, Zone, Id>>;
  constructor(ports: SkillDispatchPorts<A, I, Aim, Facing, Target, Tags, Mods, Zone, Id>) {
    this.#ports = Object.freeze({...ports});
  }

  request(caster: A, inst: I, aim: Aim, seatPress = false): boolean {
      const p = this.#ports;
      const sdkRequestResult = p.preflight(caster, inst, aim, seatPress);
      if (sdkRequestResult !== 'continue')
          return sdkRequestResult;
      if (caster.reserves && caster.reserveSpecs) {
          let short = false;
          for (const spec of caster.reserveSpecs) {
              const cost = reserveCostOf(spec, inst.def.id);
              if (!cost)
                  continue;
              const st = caster.reserves.get(spec.id);
              if (!st || st.cur < cost || st.ventUntil > p.time()) {
                  short = true;
                  break;
              }
          }
          if (short) {
              p.failNote(caster, inst.def.id + ':reserve', 'nothing left');
              return false;
          }
          for (const spec of caster.reserveSpecs) {
              const cost = reserveCostOf(spec, inst.def.id);
              if (!cost)
                  continue;
              const st = caster.reserves.get(spec.id)!;
              st.cur = Math.max(0, st.cur - cost);
              st.lastSpendAt = p.time();
          }
      }
      const pierced = !p.canAct(caster);
      if (inst.def.comboChain?.skills.length) {
          const chain = inst.def.comboChain;
          const st = p.comboCursor(caster, inst);
          const fresh = st.comboAt !== undefined && p.time() - st.comboAt <= chain['window'];
          const idx = fresh ? (st.comboIdx ?? 0) : 0;
          if (idx > 0 && chain.skills[idx - 1] === inst.def.id) {
              st.comboSelf = idx;
          }
          else if (idx > 0 && p.definition(chain.skills[idx - 1])) {
              const step = p.comboStep(caster, inst, idx)!;
              const ok = p.dispatch(caster, step, aim);
              if (ok) {
                  st.comboAt = p.time();
                  st.comboIdx = idx + 1 > chain.skills.length ? 0 : idx + 1;
              }
              return ok;
          }
          else {
              st.comboIdx = 0;
              st.comboSelf = undefined;
          }
      }
      if (!caster.construct && !pierced)
          caster.aimPos = p.copyAim(aim);
      const def = inst.def;
      if (def.tags.includes('attack') || def.tags.includes('spell')) {
          for (const s of caster.statuses) {
              const sd = p.status(s.id);
              if (sd?.interruptChance && (p.random() < Math.min(0.9, sd.interruptChance * (s.power ?? 1)))) {
                  p.applyStatus(caster, 'stun', 0, 0.75, sd.label);
                  return false;
              }
          }
      }
      if (!p.scrambleLatch() && !inst.hostSkillId && !inst.state?.trigDepth
          && !def.reflex && (def.tags.includes('attack') || def.tags.includes('spell'))) {
          for (const s of caster.statuses) {
              const sd = p.status(s.id);
              if (!sd?.scrambleChance || !(p.random() < Math.min(0.9, sd.scrambleChance * (s.power ?? 1))))
                  continue;
              const pool: I[] = [];
              const admit = (k: I | null | undefined): void => {
                  if (!k || k === inst || k.def.id === def.id || k.def.reflex)
                      return;
                  if (!(k.def.tags.includes('attack') || k.def.tags.includes('spell')))
                      return;
                  if (p.trigger(k) !== undefined)
                      return;
                  if (k.def.delivery.type === 'aura')
                      return;
                  if (!p.canUse(caster, k))
                      return;
                  pool.push(k);
              };
              for (const k of caster.skills)
                  admit(k);
              if (caster.aiActionInsts)
                  for (const k of caster.aiActionInsts.values())
                      admit(k);
              if (pool.length) {
                  const sub = pool[Math.min(pool.length - 1, Math.floor((p.random() * pool.length)))];
                  p.feedback(caster, 'scramble', sd.color);
                  p.setScrambleLatch(true);
                      try {
                          return p.dispatch(caster, sub, aim, seatPress);
                      } finally {
                          p.setScrambleLatch(false);
                      }
              }
              break;
          }
      }
      if (def.delivery.type === 'aura' && def.delivery.mode === 'toggle'
          && caster.activeAuras.has(def.id)) {
          p.deactivateAura(caster, def.id);
          caster.useLock = 0.25;
          return true;
      }
      if (def.delivery.type === 'summon' && def.delivery.persistent?.toggle
          && caster.summonToggles.has(def.id)) {
          p.dismissSummon(caster, def.id);
          caster.useLock = 0.25;
          return true;
      }
      if (def.delivery.type === 'ground' && def.delivery.strobe) {
          const strobe = def.delivery.strobe;
          const held = caster.strobes.get(def.id);
          if (held) {
              if (!seatPress)
                  return false;
              caster.reservedMana = Math.max(0, caster.reservedMana - held.reserved);
              caster.strobes.delete(def.id);
              p.feedback(caster, 'strobe-off', def.color);
              caster.useLock = 0.25;
              return true;
          }
          const reserve = Math.round(p.maxMana(caster) * (strobe.reservePct ?? 0.2));
          if (caster.reservedMana + reserve > p.maxMana(caster)) {
              p.failNote(caster, def.id + ':reserve', 'mana locked');
              return false;
          }
          p.pay(caster, inst, p.cost(caster, inst));
          caster.reservedMana += reserve;
          caster.strobes.set(def.id, { inst, timer: 0.05, reserved: reserve });
          if (def.cooldown > 0) {
              caster.cooldowns.set(def.id, def.cooldown);
              caster.cooldownTotals.set(def.id, def.cooldown);
          }
          caster.useLock = 0.25;
          return true;
      }
      {
          const coh = p.curseOnHit(inst);
          if (coh) {
              const drawn = caster.hexToggles.get(def.id);
              if (drawn) {
                  if (!seatPress)
                      return false;
                  caster.reservedMana = Math.max(0, caster.reservedMana - drawn.reserved);
                  caster.hexToggles.delete(def.id);
                  p.feedback(caster, 'hex-off', def.color);
                  caster.useLock = 0.25;
                  return true;
              }
              const reserve = Math.round(p.maxMana(caster) * (coh.reservePct ?? 0.25));
              if (caster.reservedMana + reserve > p.maxMana(caster)) {
                  p.failNote(caster, def.id + ':reserve', 'mana locked');
                  return false;
              }
              p.pay(caster, inst, p.cost(caster, inst));
              caster.reservedMana += reserve;
              caster.hexToggles.set(def.id, { inst, reserved: reserve });
              p.feedback(caster, 'hex-on', def.color);
              caster.useLock = 0.25;
              return true;
          }
      }
      if (p.curseField(inst)?.mode === 'follow') {
          const zi = p.zones().findIndex(z => z.caster === caster && z.toggled && z.follow && z.inst.def.id === def.id);
          if (zi !== -1) {
              p.expireZone(p.zones()[zi]);
              p.zones().splice(zi, 1);
              caster.useLock = 0.25;
              return true;
          }
      }
      {
          const dt0 = def.delivery.type;
          const totemable = !['construct', 'aura', 'detonate', 'summon', 'mark', 'dash', 'blink', 'leap'].includes(dt0)
              && !(dt0 === 'self' && p.castMode(inst) !== 'guard');
          if (!caster.construct && totemable && !pierced
              && p.stat(caster, 'castAsTotem', p.tags(def), p.modifiers(inst)) > 0) {
              p.pay(caster, inst, p.cost(caster, inst));
              caster.facing = p.facingTo(caster, aim);
              const placeTime = Math.max(0.3, p.useTime(caster, inst)
                  * p.stat(caster, 'totemPlaceTime', p.tags(def), p.modifiers(inst)));
              caster.casting = {
                  inst, mode: 'cast', aim: p.copyAim(aim),
                  elapsed: 0, total: placeTime, held: true, baseMult: 1,
                  plantTotem: true,
              };
              return true;
          }
      }
      let targetInfo: Target | null = null;
      const targetSpec = p.curseField(inst) ? undefined : p.targeting(inst);
      if (targetSpec) {
          targetInfo = p.resolveTarget(caster, inst, aim);
          if (!targetInfo && p.lightweightCount()
              && def.effects.some(f => f.type === 'grabSeize')) {
              const stood = p.promoteTarget(caster, aim, 90, 1);
              if (stood.length)
                  targetInfo = p.resolveTarget(caster, inst, aim);
          }
          if (!targetInfo && targetSpec.fallback !== 'aim') {
              p.failNote(caster, def.id + ':notarget', 'no valid target');
              return false;
          }
      }
      if (!pierced)
          caster.facing = p.facingTo(caster, aim);
      const mode = p.castMode(inst);
      const useCharges = p.useCharges(inst);
      const { bankSteps, roundMult, ventRounds } = commitAmmunitionPress(caster, inst, useCharges, p.ammunition());
      if (def.comboChain?.skills.length) {
          const st = p.comboCursor(caster, inst);
          st.comboAt = p.time();
          const next = (st.comboSelf ?? 0) + 1;
          st.comboIdx = next > def.comboChain.skills.length ? 0 : next;
          st.comboSelf = undefined;
      }
      const chan = p.channel(inst);
      if (mode === 'channel' && chan && !caster.construct
          && p.stat(caster, 'channelPersist', p.tags(def), p.modifiers(inst)) > 0) {
          p.pay(caster, inst, p.cost(caster, inst));
          caster.facing = p.facingTo(caster, aim);
          caster.casting = {
              inst, mode: 'cast', aim: p.copyAim(aim),
              elapsed: 0, total: Math.max(0.45, p.useTime(caster, inst) || 0.6),
              held: true, baseMult: 1,
              plantChannel: true,
          };
          return true;
      }
      let gather: DispatchChannel | undefined;
      if (mode === 'cast' && !def.concentration && def.useTime >= 0.3) {
          const g = p.gather(inst);
          if (g) {
              gather = {
                  interval: 0.4, move: 'slowed', moveFactor: 0.5, windup: 0.2,
                  release: { pulses: false },
                  brim: {
                      fillTime: Math.max(0.5, def.useTime * (g.premium ?? 1.5)),
                      decay: g.decay,
                      minRelease: g.minRelease ?? 0.15,
                      minScale: g.minScale ?? 0.25,
                      maxScale: g.maxScale ?? 1,
                      curve: g.curve,
                  },
              };
          }
      }
      if (gather || (mode === 'channel' && chan)) {
          const chSpec = gather ?? chan!;
          const total = channelInterval(chSpec.interval, p.speed(caster, inst));
          const cc = p.consumeCharges(caster, inst);
          caster.casting = {
              inst, mode: 'channel', aim: p.copyAim(aim),
              elapsed: 0,
              total,
              held: true,
              baseMult: cc.mult * roundMult,
              chargesSpent: cc.consumed,
              targetInfo: targetInfo ?? undefined,
              lockedAim: p.copyAim(aim),
              hitSpool: 0,
              channelTime: 0,
              pulseTimer: chSpec.windup !== undefined
                  ? channelWindup(chSpec.windup, p.speed(caster, inst))
                  : total,
              gather,
          };
          return true;
      }
      const cost = p.cost(caster, inst);
      p.pay(caster, inst, cost);
      const gPower = def.gauge ? p.spendGauge(caster, inst) : 1;
      const paid = caster.construct ? undefined : cost;
      (inst.state ??= {}).pressAt = p.time();
      if (def.cooldown > 0 && def.cooldownAt === 'press'
          && !p.useCharges(inst)?.magazine) {
          p.stampCooldown(caster, inst, def.cooldown);
      }
      const cc = p.consumeCharges(caster, inst);
      const baseMult = cc.mult * roundMult * gPower;
      p.opening(caster, inst, aim, baseMult);
      if (def.concentration) {
          if (!(targetInfo && p.quarry(targetInfo))) {
              p.failNote(caster, def.id + ':noquarry', 'no quarry held');
              return false;
          }
          caster.casting = {
              inst, mode: 'concentration', aim: p.copyAim(aim),
              elapsed: 0,
              total: focusCastDuration(def.concentration.time, p.speed(caster, inst)),
              held: true, baseMult,
              chargesSpent: cc.consumed,
              targetInfo: targetInfo ?? undefined,
              paidCost: paid,
              quarryId: p.quarry(targetInfo)!.id,
          };
          return true;
      }
      if (mode === 'guard' && def.guard) {
          const maxShield = p.guardCapacity(caster, inst);
          caster.casting = {
              inst, mode, aim: p.copyAim(aim),
              elapsed: 0, total: 1, held: true, baseMult,
              shield: maxShield, maxShield,
              channelTime: 0,
          };
          p.refreshGuard(caster, caster.casting);
          p.guardRaised(caster, inst);
          const graft = p.shellGraft(inst);
          if (graft) {
              const gs = p.stat(caster, 'guardStrength', p.tags(def), p.modifiers(inst));
              const gmax = graft.max * gs;
              caster.shellGuard = {
                  side: graft.side ?? 'rear', arcDeg: graft.arcDeg ?? 200,
                  max: gmax, pool: gmax,
                  regenDelay: graft.regenDelay ?? 4,
                  regenRate: graft.regenRate ?? gmax / 5,
                  lastHitAt: -999, broken: false,
                  color: graft.color ?? def.color, shellVisual: graft.shellVisual,
                  fromAura: def.id,
              };
          }
          return true;
      }
      if (mode === 'charge' && def.chargeUp) {
          caster.casting = {
              inst, mode, aim: p.copyAim(aim),
              elapsed: 0,
              total: chargeCastDuration(def.chargeUp.maxTime, p.stat(caster, 'effectDuration', p.tags(def), p.modifiers(inst))),
              held: true, baseMult,
              chargesSpent: cc.consumed,
              targetInfo: targetInfo ?? undefined,
              paidCost: paid,
          };
          return true;
      }
      {
          const ocSpec = p.overcharge(inst);
          if (ocSpec && !pierced && (mode === 'cast' || mode === 'perfect' || mode === 'timed'
              || mode === 'overcharge')) {
              const tags = p.tags(def);
              const extra = p.modifiers(inst);
              const timing = p.strikeTiming(inst);
              caster.casting = {
                  inst, mode: 'overcharge', aim: p.copyAim(aim),
                  elapsed: 0,
                  total: overchargeCastDuration(ocSpec.time, def.useTime, p.speed(caster, inst)),
                  held: true, baseMult,
                  chargesSpent: cc.consumed,
                  targetInfo: targetInfo ?? undefined,
                  paidCost: paid,
                  stage: 0, sinceStage: 999, channelTime: 0,
                  indicatorAt: timing?.kind === 'timed' ? overchargeMarker(p.random()) : undefined,
                  sparkWindow: p.stat(caster, 'sparkWindow', tags, extra, ocSpec['window'] ?? 0),
              };
              return true;
          }
      }
      const timing = p.strikeTiming(inst);
      const effMode = mode === 'cast' && timing && !pierced ? timing.kind : mode;
      const castTime = p.useTime(caster, inst);
      const ordinaryDuration = effMode === 'cast' ? castDuration(castTime) : undefined;
      p.assaultLock(caster, inst, aim);
      if (ordinaryDuration === 0) {
          const primed = p.primedPourOpen(caster, inst);
          const reflexFacing = caster.facing;
          p.execute(caster, inst, aim, {
              targetInfo: targetInfo ?? undefined, dmgMult: baseMult, paidCost: paid,
              chargesSpent: cc.consumed,
              repeat: bankSteps,
              ventRounds,
              primed: primed || undefined,
          });
          if (pierced)
              caster.facing = reflexFacing;
          if (pierced && p.isReflex(caster, inst))
              caster.reflexLock = p.reflexRecovery();
          else
              caster.useLock = 0.12;
          return true;
      }
      caster.casting = {
          inst, mode: effMode, aim: p.copyAim(aim),
          elapsed: 0, total: ordinaryDuration ?? Math.max(0.2, castTime),
          held: true, baseMult,
          chargesSpent: cc.consumed,
          targetInfo: targetInfo ?? undefined,
          indicatorAt: effMode === 'timed' ? (0.3 + p.random() * (0.85 - 0.3)) : undefined,
          presses: effMode === 'multitude' ? 1 : undefined,
          paidCost: paid,
          ventRounds,
      };
      return true;
  }
}
