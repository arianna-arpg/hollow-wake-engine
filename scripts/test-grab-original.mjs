import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {Grabs} from '../dist/grab.js';
import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-grab-probe.json.gz':'baseline/grab/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const accepted=JSON.parse(fs.readFileSync('baseline/grab/acceptance.json'));assert.equal(sha256(archive),accepted.compressedSha256);assert.equal(sha256(bytes),accepted.sha256);}
let observations=0;
for(const course of fixture.courses){
  const skill={def:{id:'m3-grab',effects:[{type:'grabSeize',grab:{verb:'carry'}}]}},actors=course.initial.map((s,i)=>({id:s.id,pos:{...s.pos},facing:s.facing,life:s.life,
    team:i===1?'enemy':'player',dead:false,passive:false,invulnerable:false,untargetable:s.untargetable,grabProofUntil:s.proof,radius:10,tier:0,skills:i===1?[]:[skill],statuses:[],
    sheet:{get:()=>0,removeSource(){}},effectiveWeight:()=>1,maxLife:()=>100,isStunned:()=>false,healBy(n){const before=this.life;this.life=Math.min(100,this.life+n);return this.life-before;},
    applyStatus(id){if(!this.statuses.some(s=>s.id===id))this.statuses.push({id});}}));
  const [holder,victim,receiver]=actors;let roster=actors,time=1,draws=0;const allDraws=course.steps.at(-1).draws;
  const runtime=new Grabs(fixture.rules,{actors:()=>roster,actorById:id=>roster.find(a=>a.id===id),enemies:a=>roster.filter(b=>b.team!==a.team),time:()=>time,
    random:()=>{assert(draws<allDraws.length,'extra random draw');return allDraws[draws++];},localActor:()=>undefined,tags:()=>new Set(),modifiers:()=>[],dormant:()=>false,
    hostileTo:(a,b)=>a.team!==b.team,lineOfSight:()=>true,clamp:p=>p,unclasp(){},mitigate:(a,n)=>Object.values(n).reduce((s,n)=>s+n,0),
    kill:a=>{a.dead=true;},hit(){assert.fail('unexpected contact');},push(){assert.fail('unexpected push');},text(){draws++;},flash(){},fail(){},damaged(){},dot(){},leech(){},seized(){}});
  const snapshot=()=>JSON.parse(JSON.stringify(actors.map(a=>({id:a.id,pos:{...a.pos},facing:a.facing,life:a.life,grip:a.gripping,held:a.heldBy,untargetable:a.untargetable,
    proof:a.grabProofUntil,statuses:a.statuses.map(s=>s.id),target:a.aiTargetId}))));
  for(const {step,expected,draws:expectedDraws}of course.steps){
    switch(step.kind){
      case 'seize':assert(runtime.seize(holder,skill,victim,course.grab));break;
      case 'advance':time=step.time;runtime.advance(step.dt);break;
      case 'release':runtime.release(holder);break;
      case 'sever':holder.gripping.severed=1;runtime.advance(.1);break;
      case 'struggle':holder.gripping.struggle=1;runtime.advance(.1);break;
      case 'orphan':roster=[victim,receiver];runtime.advance(.1);break;
      case 'handoff':assert(runtime.handoff(holder,victim,{}));break;
      default:assert.fail('unexpected step');
    }
    assert.deepEqual(snapshot(),expected,course.name+':'+step.kind);assert.equal(draws,expectedDraws.length,'random continuation');observations++;
  }
}
console.log({passed:true,originalControlCourses:fixture.courses.length,observations,allCombatFamiliesQualified:false});
