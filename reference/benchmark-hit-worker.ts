import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,type SkillEffect} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';

// Same five workloads and reset costs as benchmark-hit-status.ts. Each worker
// keeps its graph warm while the controller alternates short measured batches.
bootSimEngine();
function course(name:string,seed:number) {
  assert(['plain','authored','stat','rider','impale'].includes(name));
  const restore=seedGlobalRandom(seed),w=makeSimWorld('guardian',seed),p=w.player;
  const target=w.createMonster('zombie',1,'enemy');target.id=70;target.noBounty=true;target.skills=[];target.stationary=true;
  target.pos={x:p.pos.x+40,y:p.pos.y};target.tier=p.tier;w.actors=[p,target];w.zone.level=10;
  p.skills.fill(null);p.buffs.clear();p.statuses=[];
  p.sheet.setSource('hit-benchmark',[mod('life','override',1e9),mod('mana','override',1e9),mod('critChance','override',0),mod('accuracy','override',100000),mod('effectDuration','override',1),
    ...(name==='stat'?[mod('apply_burn','override',1)]:[]),...(name==='impale'?[mod('impalePower','override',.25)]:[])]);
  target.sheet.setSource('hit-benchmark',[mod('life','override',1e9),mod('evasion','override',0),mod('blockChance','override',0),mod('armor','override',0),mod('poise','override',0),mod('afflictionExpiry','override',1)]);
  p.fillResources();target.fillResources();
  const effects:SkillEffect[]=[{type:'damage'},...(name==='authored'?[{type:'status',status:'burn',chance:1,magnitude:.3} as const]:[])];
  const inst=makeSkillInstance({...SKILLS.firebolt,tree:undefined,leveling:undefined,baseDamage:{physical:[100,100],fire:[20,20]},effects},1);
  const random=mulberry32(seed);let draws=0;Math.random=()=>{draws++;return random();};
  const one=()=>{
    if(name==='rider')p.addBuff({type:'buff',id:'measured-rider',duration:8,mods:[],nextHit:{status:'burn',addedDamage:{cold:15}}});
    w['resolveHit'](p,inst,target,1,0);
    const damage=1e9-target.life;assert(!target.dead);
    target.life=1e9;p.life=1e9;w.texts.length=0;w.flashes.length=0;
    return damage;
  };
  const gc=(globalThis as unknown as {gc?:()=>void}).gc;assert(gc);
  let before=0,begun=false;
  return {
    restore,
    warmup(count:number){for(let i=0;i<count;i++)one();},
    begin(){gc();before=process.memoryUsage().heapUsed;begun=true;},
    batch(count:number){assert(begun);let damageSum=0;const start=performance.now();for(let i=0;i<count;i++)damageSum+=one();const elapsedMs=performance.now()-start;
      return {elapsedMs,count,check:{damageSum,draws,statuses:target.statuses.map(s=>({...s})),buffs:p.buffs.size,dead:target.dead}};},
    finish(){assert(begun);gc();return {retainedHeapDelta:process.memoryUsage().heapUsed-before};},
  };
}
type Message={id:number;command:string;workload?:string;seed?:number;count?:number};
let active:ReturnType<typeof course>|undefined;
process.on('message',(raw:unknown)=>{
  const message=raw as Message;
  try {
    assert(Number.isSafeInteger(message.id));let value:unknown;
    if(message.command==='setup'){active?.restore();active=undefined;assert(typeof message.workload==='string');assert(Number.isSafeInteger(message.seed));active=course(message.workload,message.seed!);}
    else if(message.command==='stop'){active?.restore();active=undefined;}
    else {assert(active);if(message.command==='warmup'||message.command==='batch'){assert(Number.isSafeInteger(message.count)&&message.count!>0&&message.count!<=1_000_000);value=active[message.command](message.count!);}
      else if(message.command==='begin')value=active.begin();else if(message.command==='finish')value=active.finish();else throw Error('Unknown worker command');}
    process.send!({id:message.id,ok:true,value},()=>{if(message.command==='stop')process.disconnect!();});
  }catch(error){process.send!({id:message.id,ok:false,error:error instanceof Error?error.message:String(error)});}
});
process.on('disconnect',()=>{active?.restore();process.exit(0);});
process.send!({ready:true,node:process.version});
