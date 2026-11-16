import {dist, inAoe, type CombatPoint} from './combat-geometry.js';
import type {BurstActor, DeathBursts} from './death-bursts.js';
import type {DamageType} from './damage-pipeline-types.js';
import type {Modifier} from './types.js';

export interface DeathSkill {def: {id: string; name: string; hivecall?: unknown; throng?: unknown}}
export interface DeathAura<I> {
  inst: I; radius: number; shape: number;
  spec: {deathSpawn?: {chance: number; maxActive: number; monsterId: string; duration?: number}};
}
export interface DeathCorpse {pos: CombatPoint; defId: string; level: number; maxLife: number; remaining: number; tier?: number}
export interface DeathActor<A, I extends DeathSkill, U, Action> extends BurstActor {
  id: number; level: number; facing: number; color: string; defId?: string; noBounty: boolean;
  owner?: A; sourceSkillId?: string; summonInst?: I;
  possession?: {seatId: string}; vacated?: {seatId: string}; doorId?: string;
  companion: boolean; companionReviveDwell: number; casting: unknown; aiCommand?: unknown;
  partLink?: unknown; partActors?: A[]; garrison?: unknown; worm?: {hittable?: boolean};
  construct?: {breakable?: boolean; burstFired?: boolean;
    deathBurst?: {radius: number; damageScale?: number; fraction?: number; damageType?: DamageType};
    healBurst?: {cap: number; ratio: number; radius: number}; stored?: number; hatch?: {onBreak?: string}};
  deathHealPct: number; deathHealFlat: number; undyingTime: number; undyingSpent: boolean; lifespan: number;
  summonShell?: boolean; summonShells?: Set<A>; summonDeathActions?: Action[];
  summonToggles: Map<string, unknown>; activeAuras: Map<string, U>; lifelineId?: number;
  isMinion(): boolean; healBy(amount: number): number;
  sheet: {get(stat: string, tags?: Set<string>, modifiers?: Modifier[]): number};
}

/** Optional observers receive combat outcomes, never permission to pay, cast,
 * or retire combat state. Quests, drops, world events and general AI can install
 * these independently; the combat package imports none of those systems. */
export interface CombatDeathObservers<A> {
  begin?(actor: A, silent: boolean): void;
  beforeClutch?(actor: A, credit: boolean): void;
  retired?(actor: A, silent: boolean): void;
  death?(actor: A, killer: A | undefined, silent: boolean): void;
  enemyKilled?(actor: A, killer: A | undefined, credit: boolean): void;
}
export interface CombatDeathPorts<A, I, U, S, Action, Bash> {
  actors(): A[]; seats(): readonly {id: string; actor: A}[]; random(): number;
  immortal(id: string): boolean; leavesRemains(id: string): boolean;
  breakDoor(id: string): void; eject(seat: {id: string; actor: A}, reason: 'bodyDied' | 'huskDying'): void;
  breakPart(actor: A, killer?: A): void; releaseGarrison(actor: A): void;
  tags(skill: I): Set<string>; modifiers(skill: I): Modifier[];
  bashSpec(skill: I): Bash | undefined; bash(actor: A, skill: I, spec: Bash & {arcDeg: number}, pool: number): void;
  enemies(actor: A): Iterable<A>;
  hit(caster: A, skill: I, target: A, multiplier: number, depth: 1, delta: undefined, secondary: true): void;
  heal(caster: A, skill: I, target: A, effect: {amount: number}): void;
  statuses: {
    capturePropagation(actor: A, silent: boolean): S[];
    detonateDeathStatuses(actor: A, silent: boolean): void;
    propagateDeathStatuses(actor: A, statuses: readonly S[], silent: boolean): void;
  };
  bonds: {down(actor: A): void}; clutch: {onDeath(actor: A): void};
  minionDeath(owner: A, body: A): void; guard: {clear(actor: A): void};
  carried: readonly {retire(actor: A): void}[];
  hiveDeath(actor: A): void; throngMinimum(owner: A, skill: I): void; throngKill(actor: A, killer?: A): void;
  retireAura(actor: A, skillId: string): void;
  deathActions(actor: A, actions: readonly Action[]): void;
  playerDown(actor: A, killer?: A): void;
  createMonster(id: string, level: number, team: string, owner: A): A;
  minionsOfSkill(owner: A, skillId: string): readonly A[]; lifeline(owner: A): number | undefined;
  clamp(at: CombatPoint, radius: number): CombatPoint; emerge(actor: A): void;
  hatch(actor: A): void; releaseContract(actor: A, respawn: true): void; dismissToggle(actor: A, skillId: string): void;
  tapCharges(actor: A, event: 'enemyDeath' | 'allyDeath', at?: CombatPoint): void;
  presence(actor: A, phase: 'expire' | 'break'): void;
  cue(actor: A, kind: 'weak-points' | 'companion-down' | 'part-death' | 'worm-death' | 'undying' | 'death', parent?: A): void;
  flash(at: CombatPoint, radius: number, color: string, life: number): void;
  text(at: CombatPoint, text: string, color: string, size: number): void;
  observers?: CombatDeathObservers<A>;
}

