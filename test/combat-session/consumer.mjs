import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createCombatSession} from '@hollow-wake/combat';
import {combatContent} from '@hollow-wake/combat/content';
import {emptyCombatSpace} from './space.mjs';
import {verifyLifecycleCourses} from './lifecycles.mjs';
import {verifyCharacterCourses} from './characters.mjs';
import {createCharacterKit} from '@hollow-wake/characters';

Math.random=()=>assert.fail('Ambient random');globalThis.fetch=()=>assert.fail('Network');
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){assert.fail('Ambient '+key);}});
const plain=value=>JSON.parse(JSON.stringify(value));
const make=(host={space:emptyCombatSpace(1600,1200)})=>createCombatSession(combatContent,host,{seed:1234,capacity:16});
const native={name:'Hero',team:'player',position:{x:400,y:400},controlled:true,stats:{life:10000,mana:10000},
  attributes:Object.fromEntries(Object.keys(combatContent.hitQueries.ATTRIBUTES).map(id=>[id,100])),skills:['firebolt']};
let observations=0,courses=0,contracts=0;const refusals=[];
for(const name of ['combat-frames','combat-families']) {
  const fixture=JSON.parse(gunzipSync(fs.readFileSync(name+'.json.gz')));assert(fixture.originalOnly);
  for(const course of fixture.courses) {
    const space=emptyCombatSpace(1600,1200);space.viewRectFor=body=>body.frameLockRect??course.view;
    const session=make({space});let hero;
    try {hero=session.addActor({...native,skills:[course.id],resourceFraction:course.resourceFraction});}
    catch(error) {
      assert.equal(name,'combat-families');
      assert.match(error.message,/missing-host-service/);assert.equal(session.snapshot().actors.length,0);
      refusals.push(course.id);continue;
    }
    session.addActor({name:'Target',team:'enemy',position:{x:440,y:400},stats:{life:10000,mana:10000},resourceFraction:course.resourceFraction});
    assert.equal(session.press(hero,course.id,{x:440,y:400}),course.accepted);
    for(let i=0;i<course.steps.length;i++) {
      if(i===course.releaseStep)session.release(hero);if(i)session.advance(.1);
      const view={...session.snapshot(),...(name==='combat-families'?{effects:session.effects()}:{})};
      assert.deepEqual(plain(view),course.steps[i],name+': '+course.id+' frame '+i);observations++;
    }
    courses++;
  }
}
assert.deepEqual(refusals,['town_portal','shatterstep','kindle_wick','steam_vent','steam_veil']);
for(const [id,service]of [['town_portal','portal'],['shatterstep','terrain'],['kindle_wick','kindle'],['steam_vent','vent'],['steam_veil','conjure']]){
 const calls=[],fields=Object.fromEntries(['portal','terrain','kindle','vent','conjure'].map(name=>[name,(...args)=>{calls.push({name,args});return name==='vent'?{reach:args[2]}:true;}]));
 const s=make({space:emptyCombatSpace(1600,1200),fields}),hero=s.addActor({...native,skills:[id]});
 assert(s.press(hero,id,{x:440,y:400}));for(let i=0;i<35;i++)s.advance(.1);
 assert(calls.some(call=>call.name===service),id+' must reach its explicit host provider');contracts++;
}
for(const name of ['combat-lifecycles','combat-proc-families','combat-interactions']){
 const fixture=JSON.parse(gunzipSync(fs.readFileSync(name+'.json.gz')));
 const result=verifyLifecycleCourses({fixture,content:combatContent,createCombatSession,emptyCombatSpace,procs:name==='combat-proc-families'});
 assert.deepEqual(result.mismatches,[]);courses+=result.courses;observations+=result.observations;
}
{
 const fixture=JSON.parse(gunzipSync(fs.readFileSync('character-session.json.gz')));
 const pack=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/characters/characters.json'))));
 const builds=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/character-builds/builds.json'))));
 const kit=createCharacterKit(builds,pack);
 const result=verifyCharacterCourses({fixture,kit,pack,combatContent,createCombatSession,emptyCombatSpace});
 courses+=result.courses;observations+=result.observations;
}
{
  const space=emptyCombatSpace(1600,1200),a=make(),b=make({space}),hero=a.addActor(native),foreign=b.addActor(native),before=a.snapshot();
  for(const dt of [NaN,Infinity,-1]){assert.throws(()=>a.advance(dt));assert.deepEqual(a.snapshot(),before);contracts++;}
  for(const ref of [foreign,{id:hero.id}]){assert.throws(()=>a.press(ref,'firebolt',{x:440,y:400}),/handle/);assert.deepEqual(a.snapshot(),before);contracts++;}
  const copy=a.inspect(hero);copy.pos.x=999;copy.life=0;assert.deepEqual(a.snapshot(),before);contracts++;
  assert.throws(()=>a.addActor({...native,skills:['unknown']}),/Unknown/);assert.deepEqual(a.snapshot(),before);contracts++;
  assert.throws(()=>a.addActor({...native,resourceFraction:NaN}));assert.deepEqual(a.snapshot(),before);contracts++;
  assert(a.press(hero,'firebolt',{x:440,y:400}));assert(b.press(foreign,'firebolt',{x:440,y:400}));
  a.advance(.2);b.advance(.2);assert.deepEqual(a.snapshot(),b.snapshot());contracts++;
  delete space.castGridRay;assert.equal(b.press(foreign,'firebolt',{x:440,y:400}),false);
  a.drainSignals();assert.equal(a.drainSignals().length,0);assert(b.drainSignals().some(row=>row.kind==='combat-refused'));contracts++;
}
{
  const space=emptyCombatSpace();let calls=0;space.nearestBody=()=>{calls++;throw Error('Targeting must not run');};delete space.castGridRay;
  const s=make({space}),before=s.snapshot();assert.throws(()=>s.addActor(native),/space.castGridRay/);assert.deepEqual(s.snapshot(),before);assert.equal(calls,0);contracts++;
}
{
 const s=make(),before=s.snapshot();
 assert.throws(()=>s.addActor({...native,skills:[],stats:{proc_vaporize:1}}),/fields.vent/);
 assert.deepEqual(s.snapshot(),before);contracts++;
}
{
 const s=make({space:emptyCombatSpace(),environment:()=>[{actor:1,status:'unknown',dps:0,magnitude:1,source:'world'}]});
 s.addActor(native);assert.throws(()=>s.advance(.1),/environmental status/);
 assert.throws(()=>s.advance(.1),/quarantined/);contracts++;
}
{
  const space=emptyCombatSpace();let armed=false,s;
  for(const [name,method]of Object.entries(space))space[name]=(...args)=>{
    if(armed){assert.throws(()=>s.advance(.1),/reenter/);throw Error('host failed');}
    return method(...args);
  };
  s=make({space});const hero=s.addActor(native);armed=true;
  assert.throws(()=>{s.press(hero,'firebolt',{x:440,y:400});for(let i=0;i<20;i++)s.advance(.1);},/host failed/);
  assert.throws(()=>s.advance(.1),/quarantined/);contracts++;
}
console.log(JSON.stringify({passed:true,courses,observations,contracts,explicitWorldServiceRefusals:refusals.length,optionalExtensionsRequired:false}));
