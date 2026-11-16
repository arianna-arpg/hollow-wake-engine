import assert from 'node:assert/strict';
import {Random} from '@hollow-wake/engine';
const same=(a,b,message)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),message);
export function verifyCharacterCourses({fixture,kit,pack,combatContent,createCombatSession,emptyCombatSpace,createNodeHost}) {
  const grants=new Set(['vocation','xp','points','projection']);let observations=0;
  for(const course of fixture.courses) {
    const data=structuredClone(course.initial.data);
    const character=kit.admit({schemaVersion:1,capability:'character/v1',contentId:pack.contentId,...data,
      character:{schemaVersion:2,capability:'workshop-character/progression-diagnostic',contentId:pack.contentId,...data.character},
      nextUid:10000000,random:new Random(17).snapshot(),craftLore:{}},course.initial.projection);
    let conditions={};
    const space=emptyCombatSpace(1600,1200);
    const host=createNodeHost?.(combatContent,{kit,character,space,seed:711,conditionsFor:()=>conditions});
    const session=host?.session??createCombatSession(combatContent,{space},{seed:711,capacity:16});
    const hero=host?.hero??session.addCharacter(kit,character,{name:course.spec.id,position:{x:400,y:400}});
    const observe=expected=>{same(session.build(hero),expected.build,course.spec.id+' live build');
      same(Object.fromEntries(course.statIds.map(id=>[id,session.stat(hero,id)])),expected.stats,'live statistics');observations++;};
    observe(course.initial);let casts=0;
    for(const step of course.steps){
      let active;
      if(step.label==='rebuild-during-cast') {
        assert(session.press(hero,course.spec.skill,{x:440,y:400}),'live cast begins');
        casts++;
        active=session.inspect(hero).casting; assert(active);
        session.advance(active.total/3); active=session.inspect(hero).casting; assert(active);
      }
      conditions=step.conditions;
      if(host) {
        const result=grants.has(step.command.kind)?host.grant(step.command):host.build(step.command);
        assert(result.accepted,step.label+': '+result.reason);
      } else {
        const change=grants.has(step.command.kind)?character.authorize(step.command):character.prepare(step.command,step.conditions);
        assert(change.accepted,step.label+': '+change.refusal);
        assert.deepEqual(session.commitCharacter(hero,change),{accepted:true},step.label);
      }
      observe(step.expected??step);
      if(active) {assert.deepEqual(session.inspect(hero).casting,active,'build must retain active cast');session.advance(active.total);}
    }
    assert(casts>0,'course must rebuild during an actual combat cast');
    for(let i=0;i<20;i++)session.advance(.1);
    assert(Number.isFinite(session.inspect(hero).life));
    if(host){assert.equal(host.inventory().revision,course.steps.length);host.close();}
  }
 return {courses:fixture.courses.length,observations};
}
