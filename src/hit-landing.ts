import type {HitLandingActor, HitLandingPacket, HitLandingPorts, HitLandingResult, HitLandingSkill} from './hit-landing-types.js';
export type * from './hit-landing-types.js';

/** Ordered landing reactions over borrowed state. Errors propagate after existing
 * writes; nested hits own their locals. No per-hit wrapper or shared scratch. */
export function createHitLanding<
  A extends HitLandingActor<P>, I, S extends HitLandingSkill, P, M, Tag extends string,
  Packet extends HitLandingPacket<Tag>, Tone, Effect, Result extends HitLandingResult, R,
>(ports: HitLandingPorts<A, I, S, P, M, Tag, Packet, Tone, Effect, Result, R>) {
  function land(
    caster: A, inst: I, target: A, dmgMult: number, depth: number,
    forceDamage: boolean, hitEffects: Effect[] | undefined,
    hitOrigin: P | undefined, hitTier: number | undefined,
    def: S, extra: M[], packet: Packet, rearHit: boolean,
    struckTone: Tone | null, afflictionCarry: number,
  ): R | undefined {
    const hasDamage = forceDamage || def.effects.some(effect => effect.type === 'damage');
    let dealt = 0;
    let wasCrit = false;
    let landedResult: Result | undefined;
    if (hasDamage) {
      if (target === ports.player()) ports.bindDeeds();
      const deedLifeBefore = target.life;
      const deedHidden = caster === ports.player() && (caster.sheet.get('invisible') > 0
        || ports.concealed(caster, ports.time()) || caster.sheet.get('detectability') < 1);
      const deedPanicked = caster === ports.player() && target.isPanicked();
      ports.assault(caster, packet, depth);
      const result = ports.applyHit(caster, target, packet);
      landedResult = result;
      if (caster === ports.player() && target === caster) {
        ports.recordSelfDamage(caster, Math.max(0, deedLifeBefore - Math.max(0, target.life)));
      }
      wasCrit = result.crit;
      if (ports.metaActive()) {
        if (target === ports.player() && ports.deedEnemy(caster)) {
          if (result.evaded) ports.recordDeed({kind: 'evade'});
          if (result.blocked && (result.blockedAmount ?? 0) > 0) ports.recordDeed({kind: 'block', value: result.blockedAmount});
          const lost = ports.trackHurt(deedLifeBefore, target);
          if (lost > 0) ports.recordDeed({kind: 'hurt', value: lost});
        }
        if (deedLifeBefore > 0 && ports.deedEnemy(target) && ports.deedOwned(caster)) {
          if (result.poiseBroke) ports.recordDeed({kind: 'poise', subject: target,
            flags: target.life > 0 ? ['surviving'] : []});
          if (caster === ports.player() && result.total > 0 && !result.blocked && !result.immune && !result.evaded) {
            const elements = ['fire', 'cold', 'lightning'].filter(type => (result.receivedAmounts ?? packet.amounts)[type]! > 0);
            ports.recordDeed({kind: 'hit', tags: [...packet.tags], distance: ports.distance(caster.pos, target.pos), keys: elements,
              flags: [...elements, ...(wasCrit ? ['crit'] : []), ...(target.life <= 0 ? ['lethal'] : []),
                ...(deedHidden ? ['hidden'] : []), ...(deedPanicked ? ['panicked'] : [])]});
          }
        }
      }
      if (result.evaded) {
        ports.evadeCue(target, caster);
        const mend = target.sheet.get('lifeOnEvade');
        if (mend > 0) target.healBy(mend);
        target.noteRecent('evade');
        target.spendBuffs('evade');
        ports.ownProcs(target, 'evade', {depth});
        ports.ownProcs(caster, 'miss', {tags: packet.tags, extra, inst, target, depth});
        return;
      }
      if (result.blocked) {
        ports.blockCue(target, caster);
        ports.thorns(target, caster);
        if (depth === 0) ports.blockCharges(target);
        const mend = target.sheet.get('lifeOnBlock');
        if (mend > 0) target.healBy(mend);
        target.noteRecent('block');
        target.spendBuffs('block');
        ports.ownProcs(target, 'block', {depth});
        ports.ownProcs(caster, 'foiled', {tags: packet.tags, extra, inst, target, depth});
        ports.blockTriggers(target, caster);
        if (target.life <= 0 && !target.dead) ports.kill(target, false, caster);
        return;
      }
      if (result.immune) {
        ports.immuneCue(target, caster);
        ports.knockFixtures(caster, target, struckTone, false, inst);
        return;
      }
      if (target.kind === 'player' && caster.team === 'enemy') {
        ports.refreshMimic(target, ports.time());
        if (target.mimicWatch && ports.captureMimic(target, caster, def)) ports.capturedArtCue(def);
      }
      dealt = result.total;
      if (rearHit && dealt > 0 && def.backstabCue !== false) ports.rearCue(target, caster, def);
      if (result.receivedAmounts) ports.ownProcs(target, 'struck', {
        depth, target: caster, crit: wasCrit, receivedAmounts: result.receivedAmounts,
      });
      if (dealt > 0) {
        caster.noteRecent('hit');
        target.noteRecent('hurt');
        if (wasCrit) { caster.noteRecent('crit'); target.noteRecent('critHurt'); }
        ports.ownProcs(target, 'hurt', {depth, target: caster, crit: wasCrit, receivedAmounts: result.receivedAmounts});
      }
      if (dealt > 0) {
        for (const [type, amount] of Object.entries(packet.amounts)) ports.bankPool(caster, type, amount ?? 0);
      }
    }
    return ports.continue(caster, inst, target, dmgMult, depth, forceDamage, hitEffects, hitOrigin, hitTier,
      def, extra, packet, rearHit, struckTone, afflictionCarry, hasDamage, dealt, wasCrit, landedResult);
  }
  return {land};
}
