import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {makeSimWorld, bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom, mulberry32} from '../src/sim/rng';
import {SIM_TAP} from '../src/engine/tap';
import {mod} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import type {Actor} from '../src/engine/actor';

bootSimEngine();
function course(name: string, population: number, seed: number) {
  assert(['idle','siphon','share','sparse','bond','trees','combined'].includes(name));
  assert([8,64,256].includes(population));
  const restoreRandom=seedGlobalRandom(seed), priorTap=SIM_TAP.current;
  const w=makeSimWorld('guardian',seed), p=w.player, actors:Actor[]=[p];
  p.id=1; w.actors=actors; w.zone.level=10; w.time=4; w.metaProgressionActive=()=>false;
  for(let i=1;i<population;i++) {
    const a=w.createMonster('zombie',1,'enemy'); a.id=i+1; actors.push(a);
  }
  const target=actors[1], trees:Actor[]=[];
  for(let i=0;i<actors.length;i++) {
    const a=actors[i]; a.noBounty=true; a.skills.fill(null); a.statuses=[]; a.buffs.clear();
    a.team=i===1?'enemy':'player'; a.tier=0; a.stationary=true; a.facing=0;
    a.pos={x:p.pos.x+(i===0?0:30),y:p.pos.y}; a.radius=12;
    a.sheet.setSource('sustain-benchmark',[
      mod('life','override',10000),mod('mana','override',10000),mod('energyShield','override',0),
      mod('critChance','override',0),mod('accuracy','override',100000),mod('ambushBonus','override',0),
      mod('evasion','override',0),mod('blockChance','override',0),mod('armor','override',0),mod('poise','override',0),
      mod('healPower','override',1),mod('healTaken','override',1),mod('lifeOnHit','override',0),mod('lifeLeech','override',0),
      mod('vampiricShare','override',i===0&&['share','sparse','combined'].includes(name)?.25:0),
      mod('bondShare','override',i===0&&['bond','combined'].includes(name)?.5:0),
    ]);
    a.fillResources(); a.life=9000;
    if(i>=2&&name==='sparse'&&i%8!==0) {
      if(i%4===0)a.dead=true;
      else if(i%4===1)a.team='enemy';
      else if(i%4===2)a.tier=1;
      else a.pos.x+=500;
    }
    if(i>=2&&(name==='trees'||name==='combined'&&i%4===0)) {
      a.construct={kind:'tree',range:150,timer:0,healBurst:{ratio:.2,cap:300,radius:100},stored:40,baseRadius:12};
      trees.push(a);
    }
  }
  if(name==='bond'||name==='combined') {
    const a=actors.at(-1)!; a.addBuff({type:'buff',id:'benchmark-bond',duration:10,mods:[]});
    p.bond={targetId:a.id,buffId:'benchmark-bond'};
  }
  const inst=makeSkillInstance({...SKILLS.firebolt,id:'benchmark-sustain',name:'Benchmark sustain',tree:undefined,leveling:undefined,
    baseDamage:{physical:[100,100]},effects:[{type:'damage'}],
    siphon:name==='siphon'||name==='combined'?.5:undefined,bondFeed:1.5},1);
  const random=mulberry32(seed), counts=new Uint32Array(population), gains=new Float64Array(population);
  let draws=0,hits=0,damage=0,unitDamage:number|undefined,auditing=false,order:number[]=[],begun=false,before=0;
  Math.random=()=>{draws++;return random();};
  SIM_TAP.current={
    onHit:(author,victim,result)=>{assert.equal(author,p);assert.equal(victim,target);assert(result.total>0);unitDamage??=result.total;assert.equal(result.total,unitDamage);hits++;damage+=result.total;},
    onHeal:(a,amount)=>{counts[a.id-1]++;gains[a.id-1]+=amount;if(auditing)order.push(a.id);},
  };
  const clearCounters=()=>{draws=0;hits=0;damage=0;counts.fill(0);gains.fill(0);order=[];};
  const one=()=>{
    // Equal reset work is inside timing. Recovery remains native; cues coalesce
    // across hits, while floating text is drained as a renderer would consume it.
    for(const a of actors){a.life=9000;a.healedSince=0;}
    for(const a of trees){a.construct!.stored=40;a.radius=12;}
    w.texts.length=0;w.flashes.length=0;
    w['resolveHit'](p,inst,target,1,0);
  };
  const check=()=>({hits,damage,unitDamage,draws,heals:actors.map((a,i)=>({id:a.id,count:counts[i],total:gains[i]})),
    last:{order:w.actors.map(a=>a.id),actors:actors.map(a=>({id:a.id,life:a.life,dead:a.dead,radius:a.radius,
      stored:a.construct?.stored??null,healedSince:a.healedSince,bond:a.bond??null,
      gains:a.restoreGains,flows:a.resourceFlows})),texts:w.texts,flashes:w.flashes},
    ...(auditing?{healingOrder:order}:{})});
  const gc=(globalThis as unknown as {gc?:()=>void}).gc;assert(gc);
  return {
    restore(){SIM_TAP.current=priorTap;restoreRandom();},
    audit(count:number){clearCounters();auditing=true;for(let i=0;i<count;i++)one();const result=check();auditing=false;return result;},
    warmup(count:number){for(let i=0;i<count;i++)one();},
    begin(){clearCounters();gc();before=process.memoryUsage().heapUsed;begun=true;},
    batch(count:number){assert(begun);clearCounters();const start=performance.now();for(let i=0;i<count;i++)one();const elapsedMs=performance.now()-start;return {elapsedMs,count,check:check()};},
    finish(){assert(begun);gc();return {retainedHeapDelta:process.memoryUsage().heapUsed-before};},
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
      else if(m.command==='begin')value=active.begin();else if(m.command==='finish')value=active.finish();else throw Error('Unknown sustain benchmark command');}
    process.send!({id:m.id,ok:true,value},()=>{if(m.command==='stop')process.disconnect!();});
  }catch(e){process.send!({id:m.id,ok:false,error:e instanceof Error?e.message:String(e)});}
});
process.on('disconnect',()=>{active?.restore();process.exit(0);});
process.send!({ready:true,node:process.version});
