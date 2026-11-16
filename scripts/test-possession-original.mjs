import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {Possessions} from '../dist/possession.js';
import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-possession-probe.json.gz':'baseline/possession/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const accepted=JSON.parse(fs.readFileSync('baseline/possession/acceptance.json'));assert.equal(sha256(archive),accepted.compressedSha256);assert.equal(sha256(bytes),accepted.sha256);}
for(const c of fixture.courses){
  const skill={def:{id:'possession'}},bodies=c.initial.bodies.map(s=>{const sources=new Map(s.sources);return {...structuredClone(s),defId:'skeleton_warrior',faction:'wild',
    skills:s.skills.map(id=>id==='possession'?skill:id?{def:{id}}:null),statuses:s.statuses.map(id=>({id})),cooldowns:new Map(s.cooldowns),cooldownTotals:new Map(s.totals),sources,
    maxLife:()=>s.id===c.initial.controller.actor?c.maxLife:100,sheet:{get:stat=>c.terms[stat]??0,setSource:(id,mods)=>sources.set(id,mods),removeSource:id=>sources.delete(id)},
    applyStatus(id){if(!this.statuses.some(s=>s.id===id))this.statuses.push({id});}};});
  const [hero,target]=bodies,controller={id:c.initial.controller.id,actor:hero},roster=[...bodies];let time=10;
  const runtime=new Possessions(fixture.rules,{actors:()=>roster,controllers:()=>[controller],controllerFor:a=>controller.actor===a?controller:undefined,reindex(){},time:()=>time,
    definition:()=>c.definition,status:()=>({duration:fixture.stunDuration}),tags:()=>new Set(),grantedTags:()=>[],modifiers:()=>[],createBody(){assert.fail('unexpected form');},
    clamp:p=>p,text(){},flash(){},fail(){assert.fail('unexpected refusal');},changed(){},embodied(){},ejected(){},returnSwarmForm(){assert.fail('unexpected swarm form');}});
  const inspect=()=>JSON.parse(JSON.stringify({controller:{id:controller.id,actor:controller.actor.id,home:controller.home?.id},roster:roster.map(a=>a.id),
    bodies:bodies.map(a=>({id:a.id,life:a.life,dead:a.dead,pos:{...a.pos},radius:a.radius,team:a.team,kind:a.kind,skills:a.skills.map(s=>s?.def.id??null),
      statuses:a.statuses.map(s=>s.id),vacated:a.vacated,ride:a.possession,cooldowns:[...a.cooldowns],totals:[...a.cooldownTotals],
      sources:['possessed','vacated'].filter(id=>a.sources.has(id)).map(id=>[id,a.sources.get(id)])}))}));
  runtime.seize(hero,skill,target,c.spec);assert.deepEqual(inspect(),c.entered,c.reason+':enter');
  if(c.reason==='duration'){time=c.time;runtime.advance(.1);}
  else if(c.reason==='huskPain'){hero.life-=hero.maxLife()*fixture.rules.endOn.huskLostFrac;runtime.advance(.1);}
  else if(c.reason==='huskSeized'){hero.heldBy=999;runtime.advance(.1);}
  else if(c.reason==='travel'){target.pos={x:900,y:650};runtime.advance(.1);runtime.eject(controller,c.reason);}
  else runtime.eject(controller,c.reason);
  assert.deepEqual(inspect(),c.final,c.reason+':return');
}
console.log({passed:true,originalControllerCourses:fixture.courses.length,observations:fixture.courses.length*2,accountDependency:false,allCombatFamiliesQualified:false});
