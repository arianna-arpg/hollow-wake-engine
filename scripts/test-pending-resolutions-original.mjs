import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {CasterEffects} from '../dist/caster-effects.js';import {CastBuffs} from '../dist/cast-buffs.js';import {BuffRuntime} from '../dist/buffs.js';import {PendingResolutions} from '../dist/pending-resolutions.js';import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-pending-resolutions-probe.json.gz':'baseline/pending-resolutions/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync('baseline/pending-resolutions/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
const plain=value=>JSON.parse(JSON.stringify(value));let observations=0;
for(const c of fixture.courses){
  let time=10,power=2;const a={dead:false,pos:{x:800,y:600},team:'ally',tier:0,radius:14,buffs:new Map(),gainEvents:[],sheet:{get:()=>1}},skill={def:{id:'m3-'+c.name,tags:['spell']}},fuses=[],persists=[];
  const buffs=new BuffRuntime({publish(){},removeSource(){},release(){}}),policy=new CastBuffs({actors:()=>[a],tags:s=>new Set(s.def.tags),tagList:t=>[...t],modifiers:()=>[],hasTreeBuffs:()=>false,
    grant:buffs.grant.bind(buffs),remove:buffs.remove.bind(buffs),arrival(){}});
  const phase=new CasterEffects({buffs:policy},{fuse:()=>c.name==='persist'?undefined:{delay:1},time:()=>time,fuseDelay:()=>1.2,bankBuff:row=>fuses.push(row),fuseTell(){}});
  const execute=(actor,inst,aim,opts)=>phase.apply({caster:actor,skill:inst,aim,origin:actor.pos,delivery:'self',tags:new Set(['spell']),modifiers:[],areaScale:1,durationScale:1.5,multiplier:opts.dmgMult,color:'#fff',chargesSpent:0},c.effects);
  const runtime=new PendingResolutions(fuses,persists,{time:()=>time,fusePower:()=>power,buff:policy.apply.bind(policy),arrived(){},execute,copyPosition:p=>({...p})});
  const inspect=()=>plain({buffs:[...a.buffs],events:a.gainEvents,fuses:fuses.map(row=>({...row,caster:'caster',inst:'skill'})),persists:persists.map(row=>({...row,caster:'caster',inst:'skill'}))});
  if(c.name==='persist')persists.push({caster:a,inst:skill,remaining:2,total:2,timer:0,interval:.4,fade:.25,powerMult:2});else execute(a,skill,a.pos,{dmgMult:.5});
  assert.deepEqual(inspect(),c.after,c.name+': scheduled');observations++;
  for(const step of c.steps){time=step.time;power=step.power;a.dead=step.dead;runtime.advance(step.dt);assert.deepEqual(inspect(),step.expected,c.name+': '+step.dt);observations++;}
}
console.log({passed:true,originalTimedCourses:fixture.courses.length,observations,composedServices:4,allCombatFamiliesQualified:false});
