import assert from 'node:assert/strict';

// name, source section, unique original text, deliberate fault, focused course.
export const procDeliveryFaults = [
  ['power-fold', 'executeProc', 'scaleProcEffect(proc.effect, pw)', 'scaleProcEffect(proc.effect, 1)', 'power-skill-context'],
  ['power-context', 'executeProc', 'inst ? skillContextTags(inst) : undefined, inst ? instanceMods(inst) : undefined);', 'undefined, undefined);', 'power-skill-context'],
  ['cue-disable', 'executeProc', 'proc.procCue === false || proc.announceName === false', 'proc.procCue === false && proc.announceName === false', 'heal-cue-disabled'],
  ['rider-tail', 'executeProc', 'this.fireProcRiders(proc, caster, inst, target, depth);', '', 'extraHit-missing-instance'],
  ['charge-depth', 'gainCharge', 'inst ?? undefined, depth + 1', 'inst ?? undefined, depth', 'authored-bloodletters_rhythm'],
  ['charge-capped-cue', 'gainCharge', '> procCueBefore', '>= procCueBefore', 'gainCharge-capped'],
  ['buff-stored-false', 'buff', 'fx.buff.storedCue ??', 'fx.buff.storedCue ||', 'buff-stored-cue-disabled'],
  ['buff-duration', 'buff', "caster.sheet.get('effectDuration',", "0 * caster.sheet.get('effectDuration',", 'buff-scaled-duration'],
  ['status-attribution', 'status', 'casterId: caster.id', 'casterId: target.id', 'authored-ruptured_veins'],
  ['heal-amount', 'heal', '(fx.flat ?? 0)', '2 * (fx.flat ?? 0)', 'authored-parasite_sip'],
  ['restore-amount', 'restore', 'caster.gainEs(amount)', 'caster.gainEs(amount * .5)', 'authored-mind_like_water'],
  ['burst-level', 'burst', 'Math.max(0, caster.level - 1)', 'Math.max(0, caster.level)', 'burst-shield-break'],
  ['burst-captured-level', 'burst', '{ [fx.damage]: dmg }', '{ [fx.damage]: fx.base + fx.perLevel * Math.max(0, caster.level - 1) }', 'burst-captured-level'],
  ['burst-radius-edge', 'burst', '- enemy.radius > fx.radius', '- enemy.radius >= fx.radius', 'burst-edge'],
  ['burst-surface', 'burst', 'this.strikeSurfaces(caster, caster.pos, fx.radius);', '', 'burst-live-roster-after-surface'],
  ['burst-invulnerability-order', 'burst', 'const landed = mitigateTyped', 'if (enemy.invulnerable) continue; const landed = mitigateTyped', 'burst-invulnerable'],
  ['burst-shield-flag', 'burst', 'enemy.esBroke = false;', '', 'burst-shield-break'],
  ['burst-defense-depth', 'burst', 'this.sweepDefenseEvents(enemy, depth + 1)', 'this.sweepDefenseEvents(enemy, depth)', 'burst-shield-break'],
  ['burst-kill', 'burst', 'this.kill(enemy)', 'void enemy', 'burst-lethal'],
  ['delayed-depth', 'delayedBurst', 'depth: depth + 1', 'depth', 'authored-radiant_reprisal'],
  ['fortify-amount', 'fortify', '(fx.pctMaxLife ?? 0)', '2 * (fx.pctMaxLife ?? 0)', 'authored-shedding_plates'],
  ['cooldown-seconds', 'cooldown', '(fx.seconds ?? 0)', '0', 'authored-executioners_rhythm'],
  ['remove-duplicates', 'removeBuff', 'for (const id of l)', 'for (const id of new Set(l))', 'remove-buff-duplicates'],
  ['ward-amount', 'ward', 'caster.gainWard(amount)', 'caster.gainWard(amount * .5)', 'authored-desperate_ward'],
  ['cleanse-explicit', 'cleanse', 'new Set<string>(fx.statuses ?? [])', 'new Set<string>()', 'cleanse-unknown-definition'],
  ['kindle-site', 'kindle', 'target ? target.pos : caster.pos', 'caster.pos', 'authored-gutterglow'],
  ['vent-site', 'vent', 'target ? target.pos : caster.pos', 'caster.pos', 'authored-vaporize'],
  ['cast-effect-depth', 'cast', 'target, depth + 1, fx.cast', 'target, depth, fx.cast', 'authored-answering_gale'],
  ['extra-hit-depth', 'extraHit', 'fx.damageScale, depth + 1', 'fx.damageScale, depth', 'authored-brutal_strike'],
  ['collision-scale', 'collisionDamage', 'fx.damageScale, depth + 1', 'fx.damageScale * .5, depth + 1', 'authored-collision_crush'],
  ['explosion-story', 'explosion', 'sameStory(target, enemy)', 'sameStory(caster, enemy)', 'explosion-target-story'],
  ['arc-tie', 'arc', 'dd <= bd', 'dd < bd', 'arc-tie'],
  ['arc-origin', 'arc', 'let from = target;', 'let from = caster;', 'arc-reverse-tie'],
  ['arc-initial-exclusion', 'arc', 'new Set<Actor>([target])', 'new Set<Actor>()', 'arc-no-repeat'],
  ['arc-no-repeat', 'arc', 'struck.add(best);', '', 'arc-no-repeat'],
  ['arc-fractional', 'arc', 'hop < fx.hops', 'hop < Math.floor(fx.hops)', 'arc-fractional-hops'],
  ['arc-live-next-origin', 'arc', 'from = best;', '', 'arc-live-origin'],
  ['displace-zero-bearing', 'displace', 'fx.force > 0', 'fx.force >= 0', 'displace-force-0'],
  ['displace-magnitude', 'displace', 'Math.abs(fx.force)', 'fx.force', 'displace-force--80'],
  ['summon-cap', 'summon', ').length >= fx.max', ').length > fx.max', 'summon-cap-at'],
  ['summon-owner', 'summon', 'const owner = caster.owner ?? caster;', 'const owner = caster;', 'summon-cap-resolved-owner'],
  ['summon-lifeline-call', 'summon', 'this.conjurationLifeline(owner)', 'undefined', 'summon-cap-resolved-owner'],
  ['summon-forward', 'summon', 'this.forwardSummonSockets(inst, forged.skills);', '', 'summon-forwarded-support'],
  ['summon-duration-owner', 'summon', "owner.sheet.get('effectDuration',", "caster.sheet.get('effectDuration',", 'summon-cap-resolved-owner'],
  ['summon-publish', 'summon', 'this.actors.push(forged);', '', 'summon-cap-below'],
  ['birth-site', 'birth', "fx.at === 'self' || !target ? owner : target", 'owner', 'birth-target-ordinary'],
  ['birth-host-identity', 'birth', '!!target && site === target', "!!target && fx.at !== 'self'", 'birth-self-target-owner'],
  ['cast-missing-rng', 'castProcPayload', 'if (!skill) return false;', 'if (!skill) { randInt(cast.count[0], cast.count[1]); return false; }', 'cast-unknown-skill'],
  ['cast-zero-count', 'castProcPayload', 'if (n <= 0) return false;', 'if (n < 0) return false;', 'cast-spread-0-0'],
  ['cast-own-lookup', 'castProcPayload', 'cast.own ? this.heldSkillInst(caster, cast.skillId) : null', 'null', 'cast-own-bar'],
  ['cast-fallback-level', 'castProcPayload', 'Math.round(caster.level / 2)', 'Math.floor(caster.level / 2)', 'cast-fallback-level'],
  ['cast-synthetic-depth', 'castProcPayload', 'procChainDepth: depth', 'procChainDepth: 0', 'cast-projectile-target'],
  ['cast-zero-multiplier', 'castProcPayload', 'cast.mult ?? 1', 'cast.mult || 1', 'cast-own-bar'],
  ['cast-phase-draw', 'castProcPayload', 'const phase = rand(0, Math.PI * 2);', 'const phase = 0;', 'cast-spread-0-1'],
  ['cast-anchor-lock', 'castProcPayload', 'this.projectiles[this.projectiles.length - 1].hits.set(anchored.id, Infinity);', '', 'cast-real-flight'],
  ['cast-shared-origin', 'castProcPayload', 'payload(), from, dir,', 'payload(), vec(from.x, from.y), dir,', 'cast-shared-spawn-position'],
  ['cast-captured-origin', 'castProcPayload', 'payload(), from, dir,', 'payload(), anchored ? anchored.pos : from, dir,', 'cast-live-target-position'],
  ['cast-captured-level', 'castProcPayload', 'makeSkillInstance(skill, level)', 'makeSkillInstance(skill, inst ? effectiveSkillLevel(inst) : level)', 'cast-captured-synthetic-level'],
  ['cast-captured-multiplier', 'castProcPayload', '{ depth, mult }', '{ depth, mult: cast.mult ?? 1 }', 'cast-captured-multiplier'],
  ['cast-centered-origin', 'castProcPayload', 'targetInfo: { pos: vec(origin.x, origin.y) }', 'targetInfo: { pos: vec(caster.pos.x, caster.pos.y) }', 'cast-centered-target'],
  ['cast-aim-start', 'castProcPayload', 'const from = anchored ? origin : vec(caster.pos.x, caster.pos.y);', 'const from = origin;', 'cast-projectile-aim'],
  ['cast-held-first', 'heldSkillInst', 'for (const s of actor.skills) if (s?.def.id === skillId) return s;', '', 'cast-own-bar'],
  ['cast-granted-priority', 'heldSkillInst', 'seat.grantedInsts?.get(skillId) ?? seat.meta.knownSkills.get(skillId)', 'seat.meta.knownSkills.get(skillId) ?? seat.grantedInsts?.get(skillId)', 'cast-own-granted'],
];

export function applyProcDeliveryFault(tree, [name, section, needle, replacement]) {
  const node = tree.branches[section] ?? tree.methods[section];
  assert(node, name + ' section');
  const original = node.getText(tree.ast);
  assert.equal(original.split(needle).length, 2, name + ' unique selector');
  const changed = original.replace(needle, replacement);
  assert.notEqual(changed, original, name);
  return tree.input.slice(0, node.getStart(tree.ast)) + changed + tree.input.slice(node.end);
}
