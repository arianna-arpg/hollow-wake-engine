import test from 'node:test';import assert from 'node:assert/strict';import {SupportContent} from '../dist/support-content.js';
const pack=()=>({schemaVersion:1,capability:'support-rules/v1',contentId:'test',statIds:['damage','armor','manaCost','lingerField','forkCount'],
 supports:[{id:'support',requiresTags:['spell'],mods:[{stat:'damage',kind:'flat',value:2}],rollBase:{axes:[{id:'cut',rows:[{id:'a',weight:1,requiresMechanisms:['strikes']}]}]}},
 {id:'__proto__',mods:[]}],statuses:[{id:'burn',dotType:'fire'}],ailmentTuning:{burn:{identityThreshold:.6,incidentalScale:.35}},
 policy:{seatBoundFields:['trigger'],globalStats:['armor'],costStats:['manaCost'],strikeFields:['tether'],surfaceStats:['lingerField'],childFlightStats:['forkCount'],defaultLeveling:[]}});
test('support content is detached and deeply immutable, including policy sets and prototype-like identities',()=>{
 const raw=pack(),content=new SupportContent(raw);raw.supports[0].mods[0].value=900;raw.policy.globalStats.push('damage');
 assert.equal(content.support('support').mods[0].value,2);assert.equal(content.policy.globalStats.has('damage'),false);assert.equal(content.policy.globalStats.add,undefined);assert(Object.isFrozen(content.pack.supports[0].rollBase.axes[0].rows));
 assert.throws(()=>content.support('support').mods.push({}));assert.equal(content.support('__proto__').id,'__proto__');assert.throws(()=>content.support('missing'),/Unknown support/);
});
test('owned content rejects unknown rules while borrowed legacy hosts may pass them through',()=>{
 for(const mutate of [p=>p.supports[0].requiresMechanisms=['unknown'],p=>p.supports[0].rollBase.axes[0].rows[0].requiresMechanisms=['unknown:param']]){const p=pack();mutate(p);assert.throws(()=>new SupportContent(p),/Unknown support mechanism/);}
 const p=pack();p.supports[0].requiresMechanisms=['pour:future-label'];assert.doesNotThrow(()=>new SupportContent(p));
});
test('malformed support identities, modifier references, axes and non-finite values fail at content load',()=>{
 for(const mutate of [p=>p.supports.push(p.supports[0]),p=>p.supports[0].mods[0].stat='missing',p=>p.supports[0].mods[0].value=Infinity,p=>p.supports[0].levelBonus='3',p=>p.policy.costStats=['missing'],p=>p.supports[0].rollBase.axes[0].rows=[],p=>p.supports[0].rollBase.axes[0].rows.push(p.supports[0].rollBase.axes[0].rows[0]),p=>p.statuses.push(p.statuses[0]),p=>p.ailmentTuning.missing={identityThreshold:1,incidentalScale:1},p=>p.supports[0].requiresTags='spell']){const p=pack();mutate(p);assert.throws(()=>new SupportContent(p));}
 const p=pack();p.supports[0].mods=[{stat:'damage',kind:'link',value:.5,fromStat:'missing'}];assert.throws(()=>new SupportContent(p),/link source/);p.supports[0].mods[0].fromStat='armor';assert.doesNotThrow(()=>new SupportContent(p));
});
test('chance tuning preserves identity thresholds and leaves untuned statuses alone',()=>{
 const c=new SupportContent(pack());assert.equal(c.tuneChance('burn',.5),.175);assert.equal(c.tuneChance('burn',.6),.6);assert.equal(c.tuneChance('unknown',.5),.5);assert.equal(c.tuneChance('constructor',.5),.5);assert.equal(c.status('missing'),undefined);assert.throws(()=>c.tuneChance('burn',NaN));
});
test('dynamic stat vocabulary records provenance without inventing stat definitions',()=>{
 const p=pack();p.statIds.push('hostSpecial');p.dynamicStatIds=['hostSpecial'];p.supports[0].mods.push({stat:'hostSpecial',kind:'flat',value:3});
 const c=new SupportContent(p);assert.deepEqual(c.pack.dynamicStatIds,['hostSpecial']);assert.equal(c.support('support').mods[1].stat,'hostSpecial');
 p.dynamicStatIds.push('unregistered');assert.throws(()=>new SupportContent(p),/Dynamic stat missing/);p.dynamicStatIds=['hostSpecial','hostSpecial'];assert.throws(()=>new SupportContent(p),/dynamic stat ids/);
});
test('opaque payload data is retained as data without evaluating code or accepting nonserializable values',()=>{
 const p=pack();p.supports[0].futurePayload={source:'throw new Error("never run")',shape:[1,2,3]};const c=new SupportContent(p);assert.deepEqual(c.support('support').futurePayload,p.supports[0].futurePayload);assert.notEqual(c.support('support').futurePayload,p.supports[0].futurePayload);
 p.supports[0].futurePayload.run=()=>true;assert.throws(()=>new SupportContent(p),/plain serializable/);
});
