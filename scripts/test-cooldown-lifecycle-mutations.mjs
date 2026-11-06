import assert from 'node:assert/strict';
import {readMutationSource,runMutationFixture} from './mutation-fixture.mjs';
import {sha256} from './reference-utils.mjs';

const faults=[
 ['snapshot-elapsed','of actor.cooldowns) {','of [...actor.cooldowns]) {'],
 ['repeat-global-read','let rate = global;','let rate = ports.global(actor);'],
 ['ignore-scoped-rate','rate = ports.scoped(actor, skill);','ports.scoped(actor, skill);'],
 ['ignore-recovery','advanceCooldown(remaining, elapsed, rate)','advanceCooldown(remaining, elapsed, 1)'],
 ['omit-absorb','(ports.absorbCooldown(skill) ?? base)','base'],
 ['price-floor','Math.max(0.1,','Math.max(1,'],
 ['price-multiply','return price / Math.max','return price * Math.max'],
 ['nonpositive-price-reads','if (price <= 0)','if (price < -999999)'],
 ['cap-ordinary','if (skill.def.ultimate)','if (true)'],
 ['omit-total-stamp','actor.cooldownTotals.set(skill.def.id, seconds);','void seconds;'],
 ['omit-total-refund','actor.cooldownTotals.delete(id);','void id;'],
 ['orb-unique-bar','of actor.skills) {','of new Set(actor.skills)) {'],
 ['orb-negative-refund','if (seconds <= 0)\n            continue;','if (seconds === 0)\n            continue;'],
 ['live-skill-effect','of [...actor.cooldowns]) {','of actor.cooldowns) {'],
 ['fraction-after-seconds','remaining * (effect.fraction ?? 0)','(remaining - (effect.seconds ?? 0)) * (effect.fraction ?? 0)'],
 ['changed-only-notification','visited++;','if (left < remaining) visited++;'],
 ['self-included','if (id === definition.id)','if (false)']
];

const sourceFile='dist/cooldown-lifecycle.js',testFile='test/cooldown-lifecycle.test.mjs';
const source=readMutationSource(sourceFile);
const metadata={sourceSha256:sha256(source),testSha256:sha256(readMutationSource(testFile))};
runMutationFixture({suite:'cooldown-lifecycle',testFile,metadata,hashField:'mutatedSha256'},run=>{
  for(const [name,before,after] of faults){
    assert.equal(source.split(before).length,2,name);
    run(name,sourceFile,source.replace(before,after));
  }
});
