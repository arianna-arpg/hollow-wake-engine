// Active native aftermath workloads. Audit receipts and independent arithmetic
// are checked before timing; simulation state remains owned by this worker.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {SIM_TAP} from '../src/engine/tap';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,type SupportDef} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import type {Actor} from '../src/engine/actor';

bootSimEngine();
function course(name:string,population:number,seed:number) {
  assert(['sharing','spread','splash','combined'].includes(name));
  assert([8,64,256].includes(population));
  const sharing=name==='sharing'||name==='combined',spread=name==='spread'||name==='combined',splash=name==='splash'||name==='combined';
  const restoreRandom=seedGlobalRandom(seed),priorTap=SIM_TAP.current,w=makeSimWorld('guardian',seed),p=w.player;
  const actors:Actor[]=[p];p.id=1;w.actors=actors;w.zone.level=10;w.time=4;w.metaProgressionActive=()=>false;
  const origin={...p.pos};
  for(let i=1;i<population;i++){const actor=w.createMonster('zombie',1,'enemy');actor.id=i+1;actors.push(actor);}
  const target=actors[1];
  for(let i=0;i<actors.length;i++) {
    const a=actors[i];a.noBounty=true;a.skills.fill(null);a.statuses.length=0;a.buffs.clear();a.brain=undefined;
    a.team=i===0?'player':'enemy';a.tier=0;a.stationary=true;a.facing=0;a.radius=12;
    a.pos={x:origin.x+(i===0?0:i===1?30:60),y:origin.y};
    if(i>=2&&sharing)a.owner=target;
    a.sheet.setSource('aftermath-benchmark',[
      mod('life','override',10000),mod('mana','override',10000),mod('energyShield','override',0),mod('poise','override',0),
      mod('critChance','override',0),mod('accuracy','override',100000),mod('ambushBonus','override',0),
      mod('evasion','override',0),mod('blockChance','override',0),mod('armor','override',0),
      mod('lifeOnHit','override',0),mod('lifeLeech','override',0),mod('vampiricShare','override',0),mod('bondShare','override',0),
      mod('minionShare','override',i===1&&sharing?.5:0),
      mod('splashRadius','override',i===0&&splash?60:0),mod('aoeRadius','override',1),
      mod('afflictionExpiry','override',1),mod('effectDuration','override',1),
    ]);a.fillResources();a.life=9000;
  }
  const inst=makeSkillInstance({...SKILLS.firebolt,id:'benchmark-aftermath',name:'Benchmark aftermath',tree:undefined,leveling:undefined,
    tags:['spell','physical'],baseDamage:{physical:[100,100]},effects:[{type:'damage'}]},1);
  if(spread) {
    const def:SupportDef={id:'benchmark-aftermath-spread',name:'Benchmark spread',description:'Native benchmark fixture',color:'#abcdef',weight:1,mods:[],
      spreadOnHit:{chance:1,radius:60,strengthScale:.5,duration:'remaining',durationScale:.75}};
    inst.sockets.push({def,level:1});target.applyStatus('burn',12,1,'benchmark source');
  }
  const sourceStatus=target.statuses.find(s=>s.id==='burn');
  if(spread)assert(sourceStatus&&sourceStatus.dps>0&&sourceStatus.remaining>0);
  const initialStatus=sourceStatus?{dps:sourceStatus.dps,remaining:sourceStatus.remaining,stacks:sourceStatus.stacks}:null;
  const random=mulberry32(seed),hitCounts=new Uint32Array(population),hitDamage=new Float64Array(population);
  let draws=0,roots=0,auditing=false,order:number[]=[],begun=false,before=0;
  Math.random=()=>{draws++;return random();};
  // Read-only counters remain in both measured paths. They distinguish actual
  // landed damage from aftermath life transfers without replacing host behavior.
  SIM_TAP.current={onHit:(author,victim,result)=>{
    assert.equal(author,p);assert(result.total>0);assert(victim.id>=2&&victim.id<=population);
    hitCounts[victim.id-1]++;hitDamage[victim.id-1]+=result.total;
    if(auditing)order.push(victim.id);
  }};
  const clear=()=>{draws=0;roots=0;hitCounts.fill(0);hitDamage.fill(0);order=[];};
  const one=()=>{
    // The reset is equal and timed. No actors are copied or re-created per hit.
    // Native status spread still creates its ordinary application record.
    for(let i=0;i<actors.length;i++){actors[i].life=9000;if(i>=2)actors[i].statuses.length=0;}
    w.texts.length=0;w.flashes.length=0;
    w['resolveHit'](p,inst,target,1,0);roots++;
  };
  const check=()=>({roots,draws,initialStatus,hits:actors.map((a,i)=>({id:a.id,count:hitCounts[i],damage:hitDamage[i]})),
    last:{order:w.actors.map(a=>a.id),actors:actors.map(a=>({id:a.id,life:a.life,dead:a.dead,hitFlash:a.hitFlash,hitFlashType:a.hitFlashType??null,
      statuses:a.statuses.map(s=>({id:s.id,dps:s.dps,remaining:s.remaining,stacks:s.stacks,sourceName:s.sourceName}))})),texts:w.texts,flashes:w.flashes},
    ...(auditing?{hitOrder:order}:{})});
  const gc=(globalThis as unknown as {gc?:()=>void}).gc;assert(gc);
  return {
    restore(){SIM_TAP.current=priorTap;restoreRandom();},
    audit(count:number){clear();auditing=true;for(let i=0;i<count;i++)one();const result=check();auditing=false;return result;},
    warmup(count:number){for(let i=0;i<count;i++)one();},
    begin(){clear();gc();before=process.memoryUsage().heapUsed;begun=true;},
    batch(count:number){assert(begun);clear();const start=performance.now();for(let i=0;i<count;i++)one();const elapsedMs=performance.now()-start;return{elapsedMs,count,check:check()};},
    finish(){assert(begun);gc();return{retainedHeapDelta:process.memoryUsage().heapUsed-before};},
  };
}
type Message={id:number;command:string;workload?:string;population?:number;seed?:number;count?:number};
let active:ReturnType<typeof course>|undefined;
process.on('message',(raw:unknown)=>{
  const m=raw as Message;
  try {
    assert(Number.isSafeInteger(m.id));let value:unknown;
    if(m.command==='setup'){active?.restore();active=undefined;assert(typeof m.workload==='string');assert(Number.isSafeInteger(m.population));assert(Number.isSafeInteger(m.seed));active=course(m.workload,m.population!,m.seed!);}
    else if(m.command==='stop'){active?.restore();active=undefined;}
    else {assert(active);if(m.command==='audit'||m.command==='warmup'||m.command==='batch'){assert(Number.isSafeInteger(m.count)&&m.count!>0&&m.count!<=100000);value=active[m.command](m.count!);}
      else if(m.command==='begin')value=active.begin();else if(m.command==='finish')value=active.finish();else throw Error('Unknown aftermath benchmark command');}
    process.send!({id:m.id,ok:true,value},()=>{if(m.command==='stop')process.disconnect!();});
  }catch(e){process.send!({id:m.id,ok:false,error:e instanceof Error?e.message:String(e)});}
});
process.on('disconnect',()=>{active?.restore();process.exit(0);});
process.send!({ready:true,node:process.version});
