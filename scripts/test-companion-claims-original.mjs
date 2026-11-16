import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {CompanionClaims} from '../dist/companion-claims.js';
import {CompanionStances} from '../dist/companion-stances.js';
import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-companion-claims-probe.json.gz':'baseline/companion-claims/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync('baseline/companion-claims/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
const plain=value=>JSON.parse(JSON.stringify(value));
for(const c of fixture.courses){
  const keeper={id:c.keeperId,team:'ally',tier:0},beast={...c.initial,defId:'skeleton_warrior',dead:false,tier:c.spec.tier??0,rarity:c.spec.rarity??'normal',
    threat:new Map(c.initial.threat),owner:c.initial.owner===keeper.id?keeper:undefined,maxLife:()=>c.maximum,sheet:{removeSource(){}}},actors=[keeper,beast];
  if(c.spec.full)actors.push({id:999,dead:false,companion:true,owner:keeper,sourceSkillId:'__companion:m3-claim'});
  let draw=0;const runtime=new CompanionClaims(fixture.parts,{actors:()=>actors,monster:()=>fixture.monster,adjustments:()=>c.adjustments,bond:()=>c.bond,
    random:()=>{assert(draw<c.draws.length);return c.draws[draw++];},sameLayer:(a,b)=>a.tier===b.tier,cue(){},clearEncounter(){},adopt(){}});
  runtime.attempt(keeper,{def:{id:'m3-claim',effects:[c.effect]}},beast,c.effect);
  const observed={};for(const key of new Set([...Object.keys(c.initial),...Object.keys(c.expected)]))observed[key]=key==='owner'?beast.owner?.id:key==='threat'?[...beast.threat]:beast[key];
  assert.deepEqual(plain(observed),c.expected,JSON.stringify(c.spec));assert.equal(draw,c.draws.length);
}
const choices=new Map(),skill={def:{id:'m3-bond',effects:[{type:'tame'}]}},controller={actor:{skills:[skill,skill]}};
const runtime=new CompanionStances(fixture.stances,fixture.stanceConfig.default,fixture.stanceConfig.kindPrefix,{choices:()=>choices,learned:()=>false,refresh(){},shifted(){},changed(){}});
for(const c of fixture.stanceCourses){assert.equal(c.cycle?runtime.cycle(controller):runtime.set(controller,c.id,c.stance),c.changed);assert.deepEqual(Object.fromEntries(choices),c.choices);}
for(const c of fixture.pure){choices.set('bond',c.id);assert.deepEqual(plain({id:c.id,next:runtime.next(c.id),held:runtime.id(controller,'bond'),order:runtime.order(c.id),decoded:runtime.fromOrder(runtime.order(c.id))}),c);}
console.log({passed:true,claimCourses:fixture.courses.length,stanceTransitions:fixture.stanceCourses.length,campaignDependency:false,allCombatFamiliesQualified:false});
