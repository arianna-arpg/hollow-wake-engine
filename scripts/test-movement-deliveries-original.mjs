import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {MovementDeliveries} from '../dist/movement-deliveries.js';import {Displacements} from '../dist/displacements.js';import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-movement-deliveries-probe.json.gz':'baseline/movement-deliveries/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync('baseline/movement-deliveries/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
const plain=value=>JSON.parse(JSON.stringify(value));
for(const c of fixture.courses){
  const statuses=[],blinks=[],decoys=[],skill={def:{id:'m3-'+c.name,name:c.name,color:'#fff'}},foe=structuredClone(c.foe);
  const a={...structuredClone(c.initial),name:'mover',dead:false,team:'ally',radius:c.radius,caromRun:structuredClone(c.initial.carom),maxLife:()=>c.maximum,sheet:{get:key=>c.stats[key]??0},
    applyStatus:(...args)=>statuses.push(['apply',...args]),endStatus:(...args)=>statuses.push(['end',...args])};
  const displacement=new Displacements({movementVoice(){},selfVoice(){},flash(){},clamp:p=>p});
  const runtime=new MovementDeliveries(blinks,fixture.cloud,{createActor:(name,team,pos)=>{const body={name,team,pos,maxLife:()=>body.maximum,fillResources:()=>body.life=body.maximum,sheet:{setBase:(_key,n)=>body.maximum=n}};return body;},addActor:b=>decoys.push(b),
    forgetMotion(){},moment(){},blast(){},status:id=>({duration:c.statusDurations[id]}),clamp:p=>p,afforded:(_a,_i,p)=>p,grants:(_a,_t,_m,base)=>[...base??[]],
    conjure(){assert.fail('unexpected cloud');},trailSpec(){assert.fail('unexpected generated trail');},trail(){assert.fail('unexpected trail');},
    teleport:(a,d,color,layer,id)=>displacement.teleport(a,d,color,undefined,layer,id),linger(){},enemies:()=>[],hit(){assert.fail('unexpected leap contact');},surfaces(){},flash(){},voice(){}});
  const inspect=()=>plain({pos:a.pos,facing:a.facing,facingPrev:a.facingPrev,tier:a.tier,dash:a.dash,carom:a.caromRun,dashSkill:a.dashSkill?.def.id,caromSkill:a.caromSkill?.def.id,
    dashHits:a.dashHits?[...a.dashHits]:undefined,caromHits:a.caromHits?[...a.caromHits]:undefined,caromRung:a.caromRung?[...a.caromRung]:undefined,
    dashTrail:a.dashTrailSpec,dashVent:a.dashVentSpec,dashConjure:a.dashConjureSpec,untargetable:a.untargetable,useLock:a.useLock,leap:a.leap?{...a.leap,inst:a.leap.inst.def.id}:null,statuses,
    blinks:blinks.map(b=>({dest:b.dest,timer:b.timer,face:b.faceTarget===foe,inst:b.inst?.def.id,life:b.visual?.life})),
    decoys:decoys.map(b=>({name:b.name,team:b.team,source:b.sourceSkillId,skill:b.summonInst?.def.id,tier:b.tier,radius:b.radius,facing:b.facing,life:b.life,maxLife:b.maxLife(),lifespan:b.lifespan,taunt:b.taunt,construct:b.construct}))});
  runtime[c.delivery.type]({caster:a,skill,aim:{x:940,y:600},target:c.delivery.behindTarget?{actor:foe,pos:foe.pos}:undefined,tags:new Set(['movement']),modifiers:[],areaScale:2,multiplier:3,color:'#fff',speedMultiplier:.5,noRepeat:c.name==='leap-repeat'},c.delivery);
  assert.deepEqual(inspect(),c.after,c.name+': release');
  for(const step of c.steps){if(step.end)runtime.endCarom(a);else{if(c.name==='dead-delayed')a.dead=true;runtime.advanceBlinks(step.dt);}assert.deepEqual(inspect(),step.expected,c.name+': continuation');}
}
console.log({passed:true,originalMovementCourses:fixture.courses.length,displacementComposed:true,physicalCollisionQualified:false,allCombatFamiliesQualified:false});
