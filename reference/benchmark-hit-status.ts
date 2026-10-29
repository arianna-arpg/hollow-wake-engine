import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,type SkillEffect} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';

// Compare complete native resolveHit calls, without per-event trace observers.
// Reset costs are included equally. No renderer, timer sweep or simulation of
// target hardware is included. Heap deltas are not total allocation counts.
bootSimEngine();
const plan=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const results=[];
for(const name of plan.workloads as string[]){
 const restore=seedGlobalRandom(plan.seed),w=makeSimWorld('guardian',plan.seed),p=w.player;
 const target=w.createMonster('zombie',1,'enemy');target.id=70;target.noBounty=true;target.skills=[];target.stationary=true;
 target.pos={x:p.pos.x+40,y:p.pos.y};target.tier=p.tier;w.actors=[p,target];w.zone.level=10;
 p.skills.fill(null);p.buffs.clear();p.statuses=[];
 p.sheet.setSource('hit-benchmark',[mod('life','override',1e9),mod('mana','override',1e9),mod('critChance','override',0),mod('accuracy','override',100000),mod('effectDuration','override',1),
  ...(name==='stat'?[mod('apply_burn','override',1)]:[]),...(name==='impale'?[mod('impalePower','override',.25)]:[])]);
 target.sheet.setSource('hit-benchmark',[mod('life','override',1e9),mod('evasion','override',0),mod('blockChance','override',0),mod('armor','override',0),mod('poise','override',0),mod('afflictionExpiry','override',1)]);
 p.fillResources();target.fillResources();
 const effects:SkillEffect[]=[{type:'damage'},...(name==='authored'?[{type:'status',status:'burn',chance:1,magnitude:.3} as const]:[])];
 const inst=makeSkillInstance({...SKILLS.firebolt,tree:undefined,leveling:undefined,baseDamage:{physical:[100,100],fire:[20,20]},effects},1);
 const random=mulberry32(plan.seed);let draws=0;Math.random=()=>{draws++;return random();};
 const one=()=>{
  if(name==='rider')p.addBuff({type:'buff',id:'measured-rider',duration:8,mods:[],nextHit:{status:'burn',addedDamage:{cold:15}}});
  w['resolveHit'](p,inst,target,1,0);
  const damage=1e9-target.life;assert(!target.dead);
  target.life=1e9;p.life=1e9;w.texts.length=0;w.flashes.length=0;
  return damage;
 };
 try{
  for(let i=0;i<plan.warmup;i++)one();
  const gc=(globalThis as unknown as {gc?:()=>void}).gc;assert(gc);gc();const before=process.memoryUsage().heapUsed;
  const samples=[];let damageSum=0;
  for(let round=0;round<plan.samples;round++){
   const start=performance.now();for(let i=0;i<plan.batch;i++)damageSum+=one();samples.push((performance.now()-start)/plan.batch);
  }
  gc();const retainedHeapDelta=process.memoryUsage().heapUsed-before;
  results.push({name,samplesMsPerHit:samples,retainedHeapDelta,check:{damageSum,draws,statuses:target.statuses.map(s=>({...s})),buffs:p.buffs.size,dead:target.dead}});
 }finally{restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,node:process.version,results},null,2)+'\n');
