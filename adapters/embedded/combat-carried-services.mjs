import {createCarriedEffects} from '../../dist/carried-effects.js';

export function installCombatCarried(w, content) {
  const carried = createCarriedEffects(content.carried);
  w.carried = carried;
  const advance = dt => {
    const context = w.carriedEffectContext();
    carried.satellites.update(w.actors, dt, context);
    carried.auroras.update(w.actors, dt, context);
    carried.guardians.update(w.actors, dt, context);
    carried.creepers.update(w.actors, dt, {...context,
      move: (actor, from, goal, radius, distance) => {
        if (distance <= 0) return {...from};
        const field = w.host.space.pathField?.(actor.tier);
        const toward = field?.pathStep && !(field.lineWalkable?.(from, goal) ?? false)
          ? field.pathStep(from, goal) ?? from : goal;
        const length = Math.hypot(toward.x - from.x, toward.y - from.y);
        const scale = Math.min(1, distance / Math.max(1e-9, length));
        const to = w.clampPos({x: from.x + (toward.x - from.x) * scale,
          y: from.y + (toward.y - from.y) * scale}, radius, from, {tier: actor.tier});
        return Math.hypot(to.x - from.x, to.y - from.y) <= distance + 1e-6
          && w.lineOfSight(from, to, actor.tier, actor.tier) ? to : {...from};
      },
    });
  };
  return Object.freeze({carried, advance});
}
