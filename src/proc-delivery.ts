import {scaleProcEffect} from './proc-effects.js';
import type {DeliveryBuff, ProcDeliveryActor, ProcDeliveryDefinition, ProcDeliveryEffect, ProcDeliveryPorts} from './proc-delivery-types.js';
export type * from './proc-delivery-types.js';

/** Default census for an array-backed host. Array.filter captures length and
 * skips holes. Match that visitation without allocating an array of matches. */
export function countProcSummons<Owner>(
  actors: readonly {readonly owner?: Owner | null; readonly dead: boolean; readonly sourceSkillId?: string}[], owner: Owner, key: string,
): number {
  let count = 0;
  for (let i = 0, end = actors.length; i < end; i++) {
    if (!(i in actors)) continue;
    const actor = actors[i];
    if (actor.owner === owner && !actor.dead && actor.sourceSkillId === key) count++;
  }
  return count;
}

export function createProcDelivery<I extends NonNullable<unknown>, P, Direction, B extends DeliveryBuff, Birth, Damage extends string, Lifeline,
  A extends ProcDeliveryActor<A, I, P, B, Damage, Lifeline>, Def extends ProcDeliveryDefinition<B, Birth, Damage>>(
  ports: ProcDeliveryPorts<A, I, P, Direction, B, Birth, Damage, Lifeline, Def>,
) {
  function execute(proc: Def, caster: A, instance: I | null, target: A | null, depth = 0, aim?: P): void {
    const power = ports.stat(caster, 'procPower_' + proc.id, instance);
    // The fold's public result promises only magnitude fields. Every required
    // field of this closed execution grammar survives its branch-specific copy.
    const fx = scaleProcEffect(proc.effect, power) as ProcDeliveryEffect<B, Birth, Damage>;
    const cue = proc.procCue === false || proc.announceName === false ? false
      : {profile: 'mend', color: proc.color, ...proc.procCue};
    const kind = fx.type;
    switch (kind) {
      case 'gainCharge': {
        const before = caster.charges.get(fx.charge) ?? 0;
        caster.gainCharge(fx.charge, fx.amount, fx.max, instance ?? undefined, depth + 1);
        if ((caster.charges.get(fx.charge) ?? 0) > before) ports.cue(caster, cue, 'gain', proc.id);
        break;
      }
      case 'buff': {
        const stored = fx.buff.storedCue ?? (cue === false ? false
          : {...ports.buffCue(fx.buff), color: proc.color, ...proc.procCue});
        caster.addBuff(ports.withStoredCue(fx.buff, stored), ports.stat(caster, 'effectDuration', instance), depth + 1);
        if (caster.buffs.has(fx.buff.id)) ports.cue(caster, stored, 'gain', proc.id);
        break;
      }
      case 'status': ports.status(fx, proc.name, caster, instance, target); break;
      case 'heal': if (ports.heal(caster, fx)) ports.cue(caster, cue, 'gain', proc.id); break;
      case 'restore': if (ports.restore(caster, fx)) ports.cue(caster, cue, 'gain', proc.id); break;
      case 'cooldown': if (ports.cooldown(caster, fx, instance)) ports.cue(caster, cue, 'gain', proc.id); break;
      case 'ward': if (ports.ward(caster, fx)) ports.cue(caster, cue, 'gain', proc.id); break;
      case 'delayedBurst': ports.delayed(caster, fx, proc.color, depth, target); break;
      case 'burst': {
        const damage = fx.base + fx.perLevel * Math.max(0, caster.level - 1);
        ports.flash(ports.copyPosition(caster.pos), fx.radius, proc.color, 0.3);
        ports.strikeSurfaces(caster, caster.pos, fx.radius);
        for (const enemy of ports.enemies(caster)) {
          if (!ports.sameStory(caster, enemy) || enemy.dead || enemy.untargetable) continue;
          if (ports.distance(caster.pos, enemy.pos) - enemy.radius > fx.radius) continue;
          const landed = ports.mitigate(enemy, fx.damage, damage);
          if (landed <= 0 || enemy.invulnerable) continue;
          enemy.life -= landed;
          enemy.hitFlash = 0.15;
          enemy.hitFlashType = fx.damage;
          ports.text(enemy.pos, Math.round(landed).toString(), proc.color, 12);
          if (enemy.esBroke) {
            enemy.esBroke = false;
            ports.shieldBreak(enemy, depth + 1);
          }
          ports.sweepDefenses(enemy, depth + 1);
          if (enemy.life <= 0 && !enemy.dead) ports.kill(enemy);
        }
        break;
      }
      case 'fortify': {
        const banked = caster.gainEndurance((fx.flat ?? 0) + (fx.pctMaxLife ?? 0) * caster.maxLife());
        if (banked > 0) ports.flash(ports.copyPosition(caster.pos), caster.radius + 8, proc.color, 0.2);
        break;
      }
      case 'removeBuff':
        if (typeof fx.buff === 'string') caster.removeBuff(fx.buff);
        else for (const id of fx.buff) caster.removeBuff(id);
        break;
      case 'cleanse': {
        const before = caster.statuses.length;
        const ids = new Set(fx.statuses);
        for (const status of caster.statuses) {
          const def = ports.statusDefinition(status.id);
          if (!def) continue;
          if ((fx.hardCC && def.hardCC) || (fx.afflictions && def.dotType)) ids.add(status.id);
        }
        for (const id of ids) caster.endStatus(id);
        if (caster.statuses.length < before) ports.cue(caster, cue, 'release', proc.id);
        break;
      }
      case 'kindle': {
        const at = (target ?? caster).pos;
        ports.lightwell(fx.kind, ports.copyPosition(at));
        break;
      }
      case 'vent': {
        const at = (target ?? caster).pos;
        ports.vent({bank: fx.bank, radius: fx.radius, duration: fx.duration}, ports.copyPosition(at), 1, ports.stat(caster, 'effectDuration'), caster.tier);
        break;
      }
      case 'cast': ports.cast(caster, instance, target, depth + 1, fx.cast, aim); break;
      case 'extraHit':
      case 'collisionDamage':
        if (instance != null && target) {
          ports.flash(ports.copyPosition(target.pos), target.radius + (kind === 'extraHit' ? 8 : 10), proc.color, 0.2);
          ports.hit(caster, instance, target, fx.damageScale, depth + 1);
        }
        break;
      case 'explosion':
        if (instance != null && target) {
          ports.flash(ports.copyPosition(target.pos), fx.radius, proc.color, 0.3);
          ports.strikeSurfaces(caster, target.pos, fx.radius);
          for (const enemy of ports.enemies(caster)) {
            if (ports.sameStory(target, enemy) && ports.distance(target.pos, enemy.pos) - enemy.radius <= fx.radius)
              ports.hit(caster, instance, enemy, fx.damageScale, depth + 1);
          }
        }
        break;
      case 'arc': {
        if (instance == null || !target) break;
        const struck = new Set<A>([target]);
        let from = target;
        for (let hop = 0; hop < fx.hops; hop++) {
          let best: A | null = null, nearest = fx.range;
          for (const enemy of ports.enemies(caster)) {
            if (!ports.sameStory(caster, enemy) || enemy.dead || enemy.untargetable || struck.has(enemy)) continue;
            const distance = ports.distance(from.pos, enemy.pos);
            if (distance <= nearest) {nearest = distance; best = enemy;}
          }
          if (!best) break;
          ports.arcTrail(from, best, proc);
          struck.add(best);
          ports.hit(caster, instance, best, fx.damageScale, depth + 1);
          from = best;
        }
        break;
      }
      case 'displace':
        if (target) {
          ports.flash(ports.copyPosition(target.pos), 60, proc.color, 0.25);
          const direction = fx.force > 0 ? ports.direction(caster.pos, target.pos) : ports.direction(target.pos, caster.pos);
          ports.push(target, direction, Math.abs(fx.force));
        }
        break;
      case 'summon': {
        if (!target) break;
        const key = '__proc:' + proc.id, owner = caster.owner ?? caster;
        if (ports.summonCount(owner, key) >= fx.max) break;
        const summon = ports.createMonster(fx.monsterId, owner);
        summon.sourceSkillId = key;
        summon.lifelineId = ports.lifeline(owner);
        if (instance != null) {
          summon.summonInst = instance;
          ports.forwardSockets(instance, summon);
        }
        summon.lifespan = fx.duration * ports.stat(owner, 'effectDuration', instance);
        ports.placeSummon(summon, target, 30);
        ports.publishSummon(summon);
        break;
      }
      case 'birth': {
        const owner = caster.owner ?? caster;
        const site = fx.at === 'self' || !target ? owner : target;
        ports.birth(owner, fx.birth, ports.copyPosition(site.pos), !!target && site === target, '__proc:' + proc.id);
        break;
      }
      default: fx satisfies never;
    }
    // Ordinary refusals reach riders. Exceptions preserve earlier effects and
    // leave this invocation before its rider tail.
    ports.riders(proc, caster, instance, target, depth);
  }
  return {execute};
}
