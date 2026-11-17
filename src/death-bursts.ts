import {angleDiff, angleTo, dist, type CombatPoint} from './combat-geometry.js';
import {isBurstTarget} from './combat-target-policy.js';
import type {DamageAmounts, DamagePacket, DamageType, HitResult} from './damage-pipeline-types.js';
import type {Modifier} from './types.js';

export interface DeathBurstDefinition {
  mode: 'implode' | 'orb'; damageFrac: number; damageType?: DamageType;
  radius?: number; color?: string; coalesce?: number; orbDuration?: number;
  orbSpeed?: number; orbTurn?: number; detonateOnContact?: boolean;
  contactFuse?: number; contactRadius?: number;
}
export interface DeathBurst {
  phase: 'gather' | 'orb'; mode: 'implode' | 'orb'; pos: CombatPoint;
  team: string; tier?: number; dmg: number; radius: number; type: DamageType;
  color: string; t: number; coalesce: number; life: number; armAt: number;
  speed: number; turn: number; dir: number; trail: CombatPoint[];
  arming: boolean; contact: boolean; stuck: boolean; contactFuse: number; contactRadius: number;
}
export interface BurstActor {
  pos: CombatPoint; tier: number; radius: number; team: string; name: string;
  dead: boolean; downed: boolean; untargetable: boolean; invulnerable: boolean;
  life: number; hitFlash: number; hitFlashType?: DamageType; explodeOnDeath: number;
  deathBurst?: DeathBurstDefinition; summonInst?: {def: {name: string}};
  maxLife(): number; sheet: {get(stat: string, tags?: Set<string>): number};
}
/** These services bind the shared SDK damage/death controllers. Spatial facts
 * and optional scenery reactions belong to the host; neither decides damage. */
export interface DeathBurstPorts<A> {
  actors(): readonly A[]; seats(): readonly A[]; hostile(a: A, b: A, tier?: number): boolean;
  readonly preserveLayers?: boolean;
  clamp(at: CombatPoint, radius: number, from?: CombatPoint): CombatPoint;
  convert(actor: A, amounts: DamageAmounts, tags: Set<string>): void;
  hit(source: A, target: A, packet: DamagePacket<Modifier, string>): HitResult;
  mitigate(actor: A, amounts: DamageAmounts, options: {out: {clamped?: boolean}}): number;
  kill(actor: A, silent: false, source?: A): void;
  text(at: CombatPoint, text: string, color: string, size: number): void;
  damageText?(actor: A, amount: number, color: string, size: number): void;
  flash(at: CombatPoint, radius: number, color: string, life: number,
    extra?: {tier: number; recoveryCue?: string; visual?: string}): void;
  outcome(actor: A, kind: 'hit_cap' | 'culled', at: CombatPoint): void;
  indirectDamage?(actor: A, source: A | undefined, before: number): void;
  surfaces?(at: CombatPoint, radius: number, amounts: DamageAmounts, tier?: number): void;
}

/** Baked death payloads outlive their actor. A single clock preserves the
 * original gather/orb boundary, swept contact and reverse retirement order. */
export class DeathBursts<A extends BurstActor> {
  constructor(readonly pending: DeathBurst[], readonly rules: {
    baseMoveSpeed: number; colors: Readonly<Record<DamageType, string>>;
  }, readonly ports: DeathBurstPorts<A>) {}

  explode(actor: A, fraction: number, options?: {type?: DamageType; color?: string; recoveryCue?: string; visual?: string}): void {
    const type = options?.type ?? 'fire';
    const damage = actor.maxLife() * fraction * actor.sheet.get('damage', new Set(['aoe', type]));
    this.damage({...actor.pos}, 45 + actor.radius * 2, damage, type,
      options?.color ?? this.rules.colors[type], actor.team, actor.tier, actor, options?.recoveryCue, options?.visual);
  }

  damage(at: CombatPoint, radius: number, damage: number, type: DamageType,
    color: string, team: string, tier = 0, source?: A, recoveryCue?: string, visual?: string): void {
    const p = this.ports;
    for (const target of p.actors()) {
      if (!isBurstTarget(target, team, tier) || (source && !(p.preserveLayers ? p.hostile(source, target, tier) : p.hostile(source, target)))) continue;
      if (dist(at, target.pos) - target.radius > radius) continue;
      const out: {clamped?: boolean} = {};
      const packet: DamagePacket<Modifier, string> = {
        amounts: {[type]: damage}, crit: false, tags: new Set(['aoe', type]),
        sourceName: source?.summonInst?.def.name ?? source?.name ?? 'Explosion',
      };
      if (source) p.convert(source, packet.amounts, packet.tags);
      const before = target.life;
      const result = source ? p.hit(source, target, packet) : undefined;
      p.indirectDamage?.(target, source, before);
      const taken = result ? result.total : p.mitigate(target, packet.amounts, {out});
      if (!source) { target.life -= taken; target.hitFlash = .15; target.hitFlashType = type; }
      if (p.damageText) p.damageText(target, taken, color, 14);
      else p.text(target.pos, Math.round(taken).toString(), color, 14);
      if (out.clamped || result?.clamped) p.outcome(target, 'hit_cap', at);
      if (result?.culled) p.outcome(target, 'culled', at);
      if (target.life <= 0 && !target.dead) p.kill(target, false, source);
    }
    p.flash({...at}, radius, color, .35, p.preserveLayers || recoveryCue || visual ? {tier, recoveryCue, visual} : undefined);
    if (p.preserveLayers) p.surfaces?.(at, radius, {[type]: damage}, tier);
    else p.surfaces?.(at, radius, {[type]: damage});
  }

