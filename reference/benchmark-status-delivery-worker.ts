// Whole native execution with active statuses on every cycle. Setup/reset and
// retirement are timed equally; snapshots, IPC and explicit GC are not timed.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {SIM_TAP} from '../src/engine/tap';
import {mod} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import type {Actor} from '../src/engine/actor';

bootSimEngine();
function course(name:string,population:number,seed:number) {
  assert(['siphon','recall-cached','recall-tree'].includes(name));
  assert([8,64,256].includes(population));
  const siphon=name==='siphon',tree=name==='recall-tree';
  const restoreRandom=seedGlobalRandom(seed),priorTap=SIM_TAP.current,w=makeSimWorld('guardian',seed),p=w.player;
  const actors:Actor[]=[p];p.id=1;w.actors=actors;w.zone.level=10;w.time=4;w.metaProgressionActive=()=>false;SIM_TAP.current=null;
  const origin={...p.pos};
  for(let i=1;i<population;i++){const actor=w.createMonster('zombie',1,'enemy');actor.id=i+1;actors.push(actor);}
  for(let i=0;i<actors.length;i++) {
    const a=actors[i];a.noBounty=true;a.skills.fill(null);a.statuses.length=0;a.buffs.clear();a.brain=undefined;
    a.team=i===0||siphon?'player':'enemy';a.tier=p.tier;a.stationary=true;a.facing=0;a.radius=12;
    a.pos={x:origin.x+(i===0?0:40),y:origin.y};
    a.sheet.setSource('status-delivery-benchmark',[
      mod('life','override',10000),mod('mana','override',10000),mod('energyShield','override',0),mod('poise','override',0),
      mod('armor','override',0),mod('damageTaken','override',1),mod('critChance','override',0),mod('accuracy','override',100000),
      mod('evasion','override',0),mod('blockChance','override',0),mod('aoeRadius','override',1),mod('healPower','override',1),
      mod('effectDuration','override',1),mod('afflictionExpiry','override',1),mod('lifeOnHit','override',0),mod('lifeLeech','override',0),
    ]);a.fillResources();a.life=9000;
  }
  const base=siphon?SKILLS.draw_corruption:SKILLS.spear_recall;
  const inst=makeSkillInstance({...base,tree:tree?base.tree:undefined},tree?20:1);
  if(tree)inst.treeNodes=['rending_extraction'];
  const aim={...p.pos},options={noCooldown:true,noRepeat:true,keepFacing:true};
  const random=mulberry32(seed);let roots=0,draws=0,launches=0,retired=0,begun=false,before=0;
  let lastSpears:typeof w.projectiles=[];
  Math.random=()=>{draws++;return random();};
  const one=()=>{
    for(const actor of actors){
      for(const status of actor.statuses)actor.sheet.removeSource('status:'+status.id);
      actor.statuses.length=0;actor.life=9000;
    }
    w.texts.length=0;w.flashes.length=0;w.projectiles.length=0;
    // Re-arm with native application, including its modifier/cache work. No
    // empty second iteration can stand in for an active delivery workload.
    for(let i=1;i<actors.length;i++)actors[i].applyStatus(siphon?'burn':'impaled',12,1,'benchmark source',
      {casterId:p.id,rupture:siphon?undefined:100,ruptureType:'physical'});
    w.executeSkill(p,inst,aim,options);roots++;
    lastSpears=w.projectiles;launches+=lastSpears.length;
    if(!siphon){w['clearTreeFields'](p,inst);retired+=lastSpears.length-w.projectiles.length;}
  };
  // Warm the native cache before every audited/measured schedule. All three
  // implementations perform this same unmeasured prime.
  one();
  const clear=()=>{roots=0;draws=0;launches=0;retired=0;};
  const check=()=>({roots,draws,launches,retired,last:{order:w.actors.map(a=>a.id),actors:actors.map(a=>({id:a.id,life:a.life,dead:a.dead,
    statuses:a.statuses.map(s=>({id:s.id,dps:s.dps,remaining:s.remaining,stacks:s.stacks,sourceName:s.sourceName}))})),
    spearCount:lastSpears.length,spearInstances:new Set(lastSpears.map(p=>p.inst)).size,
    spearPhysical:lastSpears.map(p=>p.flat?.physical??null),remainingProjectiles:w.projectiles.length,
    ordinaryCache:p.metaInsts.has('__impale_spear'),texts:w.texts,flashes:w.flashes}});
  const gc=(globalThis as unknown as {gc?:()=>void}).gc;assert(gc);
  return {
    restore(){SIM_TAP.current=priorTap;restoreRandom();},
    audit(count:number){clear();for(let i=0;i<count;i++)one();return check();},
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
      else if(m.command==='begin')value=active.begin();else if(m.command==='finish')value=active.finish();else throw Error('Unknown status delivery benchmark command');}
    process.send!({id:m.id,ok:true,value},()=>{if(m.command==='stop')process.disconnect!();});
  }catch(e){process.send!({id:m.id,ok:false,error:e instanceof Error?e.message:String(e)});}
});
process.on('disconnect',()=>{active?.restore();process.exit(0);});
process.send!({ready:true,node:process.version});
