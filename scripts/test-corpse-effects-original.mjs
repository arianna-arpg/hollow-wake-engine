import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {CorpseEffects} from '../dist/corpse-effects.js';
import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),base=probe?'.artifacts/m3-corpse-effects-probe.json.gz':'baseline/corpse-effects/observations.json.gz';
const archive=fs.readFileSync(base),bytes=gunzipSync(archive),fixture=JSON.parse(bytes);
assert(fixture.originalOnly);
if(!probe){const receipt=JSON.parse(fs.readFileSync('baseline/corpse-effects/acceptance.json'));assert.equal(sha256(archive),receipt.compressedSha256);assert.equal(sha256(bytes),receipt.sha256);}
for(const course of fixture.courses){
  const corpses=structuredClone(course.initial),caster={tier:course.tier,sheet:{get:()=>course.batch}};
  let draws=0;
  const runtime=new CorpseEffects(fixture.rules,corpses,{monster:id=>id==='skeleton_warrior',level:()=>course.level,
    random:()=>{assert(draws<course.draws.length,'Unexpected random draw');return course.draws[draws++];},
    clamp:p=>p,layerAt:()=>0,created(){},gathered(){},empty(){}});
  for(const fx of course.effects){
    if(fx.type==='spawnCorpse')runtime.spawn(caster,course.aim,fx.monsterId,fx.count,new Set(),[],course.color);
    else if(fx.type==='dragCorpses')runtime.gather(caster,course.aim,course.spec.skill,fx.radius,course.areaScale,new Set(),[],course.color);
    else assert.fail('Unexpected corpse spell effect '+fx.type);
  }
  assert.deepEqual(corpses,course.expected,JSON.stringify(course.spec));
  assert.equal(draws,course.draws.length,'Original presentation draw ordering');
}
console.log({passed:true,originalAuthoredCastCourses:fixture.courses.length,allCombatFamiliesQualified:false});
