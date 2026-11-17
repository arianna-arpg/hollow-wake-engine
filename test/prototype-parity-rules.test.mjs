import test from 'node:test';
import assert from 'node:assert/strict';
import {rollStrikeMarker,resolveStrikeTimings} from '../dist/strike-timing.js';
import {StatSheet,StatRules} from '../dist/index.js';
import {deathHost} from './combat-death-host.mjs';

test('one timing input resolves independent disciplines and multiplies their rewards',()=>{
  const perfect={kind:'perfect',source:{kind:'skill',id:'bow'}},timed={kind:'timed',source:{kind:'support',id:'mark'}};
  assert.deepEqual(resolveStrikeTimings([perfect,timed],.76,.76),{successes:[perfect,timed],multiplier:1.7*2.2});
  assert.deepEqual(resolveStrikeTimings([perfect,timed],.76,.4),{successes:[perfect],multiplier:1.7});
  assert.deepEqual(resolveStrikeTimings([perfect,timed],.4,.4),{successes:[timed],multiplier:2.2});
  assert.deepEqual(resolveStrikeTimings([perfect,timed],.2,.4),{successes:[],multiplier:1});
  assert.equal(resolveStrikeTimings([{kind:'perfect',bonus:0}],.9).multiplier,1);
});
test('combined timing consumes one owned draw and perfect-only casting consumes none',()=>{
  let draws=0;const random=()=>{draws++;return .5;};
  assert.equal(rollStrikeMarker([{kind:'perfect'}],random),undefined);assert.equal(draws,0);
  assert.equal(rollStrikeMarker([{kind:'perfect'},{kind:'timed'},{kind:'timed'}],random),.575);assert.equal(draws,1);
});
test('explicit unbounded rebound count cannot poison finite queries or bypass finite modifiers',()=>{
  const sheet=new StatSheet(new StatRules({bounces:{base:0},bounded:{base:0,max:5}}));
  assert.equal(sheet.get('bounces',undefined,undefined,Infinity),Infinity);
  assert.equal(sheet.get('bounces'),0);
  assert.equal(sheet.get('bounded',undefined,undefined,Infinity),5);
  sheet.setSource('limit',[{stat:'bounces',kind:'override',value:3}]);
  assert.equal(sheet.get('bounces',undefined,undefined,Infinity),3);
  assert.throws(()=>sheet.setBase('bounces',Infinity),/finite/);
  assert.throws(()=>sheet.setSource('invalid',[{stat:'bounces',kind:'flat',value:Infinity}]),/finite/);
  sheet.removeSource('limit');sheet.setSource('overflow',[{stat:'bounces',kind:'more',value:1}]);
  assert.throws(()=>sheet.get('bounces',undefined,undefined,Number.MAX_VALUE),/finite/);
  assert.throws(()=>sheet.get('bounces',undefined,undefined,NaN),/finite/);
});
test('death deferral blocks reentrant retirement and releases its guard after completion or failure',()=>{
  const h=deathHost(),a=h.make(1);let calls=0;
  h.p.deferDeath=actor=>{calls++;h.runtime.kill(actor);return true;};
  h.runtime.kill(a);assert.equal(calls,1);assert.equal(a.dead,false);assert.equal(a.dying,false);assert.deepEqual(h.events,[]);
  h.p.deferDeath=()=>{throw Error('deferred failure');};assert.throws(()=>h.runtime.kill(a),/deferred failure/);assert.equal(a.dying,false);
  h.p.deferDeath=undefined;h.p.retired=actor=>{calls++;h.runtime.kill(actor);};
  h.runtime.kill(a);assert.equal(a.dead,true);assert.equal(a.dying,false);assert.equal(calls,2);
});

test('undying observation preserves the original temporary-life facts before revival',()=>{
  const h=deathHost(),a=h.make(1),owner=h.make(2);a.owner=owner;a.undyingTime=3;a.lifespan=9;
  let calls=0;h.p.undying=(body,cause)=>{calls++;assert.equal(body.lifespan,9);assert.equal(body.undyingSpent,false);assert.equal(cause,'expire');};
  h.runtime.kill(a,false,undefined,'expire');assert.equal(calls,1);assert.equal(a.dead,false);assert.equal(a.lifespan,3);
  h.runtime.kill(a,false,undefined,'expire');assert.equal(calls,1);assert.equal(a.dead,true);
});
