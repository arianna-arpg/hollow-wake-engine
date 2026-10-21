import test from 'node:test';import assert from 'node:assert/strict';
import {ResourceContent} from '../dist/resource-content.js';import {resourcePack} from '../scripts/compile-resource-content.mjs';
const pack=resourcePack();
test('Resource compilation retains authored fields, ordering, 25 tree payloads and stat bases',()=>{
 const content=new ResourceContent(pack);assert.equal(content.entries.length,23);assert.equal(content.pack.skills.length,27);assert.equal(content.pack.supports.length,9);
 assert.equal(content.pack.skills.reduce((n,s)=>n+(s.nodes?.length??0),0),25);assert.equal(Object.keys(content.pack.stats).length,56);
 assert.deepEqual(content.entries.map(e=>e[0]),pack.charges.map(d=>d.id));
 assert.equal(content.definition('wisp').regen,2.5);assert.equal(content.pack.stats.chargeRegen_wisp.base,0);assert.equal(content.pack.stats.gaugeNeed.base,1);
 assert.equal(content.skill('grave_tide').gauge.feeds[0].radius,420);assert.equal(content.support('victors_tempo').chargeGain[0].chance,.6);
 for(const s of pack.skills)for(const n of s.nodes??[])assert.deepEqual(content.node(s.id,n.id),n);
 assert.equal(content.node('missing','missing'),undefined);assert.equal(content.support('missing'),undefined);assert.equal(content.definition('unknown-counter'),undefined);
});
test('Resource content is detached, deeply immutable and shares ordered entries without query allocation',()=>{
 const input=structuredClone(pack),content=new ResourceContent(input),entry=content.entries,skill=content.skill('life_flask');
 input.charges[0].label='changed';input.skills.find(s=>s.id==='life_flask').chargeGain[0].amount=999;
 assert.notEqual(content.entries[0][1].label,'changed');assert.equal(skill.chargeGain[0].amount,1);
 assert.equal(content.entries,entry);assert.equal(content.skill('life_flask'),skill);assert.equal(content.definition(entry[0][0]),entry[0][1]);
 assert.throws(()=>entry.push(['x',{}]),TypeError);assert.throws(()=>{skill.chargeGain[0].amount=999;},TypeError);
 assert.throws(()=>{content.node('life_flask',skill.nodes[0].id).chargeGain[0].everySeconds=0;},TypeError);
});
test('Resource ingress rejects broken schema, references, rates, intervals and payload typos',()=>{
 const mutations=[
  p=>{p.schemaVersion=2;},p=>{p.capability='unsupported';},p=>{p.extra=true;},p=>{p.charges.push(p.charges[0]);},
  p=>{p.charges[0].id='__regen';},p=>{p.charges[0].id='bad:clock';},p=>{p.charges[0].decay={perSec:-1};},
  p=>{p.charges[0].regen=NaN;},p=>{p.charges[0].modsWhileDraining=false;},p=>{p.charges[0].perCharge=[{stat:'missing',kind:'flat',value:1}];},
  p=>{p.charges[0].perCharge=[{stat:'chargeCap',kind:'link',value:1}];},p=>{delete p.stats.gaugeNeed;},
  p=>{p.stats.chargeCap.min=2;p.stats.chargeCap.max=1;},p=>{p.stats.chargeCap.base=Infinity;},
  p=>{p.gaugeTuning.defaultBankMult=0;},p=>{p.gaugeTuning.noteLocked=42;},
  p=>{p.skills[0].chargeGain=[{charge:'missing',on:'second',amount:1,max:3}];},
  p=>{p.skills[0].chargeGain=[{charge:'fury',on:'tick',amount:1,max:3}];},
  p=>{p.skills[0].chargeGain=[{charge:'fury',on:'second',amount:1,max:3,everySeconds:0}];},
  p=>{p.skills[0].chargeGain=[{charge:'fury',on:'move',amount:1,max:3,perDistance:-1}];},
  p=>{p.skills[0].chargeGain=[{charge:'fury',on:'kill',amount:1,max:3,chance:1.1}];},
  p=>{p.skills[0].chargeCost={charge:'fury',amount:-1};},p=>{p.skills[0].chargeCost={charge:'fury',amount:'all',optional:1};},
  p=>{p.skills[0].chargeCost={charge:'fury',amount:1,projectilesPerCharge:NaN};},
  p=>{p.skills[0].gauge={need:0};},p=>{p.skills[0].gauge={need:1,partial:{minFrac:2}};},
  p=>{p.skills[0].gauge={need:1,feeds:[{on:'kill',amount:1,raduis:10}]};},
  p=>{p.skills[0].nodes=[{id:'node'},{id:'node'}];},p=>{p.skills[0].id='nested:skill';},p=>{p.supports.push(p.supports[0]);},
  p=>{p.charges[0].perCharge=[{stat:'chargeCap',kind:'flat',value:1,gaugeAt:1}];},
 ];
 for(const mutate of mutations){const p=structuredClone(pack);mutate(p);assert.throws(()=>new ResourceContent(p),Error);}
});
