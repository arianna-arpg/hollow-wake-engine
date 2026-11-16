import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {FieldDeliveries} from '../dist/field-deliveries.js';import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-field-deliveries-probe.json.gz':'baseline/field-deliveries/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync('baseline/field-deliveries/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
function snapshot(value){return JSON.parse(JSON.stringify(value,(key,v)=>key==='caster'||key==='anchor'?v?.id:key==='inst'||key==='emitInst'?v?.def.id:v instanceof Set?[...v]:v instanceof Map?[...v]:typeof v==='number'&&!Number.isFinite(v)?String(v):v));}
for(const c of fixture.courses){
  const a={id:c.casterId,pos:{x:800,y:600},facing:0,tier:0,sheet:{get:(key,_tags,_extra,base)=>c.stats[key]??base??0}},i={def:{id:'m3-'+c.name,tags:c.tags}};
  if(c.armed)a.casting={mode:'channel',inst:i};const state={zones:[],domainSeq:0,sparkSeq:0},expired=[];let draws=0;
  const fail=()=>assert.fail('Unexpected service call in '+c.name);
  const runtime=new FieldDeliveries(state,fixture.rules,{time:()=>7,random:()=>{assert(draws<c.draws.length,'Exhausted RNG');return c.draws[draws++];},
    clampGroundTarget:(_a,at)=>({...at}),clampPos:at=>at,skillOcclusion:()=> 'free',clipShot:(_a,b)=>b,enemiesOf:()=>c.bodies,
    instanceEffects:()=>[],plantKindle:fail,plantVent:fail,conjureGrantsFor:fail,conjureCloud:fail,instanceBirth:()=>undefined,birthAt:fail,
    expireZone:z=>expired.push(snapshot(z)),instanceTurret:()=>undefined,hasSkill:fail,makeSkill:fail,effectiveSkillLevel:fail,forwardSummonSockets:fail,spawnConstruct:fail,layFissure:fail,
    socketSpec:(_i,k)=>k==='cadence'?c.cadence:undefined,instancePulsePlan:()=>c.pulse,instanceSizeOver:()=>c.size,maddenBankOf:()=>undefined,hostSockets:()=>[],instanceCascadePlan:()=>c.cascade,skillPresenceVoice:()=>undefined,flash(){}});
  for(let n=0;n<c.casts;n++)assert.deepEqual(runtime[c.delivery.type]({caster:a,inst:i,d:c.delivery,aim:c.aim,tags:new Set(c.tags),extra:[],aoeScale:c.aoeScale,arcScale:c.arcScale,useMult:2,cosmeticColor:'#fff',ventRounds:0,gPow:1}),c.aim);
  assert.deepEqual(snapshot(state.zones),c.zones,c.name+': fields');assert.deepEqual(expired,c.expired,c.name+': retirement');
  assert.equal(draws,c.draws.length,c.name+': RNG ordering');
}
console.log({passed:true,originalDeliveryCourses:fixture.courses.length,fieldPlacementQualified:true,fieldSimulationQualified:false,allCombatFamiliesQualified:false});
