import type {HitSustainActor, HitSustainPorts, HitSustainSkill} from './hit-sustain-types.js';
export type * from './hit-sustain-types.js';

/** Reusable sustain rules over captured hit values and live borrowed state.
 * Nested calls own their locals; exceptions retain preceding host/state writes. */
export function createHitSustain<
  A extends HitSustainActor<P, M, Tag>, S extends HitSustainSkill<Cue>,
  P, M, Tag extends string, Cue,
>(ports: HitSustainPorts<A, S, P, Tag, Cue>) {
  function apply(caster: A, target: A, def: S, extra: readonly M[], dealt: number, depth: number): void {
    if (dealt > 0 && def.siphon && !caster.dead) {
      const gained = caster.healBy(dealt * def.siphon
        * caster.sheet.get('healPower', ports.tags(def), extra));
      ports.resourceFlow(caster, target, gained, def.feedingCue);
    }
    if (dealt > 0 && depth === 0 && !caster.dead) {
      const vamp = caster.sheet.get('vampiricShare', ports.tags(def), extra);
      if (vamp > 0) {
        const heal = dealt * vamp * caster.sheet.get('healPower', ports.tags(def), extra);
        for (const ally of ports.actors()) {
          if (!ports.sameStory(ally, caster)) continue;
          if (ally.dead || ally.team !== caster.team || ally === caster) continue;
          if (ports.distance(caster.pos, ally.pos) > ports.sharingRadius) continue;
          const got = ally.healBy(heal);
          ports.resourceFlow(ally, target, got, def.feedingCue);
          if (got > 0.5) ports.sharedHealingCue(ally, got);
        }
      }
      if (caster.bond) {
        const bonded = ports.actors().find(a => a.id === caster.bond!.targetId);
        if (!bonded || bonded.dead || !bonded.buffs.has(caster.bond.buffId)) {
          caster.bond = undefined;
        } else {
          const share = caster.sheet.get('bondShare', ports.tags(def), extra);
          if (share > 0) {
            const got = bonded.healBy(dealt * share * (def.bondFeed ?? 1)
              * caster.sheet.get('healPower', ports.tags(def), extra));
            if (got > 0.5) ports.bondedHealingCue(bonded, got);
          }
        }
      }
    }
    if (dealt > 0 && depth === 0) {
      for (const tree of ports.actors()) {
        if (!ports.sameStory(tree, target)) continue;
        const burst = tree.construct?.healBurst;
        if (!burst || tree.dead || tree.team !== caster.team) continue;
        if (ports.distance(tree.pos, target.pos) > tree.construct!.range) continue;
        tree.construct!.stored = Math.min(burst.cap, (tree.construct!.stored ?? 0) + dealt);
        tree.radius = (tree.construct!.baseRadius ?? tree.radius)
          * (1 + 0.6 * (tree.construct!.stored / burst.cap));
      }
    }
  }
  return {apply};
}
