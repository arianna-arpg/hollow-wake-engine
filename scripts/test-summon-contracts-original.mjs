import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {SummonContracts} from '../dist/summon-contracts.js';import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-summon-contracts-probe.json.gz':'baseline/summon-contracts/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync('baseline/summon-contracts/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
const plain=value=>JSON.parse(JSON.stringify(value));
for(const c of fixture.courses){
  let capacity=3;const skill={def:c.definition},a={dead:false,mana:c.initial.mana,reservedMana:c.initial.reserved,summonToggles:new Map(c.initial.toggles.map(([id,row])=>[id,{...row,inst:skill}])),
    maxMana:()=>c.maximum,availableMaxMana:()=>c.maximum-a.reservedMana,sheet:{get:(key,_tags,_extra,base)=>key==='minionMaxCount'?capacity:key==='minionRespawnTime'?.8:key==='manaCost'?1:base??0}};
  const bodies=c.initial.bodies.map(b=>({...b,owner:a,summonInst:skill,sourceSkillId:skill.def.id})),queues={respawns:c.initial.respawns.map(row=>({...row,caster:a,inst:skill})),summons:c.initial.summons.map(row=>({...row,caster:a,inst:skill}))};
  const runtime=new SummonContracts(queues,{delivery:i=>i.def.delivery,native:i=>i.def.delivery,tags:()=>new Set(),modifiers:()=>[],actors:()=>[a,...bodies],homes:()=>[],
    minionsOfSkill:(owner,id)=>bodies.filter(b=>b.owner===owner&&!b.dead&&b.sourceSkillId===id),clearReleaseFields(){},kill:b=>b.dead=true});
  // Bodies are also traversed as owners by the original complete actor roster.
  for(const b of bodies)b.summonToggles=new Map();
  const inspect=()=>plain({mana:a.mana,reserved:a.reservedMana,toggles:[...a.summonToggles].map(([id,t])=>[id,{...t,inst:t.inst.def.id}]),bodies:bodies.map(b=>({id:b.id,dead:b.dead,manaReserved:b.manaReserved})),
    respawns:queues.respawns.map(r=>({inst:r.inst.def.id,timer:r.timer})),summons:queues.summons.map(r=>({...r,caster:'owner',inst:r.inst.def.id}))});
  for(const step of c.steps){if(step.dismiss)runtime.dismiss(a,skill.def.id);else{capacity=step.capacity;runtime.reconcile();}assert.deepEqual(inspect(),step.expected,c.name+': '+(step.capacity??'dismiss'));}
}
for(const c of fixture.prices){
  const skill={def:{id:'m3-price',delivery:c.delivery}},other={def:{id:'other',delivery:c.delivery}},a={summonToggles:new Map([['other',{inst:other,reserved:c.sibling*10,slots:c.sibling}]]),
    sheet:{get:key=>key==='minionMaxCount'?3:key==='manaCost'?.8:key==='summonReservation_m3-price'?.5:0}};
  const runtime=new SummonContracts({respawns:[],summons:[]},{delivery:i=>i.def.delivery,tags:()=>new Set(),modifiers:()=>[]});
  assert.equal(runtime.capacity(a,skill,c.delivery),c.capacity);assert.equal(runtime.slots(a,skill,c.delivery),c.slots);assert.equal(runtime.reservation(a,skill,c.delivery),c.unit);
}
console.log({passed:true,originalContractCourses:fixture.courses.length,transitions:fixture.courses.length*4,priceCases:fixture.prices.length,persistenceDependency:false,fullBirthQualified:false,allCombatFamiliesQualified:false});
