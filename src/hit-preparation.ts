import type {HitPreparationActor, HitPreparationAmounts, HitPreparationPorts, HitPreparationSkill} from './hit-preparation-types.js';
export type * from './hit-preparation-types.js';

/** Ordered preparation and early interception. No rollback, ambient clock or
 * shared scratch frame. The queue and all actor/skill records belong to the host. */
export function createHitPreparation<
  A extends HitPreparationActor<A, P, M, Tag>,
  I extends {def: S; procChainDepth?: number}, S extends HitPreparationSkill<Tag>,
  P, M, Tag extends string, Packet extends {amounts: HitPreparationAmounts}, Tone, Effect, R,
>(ports: HitPreparationPorts<A, I, S, P, M, Tag, Packet, Tone, Effect, R>) {
  function prepare(
    caster: A, inst: I, target: A, dmgMult = 1, depth = 0,
    flatBonus?: HitPreparationAmounts, forceDamage = false, fromFuse = false,
    hitEffects?: Effect[], hitOrigin?: P, hitTier?: number,
  ): R | undefined {
    depth = Math.max(depth, inst.procChainDepth ?? 0);
    // This definition deliberately precedes target-specific instance replacement.
    const def = inst.def;
    if (!fromFuse) {
      const fuse = ports.fuse(inst);
      if (fuse) {
        const tags = ports.instanceTags(inst);
        ports.fuseQueue().push({
          kind: 'hit', due: ports.time() + fuse.delay * caster.sheet.get('fuseDelay', tags, ports.modifiers(inst)),
          caster, inst, targetId: target.id, mult: dmgMult, depth,
          flat: flatBonus, force: forceDamage, hitEffects,
          hitOrigin: ports.copyPosition(hitOrigin ?? caster.pos), hitTier: hitTier ?? caster.tier,
        });
        ports.fuseCue(target, def, fuse);
        target.segHitPending = undefined;
        return;
      }
    }
    ports.combat(caster, target);
    if (caster.possession?.guiseFaction && !caster.possession.guiseBroken && target !== caster) {
      caster.possession.guiseBroken = true;
      ports.guiseCue(caster);
    }
    inst = ports.forTarget(caster, inst, target, depth);
    const extra = ports.modifiers(inst);
    {
      const noise = caster.sheet.get('noiseOnHit', ports.definitionTags(def), extra);
      if (noise > 0) ports.noise(target.pos, noise, caster);
    }
    if (def.shatterStatus) {
      let shattered = false;
      let consumedStacks = 0;
      for (let i = target.statuses.length - 1; i >= 0; i--) {
        const status = target.statuses[i];
        if (!def.shatterStatus.statuses.includes(status.id)) continue;
        consumedStacks += status.stacks;
        target.statuses.splice(i, 1);
        target.sheet.removeSource('status:' + status.id);
        shattered = true;
      }
      if (shattered) {
        dmgMult *= def.shatterStatus.perStack
          ? 1 + (def.shatterStatus.mult - 1) * consumedStacks
          : def.shatterStatus.mult;
        ports.shatterCue(target);
      }
    }
    if ((ports.concealed(caster, ports.time()) || caster.sheet.get('invisible') > 0)
      && target.aiTargetId !== caster.id && target.team !== caster.team && ports.time() >= target.alertUntil) {
      const ambush = caster.sheet.get('ambushBonus', ports.definitionTags(def), extra);
      if (ambush > 0) {
        dmgMult *= 1 + ambush;
        ports.ambushCue(target);
      }
    }
    let rearHit = false;
    if (def.backstabMult && def.backstabMult > 1) {
      if (Math.abs(ports.rearAngle(target, caster)) > 2.0) {
        dmgMult *= def.backstabMult;
        rearHit = true;
      }
    }
    {
      const proximity = caster.sheet.get('proximityDamage', ports.definitionTags(def), extra);
      if (proximity > 0) {
        const near = 1 - Math.min(1, ports.distance(caster.pos, target.pos) / ports.proximityRadius());
        if (near > 0) dmgMult *= 1 + proximity * near;
      }
    }
    if (target.construct?.breakable && target.owner === caster) {
      const breakable = target.construct.breakable;
      const affinity = breakable.affinityTags?.some(tag => def.tags.includes(tag)) ? (breakable.affinityMult ?? 2) : 1;
      dmgMult *= breakable.ownerMult * affinity;
    }
    const vs = ports.victimScopeArmed(caster, extra) ? ports.victimTags(target, caster, ports.time()) : undefined;
    const packet = ports.roll(caster, inst, flatBonus, vs);
    if (dmgMult !== 1) for (const type of Object.keys(packet.amounts)) packet.amounts[type]! *= dmgMult;
    const struckTone = target.tune ? ports.tone(packet.amounts) : null;
    let afflictionCarry = 0;
    {
      const fraction = Math.min(1, Math.max(0, caster.sheet.get('hitToAffliction', ports.instanceTags(inst), extra)));
      if (fraction > 0) {
        let forgone = 0;
        for (const type of Object.keys(packet.amounts)) {
          const cut = packet.amounts[type]! * fraction;
          packet.amounts[type]! -= cut;
          forgone += cut;
        }
        afflictionCarry = forgone * caster.sheet.get('afflictionYield', ports.instanceTags(inst), extra);
      }
    }
    const raw = Object.values(packet.amounts).reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (raw > 0 && ports.guard(target, caster, caster.pos, raw)) return;
    if (raw > 0 && ports.shell(target, caster.pos, packet, caster)) return;
    return ports.continue(caster, inst, target, dmgMult, depth, forceDamage, hitEffects, hitOrigin, hitTier,
      def, extra, packet, rearHit, struckTone, afflictionCarry);
  }
  return {prepare};
}
