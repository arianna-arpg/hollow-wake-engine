import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {Mimic} from '../dist/mimic.js';
import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-mimic-probe.json.gz':'baseline/mimic/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const accepted=JSON.parse(fs.readFileSync('baseline/mimic/acceptance.json'));assert.equal(sha256(archive),accepted.compressedSha256);assert.equal(sha256(bytes),accepted.sha256);}
const definitions=new Map(fixture.definitions.map(row=>[row.input.id,row.input])),a={skills:[{def:definitions.get('mimicry')}],sheet:{get:s=>s==='mimicBank'?-2:1.5},
  mimicBank:fixture.initial.bank,mimicSel:fixture.initial.selected,mimicWatch:fixture.initial.watch,mimicWatchAt:fixture.initial.at,mimicWitnessR:fixture.initial.witness};
let studied=false;
const runtime=new Mimic(fixture.rules,{tags:d=>new Set(d.tags),modifiers:()=>[],monsterExists:()=>true,studied:()=>studied});
for(const row of fixture.definitions)assert.equal(runtime.allowed(row.input),row.expected,row.input.id);
for(const {step,time,result,expected}of fixture.courses){
  let actual;
  if(step.kind==='capture'){studied=step.studied;actual=runtime.capture(a,{defId:'skeleton_warrior'},definitions.get(step.skill),time);}
  else if(step.kind==='select')actual=runtime.select(a,time,step.pick);
  else if(step.kind==='press'){runtime.select(a,time,1);actual=true;}
  else {if(step.kind==='unslot')a.skills=[];runtime.refresh(a,time);}
  assert.deepEqual(actual,result,step.kind);
  assert.deepEqual({bank:a.mimicBank,selected:a.mimicSel,watch:a.mimicWatch,at:a.mimicWatchAt,witness:a.mimicWitnessR},expected,step.kind);
}
assert.deepEqual(runtime.power(),fixture.power);
console.log({passed:true,originalPolicyDefinitions:fixture.definitions.length,originalTransitions:fixture.courses.length,accountDependency:false,allCombatFamiliesQualified:false});
