import type {HitEffectActor, HitEffectFrame, HitEffectInput, HitEffectPorts, HitEffectSet, HitEffectSkill} from './hit-effects-types.js';
export type * from './hit-effects-types.js';

/** Synchronous ordered dispatch over borrowed records. The host runs its
 * before-effects hook before calling dispatch. Exceptions retain earlier writes. */
export function createHitEffects<
  A extends HitEffectActor<A, P, M, Tag, Status>, I, S extends HitEffectSkill<Tag>,
  P, Direction, M, Tag extends string, Status extends {id: string},
  E extends HitEffectSet, Other extends string,
  Frame extends HitEffectFrame<A, I, S, M, Tag>,
>(ports: HitEffectPorts<A, I, P, Direction, M, Tag, Status, E, Other, Frame>) {
  function dispatch(frame: Frame, damageMultiplier: number, delivery?: readonly HitEffectInput<E, Other>[]): void {
    const {caster, target, inst, def, tags, extra, durScale, dealt, depth} = frame;
    const effects = ports.effects(inst);
    // The unmerged list is live; delivery additions require the original snapshot.
    for (const effect of delivery?.length ? [...effects, ...delivery] : effects) {
      // Each discriminator establishes its row. The casts preserve the caller's
      // richer payload type without copying or changing the authored object.
      switch (effect.type) {
        case 'heal': {
          const fx = effect as E['heal'];
          if (target.team === caster.team && !(fx.excludeCaster && target === caster))
            ports.heal(caster, inst, target, fx, damageMultiplier);
          break;
        }
        case 'cleanse': {
          const fx = effect as E['cleanse'];
          if (target.team === caster.team) ports.cleanse(target, fx.count ?? 2);
          break;
        }
        case 'buff': {
          const fx = effect as E['buff'];
          if (target.team === caster.team && target !== caster) {
            ports.buff(caster, target, inst, fx, durScale);
            if (fx.bond) caster.bond = {targetId: target.id, buffId: fx.id};
          }
          break;
        }
        case 'rupture': {
          const fx = effect as E['rupture'];
          ports.rupture(caster, target, fx.status, fx.fraction, fx.mul ?? 1, tags, extra);
          break;
        }
        case 'status': ports.status(frame, effect as E['status']); break;
        case 'knockback': {
          const fx = effect as E['knockback'];
          const buffet = fx.mode === 'buffet' || caster.sheet.get('knockBuffet', tags, extra) > 0;
          const direction = buffet ? ports.randomDirection() : ports.direction(caster.pos, target.pos);
          ports.push(target, direction, fx.strength, caster, inst);
          break;
        }
        case 'grabSeize': ports.grab(caster, inst, target, effect as E['grabSeize']); break;
        case 'possess': ports.possess(caster, inst, target, effect as E['possess']); break;
        case 'pull': {
          const fx = effect as E['pull'];
          if (!target.construct && !target.anchored && !target.leap && !ports.dormant(target)) {
            const gap = Math.max(0, ports.distance(caster.pos, target.pos) - caster.radius - target.radius - 12);
            if (gap > 0) ports.push(target, ports.direction(target.pos, caster.pos), gap, caster, inst);
            if (fx.stun) target.applyStatus('stun', 0, fx.stun * durScale, def.name);
          }
          break;
        }
        case 'absorb': {
          const fx = effect as E['absorb'];
          ports.absorb(target, ports.absorbAmount(caster, inst, fx.amount), fx.duration * durScale);
          break;
        }
        case 'restore': ports.restore(target, effect as E['restore'], {tags: def.tags}); break;
        case 'ward': {
          const fx = effect as E['ward'];
          if (fx.onHit && dealt > 0 && !caster.dead) caster.gainWard(fx.amount);
          else if (!fx.onHit && target.team === caster.team) target.gainWard(fx.amount);
          break;
        }
        case 'siphonOrb': {
          const fx = effect as E['siphonOrb'];
          if (dealt > 0 && depth === 0 && !caster.construct) {
            ports.orb(fx.resource, target.pos, {
              scatter: 8, amount: fx.amount, life: 8, homeTo: caster.owner ?? caster,
              clamp: false, flowFromTier: target.tier ?? 0,
            });
          }
          break;
        }
        case 'birth': {
          const fx = effect as E['birth'];
          if (fx.onHit && dealt > 0 && depth === 0 && !caster.dead)
            ports.birth(caster, inst, fx, ports.copyPosition(target.pos), {host: true});
          break;
        }
        case 'spreadStatus': {
          const fx = effect as E['spreadStatus'];
          if (!target.dead || target.statuses.length) {
            const radius = fx.radius * caster.sheet.get('aoeRadius', tags, extra);
            const carried = target.statuses.filter(s => !fx.statuses || fx.statuses.includes(s.id));
            if (carried.length) {
              let spread = 0;
              const cap = fx.maxTargets ?? 8;
              for (const actor of ports.enemies(caster)) {
                if (!ports.sameStory(actor, target)) continue;
                if (actor === target || spread >= cap) continue;
                if (ports.distance(target.pos, actor.pos) - actor.radius > radius) continue;
                for (const status of carried) ports.transplant(actor, status, def.name, fx);
                spread++;
              }
              if (spread > 0) ports.flash(ports.copyPosition(target.pos), radius, def.color, .3);
            }
          }
          break;
        }
        case 'transfuseStatus': {
          const fx = effect as E['transfuseStatus'];
          const donors = caster.statuses.filter(s => !fx.statuses || fx.statuses.includes(s.id));
          if (donors.length) {
            const victims: A[] = [target];
            if (fx.splash) {
              const splash = fx.splash * caster.sheet.get('aoeRadius', tags, extra);
              for (const actor of ports.enemies(caster)) {
                if (!ports.sameStory(actor, target)) continue;
                if (actor !== target && ports.distance(target.pos, actor.pos) - actor.radius <= splash) victims.push(actor);
              }
            }
            for (const victim of victims) for (const status of donors) ports.transplant(victim, status, def.name, fx);
            for (const status of donors) {
              const at = caster.statuses.indexOf(status);
              if (at >= 0) {
                caster.statuses.splice(at, 1);
                caster.sheet.removeSource('status:' + status.id);
              }
            }
            ports.flash(ports.copyPosition(target.pos), fx.splash ?? 60, def.color, .3);
          } else ports.fail(caster, def.id + ':clean', 'nothing to pour');
          break;
        }
      }
    }
  }
  return {dispatch};
}
