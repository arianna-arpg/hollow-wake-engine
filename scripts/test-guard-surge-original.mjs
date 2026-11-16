import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {GuardSurge} from '../dist/guard-surge.js';import {CasterEffects} from '../dist/caster-effects.js';
import {createDamagePipeline} from '../dist/damage-pipeline.js';import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-guard-surge-probe.json.gz':'baseline/guard-surge/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync('baseline/guard-surge/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
const unused=()=>assert.fail('Unexpected damage operation in guard-surge course');
const damage=createDamagePipeline({instanceMods:()=>[],skillContextTags:()=>new Set(['spell']),random:unused,instanceInnateMods:unused,travelProtected:unused,
  weakPointBonus:unused,plyFloor:unused,dominantType:unused,stampSegment:unused,feedWound:unused,resourceFlow:unused,boundToAbsorb:unused});
for(const c of fixture.courses){
  const actor={...structuredClone(c.initial),casting:structuredClone(c.initial.guard),pos:{x:800,y:600},maxLife:()=>100,sheet:{get:key=>key==='absorbPower'?2:3}},skill={def:{id:'m3-surge'}};
  const guardSurge=new GuardSurge({absorbAmount:damage.skillAbsorbAmount,durationScale:()=>3});assert.deepEqual(guardSurge.preview(actor,skill,c.effect),c.preview);
  new CasterEffects({guardSurge},{guardSurged(){}}).apply({caster:actor,skill,origin:actor.pos,aim:actor.pos,delivery:'self',durationScale:3,areaScale:1,multiplier:1,color:'#fff',tags:new Set(['spell']),modifiers:[],chargesSpent:0},[c.effect]);
  assert.deepEqual(JSON.parse(JSON.stringify({mana:actor.mana,absorb:actor.absorb,absorbTimer:actor.absorbTimer,guard:actor.casting})),c.expected,c.variant);
}
console.log({passed:true,fullCastCourses:fixture.courses.length,previewAndExecution:true,allCombatFamiliesQualified:false});
