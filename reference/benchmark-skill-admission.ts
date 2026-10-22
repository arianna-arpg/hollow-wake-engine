import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import * as arena from '../src/sim/arena';import * as skills from '../src/engine/skills';import {SKILLS} from '../src/data/skills';import {Actor} from '../src/engine/actor';import {seedGlobalRandom} from '../src/sim/rng';
const [previous,current,output]=process.argv.slice(2);
const load=async(game:string)=>{const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);return {arena:await get('src/sim/arena.ts'),skills:await get('src/engine/skills.ts'),...await get('src/data/skills.ts'),...await get('src/engine/actor.ts'),...await get('src/sim/rng.ts')};};
const apis:any={original:{arena,skills,SKILLS,Actor,seedGlobalRandom},previous:await load(previous),current:await load(current)},keys=Object.keys(apis),configs:any={},results:any[]=[];
for(const key of keys){
 const api=apis[key];api.arena.bootSimEngine();const restore=api.seedGlobalRandom(301500);let world:any;try{world=api.arena.makeSimWorld('warrior',301500);}finally{restore();}
 for(const id of Object.keys(world.meta.baseAttrs))world.meta.baseAttrs[id]=50;world.recalcPlayer();
 const actors=Array.from({length:32},(_,index)=>{
  const actor=new api.Actor('Admission worker','player',{x:500,y:500}),ids=['ruin','scattergun','life_flask','transgression'];
  const inst=api.skills.makeSkillInstance(api.SKILLS[ids[index%ids.length]],1,0);
  for(const[id,value]of Object.entries({life:1000,mana:1000,energyShield:0,castSpeed:1,attackSpeed:1,lifeRegen:0,manaRegen:0}))actor.sheet.setBase(id,value);
  actor.skills=[inst];actor.fillResources();actor.life=800;actor.charges.set('flask_life',1);
  if(index%8===1)actor.skillChargeBank(inst).count=0;
  if(index%8===4)actor.useLock=1;
  if(index%8===6)actor.casting={mode:'cast',inst:api.skills.makeSkillInstance(api.SKILLS.ruin,1,0)};
  if(index%8===7)actor.casting={mode:'guard',inst:api.skills.makeSkillInstance(api.SKILLS.shield_up,1,0)};
  return {actor,inst};
 });
 const native=['ruin','firebolt','scattergun','phalanx_thrust'].map(id=>api.skills.makeSkillInstance(api.SKILLS[id],1,0));
 world.player.skills=native;for(const inst of native)world.meta.knownSkills.set(inst.def.id,inst);
 world.player.sheet.setBase('mana',10000);world.player.fillResources();
 configs[key]={world,actors,native};
}
function run(key:string,native:boolean){
 const {world,actors,native:definitions}=configs[key];let admitted=0,refused=0,hud=0,press=0;
 if(!native){
  for(let frame=0;frame<256;frame++)for(const {actor,inst}of actors){if(actor.canUse(inst))admitted++;else refused++;}
  return {admitted,refused,actors:actors.map(({actor:a}:any)=>({mana:a.mana,life:a.life,banks:[...a.skillChargeState],cast:a.casting?.mode??null}))};
 }
 const a=world.player,aim={x:a.pos.x+120,y:a.pos.y};
 for(let index=0;index<1024;index++){
  const inst=definitions[index%definitions.length];a.casting=null;a.useLock=0;a.reflexLock=0;a.cooldowns.clear();a.mana=index%8===0?0:10000;
  if(inst.def.id==='scattergun')a.skillChargeBank(inst).count=3;
  if(world.skillUsable(a,inst))hud++;if(world.pressUsable(a,inst))press++;
  if(world.useSkill(a,inst,aim,true))admitted++;else refused++;
 }
 return {admitted,refused,hud,press,mana:a.mana,life:a.life,banks:[...a.skillChargeState],cast:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode}:null};
}
for(const[name,native]of [['mixed-actor-admission',false],['native-hud-press-query-and-cast-start',true]] as const){
 const samples:Record<string,number[]>=Object.fromEntries(keys.map(k=>[k,[]]));let expected='';
 for(let trial=-5;trial<25;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length];
  const start=performance.now(),result=run(key,native),elapsed=performance.now()-start,actual=JSON.stringify(result);
  if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);if(trial>=0)samples[key].push(elapsed);
 }
 const timing=Object.fromEntries(keys.map(k=>{const sorted=[...samples[k]].sort((a,b)=>a-b);return[k,{samplesMs:samples[k],medianMs:sorted[12],p95Ms:sorted[23]}];}));
 const receipt=JSON.parse(expected);assert(receipt.admitted>0&&receipt.refused>0);
 results.push({name,operations:native?1024:8192,derivedSha256:createHash('sha256').update(expected).digest('hex'),receipt,...timing});console.log(name+': '+keys.map(k=>k+'='+timing[k].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'32 real actors across ready spells, empty/funded ammunition, reflex flasks, body lock and held guard combinations: 8192 Actor.canUse decisions. Native course: 1024 real player HUD queries, press queries and World.useSkill starts with Ruin, Firebolt, Scattergun and Phalanx Thrust. Native body/resources reset inside timing; no completed effect simulation. Five warmups and 25 rotating samples; all derived results equal across original, v0.25 and candidate. Desktop Node path timings, not allocation, renderer frames or device acceptance.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,results},null,2)+'\n',{flag:'wx'});
