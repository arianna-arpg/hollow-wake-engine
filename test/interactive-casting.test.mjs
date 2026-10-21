import fs from 'node:fs';import assert from 'node:assert/strict';import test from 'node:test';
import {pressCastTiming,advanceFocusCast,focusWithinReach,focusCastDuration,focusFizzleCooldown} from '../dist/interactive-casting.js';
import {gunzipSync} from 'node:zlib';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-five/interactive-casting.json.gz',import.meta.url))));
const restore=state=>Object.fromEntries(Object.entries(structuredClone(state)).map(([k,v])=>[k,v===null?undefined:v]));
const wire=state=>Object.fromEntries(Object.entries(state).map(([k,v])=>[k,v??null]));
test('original focus phases preserve progress, terminal decisions and fizzle clocks',()=>{
 let n=0;
 for(const course of fixture.courses)for(const step of course.steps){
  if(!step.beforeCast?.cast||step.beforeCast.cast.mode!=='concentration'||step.terms.stunned)continue;
  const state=restore(step.beforeCast.cast),terms=step.terms,spec=terms.concentration,focused=terms.quarryLive&&focusWithinReach(terms.distance,terms.radius,spec.slack??fixture.defaults.slack);
  const result=advanceFocusCast(state,spec,step.dt,focused);
  if(step.after.cast){assert.equal(result,undefined,course.name);assert.deepEqual(wire(state),step.after.cast,course.name);}
  else{
   assert(result,course.name);const execution=step.calls.find(c=>c.kind==='execute');
   assert.equal(result.kind,execution?'release':'fizzle',course.name);
   if(execution)assert.equal(result.multiplier*state.baseMult,execution.options.dmgMult,course.name);
   else if(terms.cooldown>0){const cooldown=focusFizzleCooldown(terms.cooldown,terms.skillRecovery,terms.globalRecovery);assert.equal(step.after.cooldowns.find(([id])=>id===course.skill)?.[1],cooldown,course.name);assert.equal(step.after.cooldownTotals.find(([id])=>id===course.skill)?.[1],cooldown,course.name);}
   assert.equal(step.after.recovery,.15);
  }
  n++;
 }
 console.log('Compared '+n+' original focus phases.');assert.equal(n,56);
});
test('original timing presses match one-shot attempts, defaults, grafts and multitude cap',()=>{
 let n=0;
 for(const course of fixture.courses)for(const step of course.steps){if(step.command.type!=='click'||!step.before.cast)continue;
  const state=restore(step.before.cast),cues=[];for(let i=0;i<(step.command.count??1);i++){const cue=pressCastTiming(state,step.terms.timing?.bonus);if(cue)cues.push(cue);}
  assert.deepEqual(wire(state),step.after.cast,course.name);assert.equal(cues.length,step.calls.filter(c=>c.kind==='trigger'&&c.on==='flawless').length);n++;
 }
 console.log('Compared '+n+' original timing press commands.');assert.equal(n,22);
});
test('focus timing is explicit at thresholds and never consumes release-frame progress',()=>{
 const state={elapsed:.5,total:2,held:false};assert.deepEqual(advanceFocusCast(state,{time:2,onBreak:'release'},100,true),{kind:'release',multiplier:.25});assert.equal(state.elapsed,.5);
 assert.deepEqual(advanceFocusCast({elapsed:.499999,total:2,held:false},{time:2,onBreak:'release'},0,true),{kind:'fizzle'});
 const draining={elapsed:1,total:2,held:true};assert.equal(advanceFocusCast(draining,{time:2,drainRate:2},.2,false),undefined);assert.equal(draining.elapsed,.6);assert(draining.focusBroken);assert.equal(advanceFocusCast(draining,{time:2},.2,true),undefined);assert.equal(draining.elapsed,.8);assert(!draining.focusBroken);
 const overshoot={elapsed:.8,total:1,held:true};const complete=advanceFocusCast(overshoot,{time:1},.3,true);assert.deepEqual(complete,{kind:'release',multiplier:1});assert.equal(overshoot.elapsed,1.1);assert(Object.isFrozen(complete));
 assert.equal(focusCastDuration(.01,1),.2);assert.equal(focusCastDuration(2,2),1);assert(focusWithinReach(50,20));assert(!focusWithinReach(50.00001,20));assert.equal(focusFizzleCooldown(2,2,1),1);assert.equal(focusFizzleCooldown(2,0,1),20);
});
test('timing cue edges and press-spent state retain the source law',()=>{
 const perfect={mode:'perfect',elapsed:.72,total:1};assert.equal(pressCastTiming(perfect),'perfect');assert.equal(perfect.empowered,1.7);assert.equal(pressCastTiming(perfect),undefined);
 const early={mode:'perfect',elapsed:.71,total:1};assert.equal(pressCastTiming(early),undefined);early.elapsed=.9;assert.equal(pressCastTiming(early),undefined);assert.equal(early.empowered,undefined);
 // A marker of zero makes the distance exactly the binary64 literal .08.
 const timed={mode:'timed',elapsed:.08,total:1,indicatorAt:0};assert.equal(pressCastTiming(timed),'flawless');assert.equal(timed.empowered,2.2);
 assert.equal(pressCastTiming({mode:'timed',elapsed:.0800001,total:1,indicatorAt:0}),undefined);
 const zero={mode:'timed',elapsed:0,total:0,indicatorAt:0};assert.equal(pressCastTiming(zero),'flawless');
 const many={mode:'multitude',elapsed:0,total:1};for(let i=0;i<30;i++)pressCastTiming(many);assert.equal(many.presses,15);
});
test('independent focus states and immutable outcomes require no retained simulation data',()=>{
 const a={elapsed:0,total:1,held:true},b={elapsed:0,total:2,held:true};advanceFocusCast(a,{time:1},.5,true);advanceFocusCast(b,{time:2},.1,true);assert.equal(a.elapsed,.5);assert.equal(b.elapsed,.1);
 const completed=advanceFocusCast(a,{time:1},.5,true),other=advanceFocusCast({elapsed:0,total:1,held:true},{time:1},1,true);assert.equal(completed,other);assert.throws(()=>{completed.multiplier=99;},TypeError);
 const fizzled=advanceFocusCast({elapsed:0,total:1,held:false},{time:1},0,true);assert(Object.isFrozen(fizzled));assert.throws(()=>{fizzled.kind='release';},TypeError);
 assert.equal(advanceFocusCast(b,{time:2},.2,true),undefined);assert.equal(b.elapsed,.30000000000000004);
});
test('invalid public timing inputs fail explicitly',()=>{
 assert.throws(()=>focusCastDuration(1,0),/positive/);assert.throws(()=>focusFizzleCooldown(2,1,0),/positive/);assert.throws(()=>focusWithinReach(Infinity,2),/finite/);
 const state={elapsed:0,total:1,held:true};assert.throws(()=>advanceFocusCast(state,{time:1},-1,true),/nonnegative/);assert.equal(state.elapsed,0);assert.throws(()=>advanceFocusCast(state,{time:1,onBreak:'oops'},1,true),/policy/);
 assert.throws(()=>pressCastTiming({mode:'perfect',elapsed:NaN,total:1}),/finite/);assert.throws(()=>pressCastTiming({mode:'multitude',elapsed:0,total:1,presses:Infinity}),/finite/);
});
