import assert from 'node:assert/strict';
import {readMutationSource,runMutationFixture} from './mutation-fixture.mjs';
import {exportedFunctionBody} from './exported-function-body.mjs';
import {sha256} from './reference-utils.mjs';

const faults=[
 ['bank-running','refundReadyCooldown','left <= 0 &&','true &&'],
 ['omit-delete','refundReadyCooldown','actor.cooldowns.delete(skill.def.id);','void actor;'],
 ['ignore-enablement','refundReadyCooldown','ports.enabled(skill)','true'],
 ['ignore-cap','refundReadyCooldown','ports.price(actor, skill) * ports.maxExtra()','Infinity'],
 ['discard-credit','refundReadyCooldown','bank.bank + amount','amount'],
 ['command-floor','consumeReadyCooldownBank','Math.max(0.1,','Math.max(1,'],
 ['recall-spends','consumeReadyCooldownBank','!recall &&','true &&'],
 ['omit-spend','consumeReadyCooldownBank','if (!recall)','if (false)'],
 ['round-up-credit','consumeReadyCooldownBank','Math.floor(','Math.ceil('],
 ['ignore-command-cap','consumeReadyCooldownBank','ports.maxExtra(),','Infinity,'],
 ['discard-fraction','consumeReadyCooldownBank','Math.max(0, bank.bank - extra * unit)','0'],
 ['omit-clear','publishReadyCooldownBank','presentation.clear(bank.owner);','void bank;'],
 ['ignore-display-enablement','publishReadyCooldownBank','!ports.enabled(bank.host)','false'],
 ['projection-floor','publishReadyCooldownBank','Math.max(0.1,','Math.max(1,'],
 ['wrong-full-progress','publishReadyCooldownBank','? 1 :','? 0 :'],
 ['omit-publication','publishReadyCooldownBank','presentation.publish(bank.owner, 1 + extra, extra >= ports.maxExtra() ? 1 : (bank.bank / unit) % 1);','void extra;'],
];

const sourceFile='dist/ready-cooldown-bank.js',testFile='test/ready-cooldown-bank.test.mjs';
const source=readMutationSource(sourceFile);
const metadata={moduleSha256:sha256(source),testSha256:sha256(readMutationSource(testFile))};
runMutationFixture({suite:'ready-bank',testFile,metadata},run=>{
  for(const [name,fn,before,after] of faults){
    const region=exportedFunctionBody(source,fn),body=source.slice(region.start,region.end);
    assert.equal(body.split(before).length,2,name);
    run(name,sourceFile,source.slice(0,region.start)+body.replace(before,after)+source.slice(region.end));
  }
});
