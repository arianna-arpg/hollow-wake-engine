import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {Random} from '../dist/random.js';
import {SkillRecovery} from '../dist/skill-recovery.js';
import {CastSelfEffects} from '../dist/cast-self-effects.js';
import {CasterEffects} from '../dist/caster-effects.js';
import {advanceRestorationStreams} from '../dist/restoration-streams.js';
import {advanceDefensivePools} from '../dist/defensive-pool-timers.js';
import {healLife} from '../dist/life-recovery.js';
import {gainEnergyShield,applyInstantRestoration} from '../dist/resource-restoration.js';
import {gainWard} from '../dist/proc-effects.js';
import {createDamagePipeline} from '../dist/damage-pipeline.js';
import {sha256} from './reference-utils.mjs';

const probe=process.argv.includes('--probe');
const file=probe?'.artifacts/m3-skill-recovery-probe.json.gz':'baseline/skill-recovery/observations.json.gz';
const archive=fs.readFileSync(file),bytes=gunzipSync(archive);
if(!probe){const accepted=JSON.parse(fs.readFileSync('baseline/skill-recovery/acceptance.json'));
  assert(accepted.originalOnly);assert.equal(sha256(archive),accepted.compressedSha256);assert.equal(sha256(bytes),accepted.sha256);}
const fixture=JSON.parse(bytes);assert(fixture.originalOnly);let observations=0;
const normalized=value=>JSON.parse(JSON.stringify(value));
for(const course of fixture.courses){
  const {stats,initial}=course,draws=[],rng=new Random(19),random=()=>{const n=rng.next();draws.push(n);return n;};
  const actor={...structuredClone(initial),id:1,dead:false,downed:false,team:'ally',pos:{x:0,y:0},healedSince:0,esJustFilled:false,
    guardIntervention:{},absorbLayers:new Map(),restoreStreams:structuredClone(initial.streams),gainEvents:structuredClone(initial.events),
    sheet:{get:id=>stats[id]??0},maxLife:()=>stats.life,availableMaxMana:()=>stats.mana,maxEs:()=>stats.energyShield,
    healBy(n){return healLife(actor,n,{ceiling:()=>stats.life,rate:()=>stats.healTaken,recent:()=>undefined});},
    gainEs:n=>gainEnergyShield(actor,n,{maximumShield:()=>stats.energyShield}),
    gainWard:n=>gainWard(actor,n,{rate:()=>stats.wardGain}),cleanseDebuffs:()=>0,
    applyStatus(){assert.fail('Unexpected status in recovery course');},endStatus(){assert.fail('Unexpected shed in recovery course');}};
  const skill={def:{id:'m3-'+course.name,name:course.name,tags:['spell']},level:4};
  const damage=createDamagePipeline({random,instanceMods:()=>[],instanceInnateMods:()=>[],skillContextTags:()=>new Set(['spell']),
    travelProtected:()=>false,weakPointBonus:()=>0,plyFloor:()=>1,dominantType:()=>undefined,stampSegment(){},feedWound:()=>false,resourceFlow(){},boundToAbsorb:()=>false});
  const recovery=new SkillRecovery({tags:()=>new Set(['spell']),modifiers:()=>[],level:s=>s.level,healOverTime:()=>undefined,random,
    actors:()=>[actor],sameLayer:()=>true,distance:()=>0,absorbCue(){},criticalCue(){},
    // Original World.text draws horizontal jitter from the same stream. The
    // compatibility host reproduces that ordered draw even without rendering.
    healCue(){random();},cleanseCue(){random();},chainCue(){},arrivalCue(){},healedAlly(){}});
  const self=new CastSelfEffects({absorbAmount:damage.skillAbsorbAmount,absorb:recovery.absorb.bind(recovery),
    restore:(a,fx,options)=>applyInstantRestoration(a,fx,{availableMana:x=>x.availableMaxMana(),restoreLife:(x,f)=>x.healBy(f.amount),
      restoreShield:(x,f)=>x.gainEs(f.amount),restorePoise(){assert.fail('Unexpected poise restoration');},noteGain:()=>undefined},options),
    critical:(a,s)=>recovery.critical(a,s,a.pos),stream:recovery.stream.bind(recovery),heal:recovery.chain.bind(recovery),cleanse:recovery.cleanse.bind(recovery)});
  const frame={caster:actor,skill,aim:actor.pos,origin:actor.pos,delivery:'self',durationScale:stats.effectDuration,multiplier:1,chargesSpent:2,
    areaScale:1,color:'#fff',tags:new Set(['spell']),modifiers:[]};
  const inspect=()=>normalized({life:actor.life,mana:actor.mana,es:actor.es,absorb:actor.absorb,absorbTimer:actor.absorbTimer,ward:actor.ward,
    streams:actor.restoreStreams,events:actor.gainEvents});
  new CasterEffects({self},{}).apply(frame,course.effects);
  assert.deepEqual(inspect(),course.afterCast,course.name+' cast');assert.deepEqual(draws,course.castDraws,course.name+' random continuation');observations++;
  for(const step of course.steps){
    advanceDefensivePools(actor,step.dt,{tickAbsorbLayers:damage.tickAbsorbLayers});
    advanceRestorationStreams(actor,step.dt,{gain(){}});
    assert.deepEqual(inspect(),step.expected,course.name+' tick '+step.dt);assert.deepEqual(draws,step.draws,course.name+' timed random continuation');observations++;
  }
}
console.log({passed:true,originalFullCastCourses:fixture.courses.length,observations,composedServices:7,allCombatFamiliesQualified:false});