/** Ordered combat death over the shared actor graph. Controllers are borrowed
 * SDK services; the public combat owner supplies their bindings. Silent expiry
 * is deliberately different from a kill. Death can reenter through effects,
 * and consumed payloads are cleared before dispatch exactly as in the source. */
export class CombatDeath<
  A extends DeathActor<A, I, U, Action>, I extends DeathSkill,
  U extends DeathAura<I>, S, Action, Bash extends object,
> {
  constructor(readonly state: {corpses: DeathCorpse[]; strikeReleaseBodies: Map<A, Set<A>>},
    readonly rules: {corpseDuration: number; corpseMax: number},
    readonly bursts: Pick<DeathBursts<A>, 'damage' | 'explode' | 'resolve' | 'spawn'>,
    readonly ports: CombatDeathPorts<A, I, U, S, Action, Bash>) {}

  kill(actor: A, silent = false, killer?: A, departure?: 'expire'): void {
    if (actor.dead || actor.downed) return;
    const p = this.ports;
    if (!silent) p.cue(actor, 'weak-points');
    p.observers?.begin?.(actor, silent);
    if (actor.construct && actor.summonInst) {
      const bash = p.bashSpec(actor.summonInst);
      if (bash) p.bash(actor, actor.summonInst, {...bash, arcDeg: 360}, killer ? actor.maxLife() : Math.max(0, actor.life));
    }
    if (actor.defId && p.immortal(actor.defId)) { actor.life = actor.maxLife(); return; }
    if (actor.doorId) { p.breakDoor(actor.doorId); return; }
    if (actor.possession) {
      const seat = p.seats().find(s => s.id === actor.possession!.seatId);
      if (seat && seat.actor === actor) p.eject(seat, 'bodyDied');
    } else if (actor.vacated) {
      const seat = p.seats().find(s => s.id === actor.vacated!.seatId);
      if (seat && seat.actor !== actor) p.eject(seat, 'huskDying');
    }
    if (actor.companion && !silent) {
      actor.downed = true; actor.life = 0; actor.casting = null;
      actor.aiCommand = undefined; actor.companionReviveDwell = 0;
      p.bonds.down(actor); p.cue(actor, 'companion-down'); return;
    }
    if (actor.partLink) { p.breakPart(actor, killer); return; }
    if (actor.partActors?.length) {
      for (const part of actor.partActors) {
        if (part.dead) continue;
        part.dead = true; part.partLink = undefined; p.cue(part, 'part-death', actor);
      }
      actor.partActors.length = 0;
    }
    if (actor.garrison) p.releaseGarrison(actor);
    if (actor.worm?.hittable && !silent) p.cue(actor, 'worm-death');
    this.constructBurst(actor);
    const propagation = p.statuses.capturePropagation(actor, silent);
    p.statuses.detonateDeathStatuses(actor, silent);
    this.constructHeal(actor);
    const credit = !killer || killer.team === 'player';
    p.observers?.beforeClutch?.(actor, credit);
    p.clutch.onDeath(actor);
    if (!silent && actor.isMinion() && actor.owner && !actor.owner.dead) p.minionDeath(actor.owner, actor);
    if (!silent && actor.isMinion() && actor.owner && (actor.deathHealPct > 0 || actor.deathHealFlat > 0)) {
      const amount = actor.maxLife() * actor.deathHealPct + actor.deathHealFlat;
      for (const body of p.actors()) {
        if (body.dead || body === actor || body.owner !== actor.owner || body.construct) continue;
        const got = body.healBy(amount);
        if (got > .5) p.text(body.pos, '+' + Math.round(got), '#8ae0a8', 10);
      }
      p.flash({...actor.pos}, 70, '#8ae0a8', .3);
    }
    if (!silent && actor.isMinion() && actor.undyingTime > 0 && !actor.undyingSpent) {
      actor.undyingSpent = true;
      if (actor.explodeOnDeath > 0) {
        this.bursts.explode(actor, actor.explodeOnDeath); actor.explodeOnDeath = 0;
      }
      actor.life = Math.max(1, actor.maxLife() * .25); actor.lifespan = actor.undyingTime;
      p.cue(actor, 'undying'); return;
    }
    actor.dead = true;
    p.presence(actor, departure ?? (silent ? 'expire' : 'break'));
    p.guard.clear(actor);
    if (actor.owner) this.state.strikeReleaseBodies.get(actor.owner)?.delete(actor);
    for (const controller of p.carried) controller.retire(actor);
    p.observers?.retired?.(actor, silent);
    if (!silent && actor.summonInst?.def.hivecall) p.hiveDeath(actor);
    if (!silent && actor.owner && actor.summonInst?.def.throng) p.throngMinimum(actor.owner, actor.summonInst);
    if (actor.summonShell) actor.owner?.summonShells?.delete(actor);
    // Snapshot keys because retirement dispatch can reenter and mutate the map.
    for (const id of [...actor.activeAuras.keys()]) p.retireAura(actor, id);
    p.observers?.death?.(actor, killer, silent);
    if (!silent && actor.summonDeathActions?.length) p.deathActions(actor, [...actor.summonDeathActions]);
    if (p.seats().some(s => s.actor === actor)) { p.playerDown(actor, killer); return; }
    if (!silent) this.auraBirths(actor);
    if (!silent) {
      const config = this.bursts.resolve(actor);
      if (config) {
        if (actor.team === 'enemy' && !actor.isMinion() && !actor.construct) this.bursts.spawn(actor, config);
        else this.bursts.explode(actor, config.damageFrac, {type: config.damageType, color: config.color});
      }
    }
    if (!silent && actor.construct?.hatch?.onBreak === 'hatch') p.hatch(actor);
    if (!silent && actor.isMinion()) p.releaseContract(actor, true);
    for (const id of [...actor.summonToggles.keys()]) p.dismissToggle(actor, id);
    if (!silent) {
      for (const body of p.actors()) {
        if (body.dead || body.construct || body.team === actor.team) continue;
        p.tapCharges(body, 'enemyDeath', actor.pos);
      }
      if (actor.isMinion() && actor.owner && !actor.owner.dead) p.tapCharges(actor.owner, 'allyDeath');
    }
    p.statuses.propagateDeathStatuses(actor, propagation, silent);
    if (!silent && actor.team === 'enemy') {
      if (credit) p.throngKill(actor, killer);
      p.observers?.enemyKilled?.(actor, killer, credit);
      if (actor.defId && p.leavesRemains(actor.defId)) {
        this.state.corpses.push({pos: {...actor.pos}, defId: actor.defId, level: actor.level,
          maxLife: actor.maxLife(), remaining: this.rules.corpseDuration, tier: actor.tier});
        if (this.state.corpses.length > this.rules.corpseMax) this.state.corpses.shift();
      }
    }
    p.cue(actor, 'death');
  }

  private constructBurst(actor: A): void {
    const burst = actor.construct?.deathBurst, p = this.ports;
    if (!burst || actor.construct!.burstFired) return;
    actor.construct!.burstFired = true;
    const owner = actor.owner ?? actor, source = actor.summonInst;
    const radius = burst.radius * (source && !owner.dead ? owner.sheet.get('aoeRadius', p.tags(source), p.modifiers(source)) : 1);
    p.flash({...actor.pos}, radius, actor.color, .3);
    if (burst.damageScale && source && !owner.dead) {
      for (const target of p.enemies(owner)) {
        if (target === actor || (target.construct?.breakable && target.owner === owner)) continue;
        if ((actor.tier ?? 0) !== (target.tier ?? 0)) continue;
        if (dist(actor.pos, target.pos) - target.radius > radius) continue;
        p.hit(owner, source, target, burst.damageScale, 1, undefined, true);
      }
    } else if (burst.fraction) {
      // Source deliberately defaults this ownerless blast to ground tier.
      this.bursts.damage({...actor.pos}, radius, actor.maxLife() * burst.fraction,
        burst.damageType ?? 'physical', actor.color, actor.team);
    }
  }

  private constructHeal(actor: A): void {
    const heal = actor.construct?.healBurst, source = actor.summonInst, p = this.ports;
    if (!heal || !source) return;
    actor.construct!.healBurst = undefined;
    const amount = Math.min(heal.cap, actor.construct!.stored ?? 0) * heal.ratio;
    if (amount <= 0) return;
    const owner = actor.owner ?? actor;
    p.flash({...actor.pos}, heal.radius, '#7ec88a', .4);
    for (const body of p.actors()) {
      if (body.dead || body.team !== actor.team || body.construct || body.untargetable) continue;
      if (dist(actor.pos, body.pos) - body.radius > heal.radius) continue;
      p.heal(owner, source, body, {amount});
    }
  }

  private auraBirths(actor: A): void {
    const p = this.ports;
    for (const bearer of p.actors()) {
      if (bearer.dead || bearer.team === actor.team) continue;
      for (const aura of bearer.activeAuras.values()) {
        const spawn = aura.spec.deathSpawn;
        if (!spawn || !(p.random() < spawn.chance)) continue;
        if (!inAoe(bearer.pos, aura.radius, aura.shape, bearer.facing, actor.pos, actor.radius)) continue;
        const owner = bearer.owner ?? bearer, skillId = aura.inst.def.id;
        if (p.minionsOfSkill(owner, skillId).length >= spawn.maxActive) continue;
        const body = p.createMonster(spawn.monsterId, owner.level, owner.team, owner);
        body.sourceSkillId = skillId; body.lifelineId = p.lifeline(owner);
        if (spawn.duration) body.lifespan = spawn.duration;
        body.pos = p.clamp({...actor.pos}, body.radius);
        p.actors().push(body); p.emerge(body);
      }
    }
  }
}
