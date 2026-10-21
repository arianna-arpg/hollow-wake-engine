import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import assert from 'node:assert/strict';import test from 'node:test';
import * as gauge from '../dist/resource-gauges.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-two/resource-gauges.json.gz',import.meta.url))));
const wire=v=>JSON.parse(JSON.stringify(v));
function view(inst,spec,eff){return wire({state:inst.state??null,fill:gauge.gaugeFill(inst),locked:gauge.gaugeLocked(inst),lockLeft:gauge.gaugeLockLeft(inst),floor:gauge.gaugeFloor(spec,eff),ready:gauge.gaugeReady(inst,eff,spec),fullReady:gauge.gaugeReady(inst,eff),power:gauge.gaugePowerOf(spec,eff,gauge.gaugeFill(inst)),fraction:gauge.gaugeFrac(inst,eff),note:gauge.gaugeNote(inst,spec,eff,fixture.tuning)});}

test('resource gauges match all repeated original courses and legacy boundary observations',()=>{
 let transitions=0;
 for(const c of fixture.courses){const inst={},spec=c.spec,{needMul,gainMul,lockMul}=c.factors,eff=gauge.gaugeEffOf(spec,needMul,gainMul,lockMul,fixture.tuning);assert.deepEqual(eff,c.eff,c.id);
  for(const s of c.steps){assert.deepEqual(view(inst,spec,eff),s.before,c.id+' before '+s.command);const [op,arg]=s.command;let result;
   if(op==='add')result=gauge.gaugeAdd(inst,arg,eff);else if(op==='tick')result=gauge.gaugeTick(inst,spec,eff,arg);else if(op==='spend')result=gauge.gaugeSpend(inst,spec,eff);else if(op==='shave')result=gauge.gaugeShaveSec(spec,eff,arg);else throw new Error(op);
   assert.deepEqual(result??null,s.result,c.id+' result '+s.command);assert.deepEqual(view(inst,spec,eff),s.after,c.id+' after '+s.command);transitions++;
  }
 }
 for(const c of fixture.edgeCases){const inst={state:{gauge:c.fill}};assert.equal(gauge.gaugePowerOf(c.spec,c.eff,c.fill),c.power);assert.equal(gauge.gaugeAdd(inst,1,c.eff),c.added);assert.deepEqual(inst.state,c.afterAdd);assert.equal(gauge.gaugeSpend(inst,c.spec,c.eff),c.spent);assert.deepEqual(inst.state,c.afterSpend);}
 assert.equal(transitions,2808);assert.equal(fixture.edgeCases.length,32);
});
test('gauge clocks consume silence before regeneration and preserve unrelated state identity',()=>{
 const state={gauge:2,gaugeLock:.75,unrelated:{owner:1}},inst={state},other={};
 const eff={need:10,gain:2,lockoutSec:.75,cap:20},spec={need:10,regen:4};
 gauge.gaugeTick(inst,spec,eff,1);assert.equal(inst.state,state);assert.equal(state.gauge,4);assert.equal(state.gaugeLock,0);assert.deepEqual(state.unrelated,{owner:1});assert.deepEqual(other,{});
 assert.equal(gauge.gaugeSpend(inst,{need:10,partial:{minFrac:.25,floorPower:.25}},eff),.25+(.75/7));assert.equal(state.gauge,0);assert.equal(state.gaugeLock,.75);
 assert.equal(gauge.gaugeAdd(inst,999,eff),0);assert.equal(state.gauge,0);
});
test('gauge admission, partial payment, overflow and cooldown hastening stay distinct',()=>{
 const eff={need:8,gain:1.5,lockoutSec:2,cap:24},spec={need:8,partial:{minFrac:.25,floorPower:.5}},inst={state:{gauge:2}};
 assert.equal(gauge.gaugeReady(inst,eff,spec),true);assert.equal(gauge.gaugeReady(inst,eff),false);assert.equal(gauge.gaugeSpend(inst,spec,eff),.5);assert.equal(inst.state.gauge,0);
 inst.state.gauge=20;assert.equal(gauge.gaugeSpend(inst,{need:8,overflow:true},eff),2.5);assert.equal(inst.state.gauge,0);
 assert.equal(gauge.gaugeShaveSec({need:8,cooldownPer:.25},eff,4),1.5);
 // A positive feed may lower an over-cap legacy bank; preserve its signed receipt.
 const legacy={state:{gauge:30}};assert.equal(gauge.gaugeAdd(legacy,1,eff),-6);assert.equal(legacy.state.gauge,24);
});
test('gauge arithmetic refuses nonfinite and invalid timing without mutating state',()=>{
 const eff={need:8,gain:2,lockoutSec:2,cap:24},spec={need:8,regen:4},inst={state:{gauge:2,gaugeLock:.5,unrelated:7}},before=structuredClone(inst);
 for(const dt of [-1,NaN,Infinity]){assert.throws(()=>gauge.gaugeTick(inst,spec,eff,dt));assert.deepEqual(inst,before);}
 assert.throws(()=>gauge.gaugeTick(inst,{need:8,regen:Number.MAX_VALUE},eff,4));assert.deepEqual(inst,before);
 assert.throws(()=>gauge.gaugeSpend(inst,spec,{...eff,need:0}));assert.deepEqual(inst,before);
 assert.throws(()=>gauge.gaugeAdd(inst,NaN,eff));assert.deepEqual(inst,before);
 assert.throws(()=>gauge.gaugeEffOf({need:Number.MAX_VALUE},2,1,1,fixture.tuning));
 const absent={};assert.equal(gauge.gaugeAdd(absent,-1,eff),0);assert.deepEqual(absent,{});
});