  resolve(actor: A): DeathBurstDefinition | null {
    if (actor.deathBurst) return actor.deathBurst;
    return actor.explodeOnDeath > 0 ? {mode: 'implode', damageFrac: actor.explodeOnDeath, coalesce: .8} : null;
  }

  spawn(actor: A, config: DeathBurstDefinition): void {
    const type = config.damageType ?? 'fire', duration = actor.sheet.get('effectDuration');
    const life = (config.orbDuration ?? 2.6) * duration;
    this.pending.push({
      phase: 'gather', mode: config.mode, pos: {...actor.pos}, team: actor.team, tier: actor.tier,
      dmg: actor.maxLife() * config.damageFrac, radius: config.radius ?? (45 + actor.radius * 2),
      type, color: config.color ?? this.rules.colors[type], t: 0, coalesce: (config.coalesce ?? .8) * duration,
      life, armAt: life * .25, speed: Math.min(config.orbSpeed ?? 110, this.rules.baseMoveSpeed * .75),
      turn: config.orbTurn ?? 2, dir: 0, trail: [], arming: false,
      contact: config.detonateOnContact ?? false, stuck: false,
      contactFuse: config.contactFuse ?? .3, contactRadius: config.contactRadius ?? 12,
    });
  }

  private nearestSeat(at: CombatPoint): CombatPoint | null {
    let best: CombatPoint | null = null, distance = Infinity;
    for (const actor of this.ports.seats()) {
      if (actor.dead || actor.downed) continue;
      const d = dist(at, actor.pos);
      if (d < distance) { distance = d; best = {...actor.pos}; }
    }
    return best;
  }

  private contact(at: CombatPoint, team: string, tier: number, radius: number): boolean {
    for (const actor of this.ports.actors()) {
      if (isBurstTarget(actor, team, tier) && dist(at, actor.pos) <= radius + actor.radius) return true;
    }
    return false;
  }

  advance(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Death-burst time must be finite and nonnegative');
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const burst = this.pending[i];
      burst.t += dt;
      if (burst.phase === 'gather') {
        if (burst.t < burst.coalesce) continue;
        this.ports.flash({...burst.pos}, burst.radius * .4, burst.color, .35);
        if (burst.mode === 'implode') {
          this.damage(burst.pos, burst.radius, burst.dmg, burst.type, burst.color, burst.team, burst.tier);
          this.pending.splice(i, 1);
        } else {
          burst.phase = 'orb'; burst.t = 0;
          const target = this.nearestSeat(burst.pos);
          burst.dir = target ? angleTo(burst.pos, target) : 0;
        }
        continue;
      }
      burst.life -= dt;
      if (!burst.stuck) {
        const target = this.nearestSeat(burst.pos);
        if (target) {
          const diff = angleDiff(burst.dir, angleTo(burst.pos, target));
          burst.dir += Math.sign(diff) * Math.min(Math.abs(diff), burst.turn * dt);
        }
        const want = {x: burst.pos.x + Math.cos(burst.dir) * burst.speed * dt,
          y: burst.pos.y + Math.sin(burst.dir) * burst.speed * dt};
        if (burst.contact) {
          const next = this.ports.clamp(want, 8, burst.pos);
          if (dist(next, want) > .5 || this.contact(next, burst.team, burst.tier ?? 0, burst.contactRadius)) {
            burst.stuck = true; burst.life = Math.min(burst.life, burst.contactFuse);
          }
          burst.pos = next;
        } else burst.pos = this.ports.clamp(want, 8);
        burst.trail.unshift({...burst.pos});
        if (burst.trail.length > 3) burst.trail.pop();
      }
      burst.arming = burst.stuck || burst.life <= burst.armAt;
      if (burst.life <= 0) {
        this.damage(burst.pos, burst.radius, burst.dmg, burst.type, burst.color, burst.team, burst.tier);
        this.pending.splice(i, 1);
      }
    }
  }
}
