import type {HitReactionActor, HitReactionInstance, HitReactionPacket, HitReactionPorts, HitReactionResult} from './hit-reactions-types.js';
export type * from './hit-reactions-types.js';

/** Complete ordered reaction phase for an admitted damaging contact. Zero landed
 * damage still reaches stamps, fragile buffs and charges. No shared hit scratch,
 * copied actor state or implicit rollback; nested calls own their locals. */
export function createHitReactions<
  A extends HitReactionActor<P, M, Tag, Item, Brain, Watch>, I extends HitReactionInstance,
  S, P, M, Tag extends string, Item, Brain, Watch, Spill,
  Packet extends HitReactionPacket<Tag>, Result extends HitReactionResult,
>(ports: HitReactionPorts<A, I, S, P, M, Tag, Item, Brain, Watch, Spill, Result>) {
  function apply(caster: A, inst: I, target: A, def: S, extra: M[], packet: Packet,
    dealt: number, depth: number, wasCrit: boolean, result: Result,
    hitOrigin?: P, hitTier?: number): void {
    caster.lastCombatAt = ports.time();
    target.lastCombatAt = ports.time();
    target.aiHitAt = ports.time();
    target.aiHitById = caster.id;
    const evidence = hitOrigin ?? (depth > 0 ? target.pos : caster.pos);
    if (ports.hostileTo(target, caster)) {
      target.alertUntil = Math.max(target.alertUntil,
        ports.time() + ports.woundSearchSeconds * ports.alertScale(target));
      target.alertFrom = ports.copyPoint(evidence);
      target.alertTier = hitTier ?? caster.tier;
    }
    if (target.team !== caster.team) {
      caster.lastFoeAt = ports.time();
      caster.lastFoeId = target.id;
    }
    ports.bumpDrives(target, 'onHurt');
    ports.bumpDrives(caster, 'onDealt');
    if (target.lootSack?.length && ports.time() - target.lastSpillAt > 0.4) {
      target.lastSpillAt = ports.time();
      const item = target.lootSack.pop()!;
      ports.spillLoot(target, item);
    }
    if (dealt > 0 && target.defId) {
      const spill = ports.essenceSpill(target.defId);
      if (spill) ports.bankEssenceSpill(target, spill, dealt);
    }
    if (dealt > 0) {
      target.recentHurt = 0;
      ports.releasePrimedPours(target);
    }
    if (target.brain && dealt > 0) {
      const tw = target.aiTuning?.target?.threat?.damage
        ?? ports.baseThreatWeight(target.brain) ?? 1;
      if (tw > 0) {
        const gen = caster.sheet.get('threatGen', ports.tags(def), ports.instanceMods(inst));
        if (gen > 0) target.addThreat(caster.id, dealt * tw * gen);
      }
    }
    for (const [bid, b] of target.buffs) {
      if ((b.def as {clearOnHit?: boolean}).clearOnHit) target.removeBuff(bid);
    }
    if (depth === 0) {
      ports.tapCharges(caster, 'hit', target);
      ports.tapCharges(target, 'takeHit', caster);
      if (ports.orbCount() < ports.orbCap && !target.construct) {
        for (const id of ports.orbKeys()) {
          const c = target.sheet.get(ports.orbOnHurtStat(id)) * target.sheet.get('orbShedRate');
          if (c > 0 && ports.chance(Math.min(0.5, c))) {
            ports.shedOrb(id, target.pos, {scatter: 24, tier: target.tier});
          }
        }
      }
      if (caster.casting?.mode === 'channel') {
        caster.casting.hitSpool = (caster.casting.hitSpool ?? 0) + 1;
      }
    }
    ports.rouseOnWound(target);
    if (target.ambushArmed) ports.springAmbush(target);
    if (ports.isStealthed(caster) && target.team !== caster.team) {
      target.alertUntil = Math.max(target.alertUntil, ports.time() + 6 * ports.alertScale(target));
      target.alertFrom = ports.copyPoint(evidence); target.alertTier = hitTier ?? caster.tier;
      for (const a of ports.actors()) {
        if (a.dead || a.team !== target.team || a === target) continue;
        if (ports.distance(a.pos, target.pos) > 320) continue;
        a.alertUntil = Math.max(a.alertUntil, ports.time() + 4 * ports.alertScale(a));
        if (!a.alertFrom) { a.alertFrom = ports.copyPoint(evidence); a.alertTier = hitTier ?? caster.tier; }
      }
    }
    if (target.watch && target.team !== caster.team && !target.aggroed && target !== caster) {
      target.alertUntil = Math.max(target.alertUntil, ports.time() + 5 * ports.alertScale(target));
      target.alertFrom = ports.copyPoint(evidence); target.alertTier = hitTier ?? caster.tier;
      ports.feedWatch(target, target.watch, ports.time(), 1, ports.watchSearchRung);
      if (target.watchAt) ports.assignWatchPoint(target, evidence);
      else target.watchAt = ports.copyPoint(evidence);
      target.watchRung = Math.max(target.watchRung,
        ports.watchRung(ports.watchValue(target, target.watch, ports.time())));
    }
    if (target === ports.player() && ports.player().life > 0
      && ports.player().life < ports.player().maxLife() * ports.player().lowLifeLine()) {
      ports.lowLifeFlash(ports.lowLifeFlashSeconds);
    }
    ports.damageCue(target, dealt, result);
    if (result.culled) ports.outcomeCue(target, 'culled', evidence);
    if (result.clamped) ports.outcomeCue(target, 'hit_cap', evidence);
    if (result.poiseBroke) ports.ownProcs(caster, 'poiseBreakDealt', {tags: packet.tags, extra, inst, target, depth});
    if (target.esBroke) {
      target.esBroke = false;
      ports.ownProcs(target, 'esBreak', {depth});
    }
    ports.sweepDefenseEvents(target, depth);
    if (wasCrit) {
      ports.rollTriggers(caster, 'crit', {depth: inst.state?.trigDepth ?? 0,
        aim: ports.aimPoint(target), sourceInst: inst});
    }
    if (packet.rollT !== undefined) {
      ports.rollTriggers(caster, 'highRoll', {depth: inst.state?.trigDepth ?? 0,
        aim: ports.aimPoint(target), sourceInst: inst, rollT: packet.rollT});
    }
    if (dealt > 0) ports.bankDamageTakenTriggers(target, dealt, caster);
  }
  return {apply};
}
