// Independent installed-binding checks. Explicit queue restoration is a host
// diagnostic; real loadZone must still invalidate the old invocation.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld,SIM_ARENA_ID} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';import {Actor} from '../src/engine/actor';import {StatSheet} from '../src/engine/stats';
import {procPowerStat,type ProcDef} from '../src/data/procs';
bootSimEngine();const restore=seedGlobalRandom(0xc044),rows:unknown[]=[];
function setup(){
 const w=makeSimWorld('warrior',0xc044),p=w.player;p.pos={x:700,y:700};p.level=5;p.tier=0;
 const actors=['a','b'].map(name=>{const a=new Actor(name,'player',{x:710,y:700});a.sheet=new StatSheet();a.sheet.setBase('life',1000);a.life=500;a.es=0;a.ward=0;a.tier=0;return a;});w.actors=[...actors,p];w.time=10;w.flashes=[];
 const schedule=(id:string,base:number,delay=0)=>{const proc:ProcDef={id:'__m40_host_'+id,name:id,color:'#abcdef',trigger:'hit',procCue:false,effect:{type:'delayedBurst',at:'self',delay,radius:100,healAllies:{base,perLevel:0}}};p.sheet.setBase(procPowerStat(proc.id),1);w['executeProc'](proc,p,null,null,3);};
 return{w,p,a:actors[0],b:actors[1],schedule};
}
try{
 {
  const s=setup();s.schedule('visuals',31,.25);const entry=s.w['pendingBursts'][0];assert.deepEqual(s.w.flashes[0],{pos:{x:700,y:700},radius:100,color:'#abcdef',life:.25,maxLife:.25,edgeFrac:.94});assert.notEqual(s.w.flashes[0].pos,entry.at);
  s.w.time=10.25;s.w['updatePendingBursts']();assert.deepEqual(s.w.flashes[1],{pos:{x:700,y:700},radius:100,color:'#abcdef',life:.3,maxLife:.3});assert.notEqual(s.w.flashes[1].pos,entry.at);rows.push({name:'native-warning-and-impact-shapes',flashes:s.w.flashes});
 }
 for(const stage of ['flash','heal'] as const){
  const s=setup();s.schedule('future',11,100);s.schedule('current',31);const queue=s.w['pendingBursts'];let reset=false,newAreaHeals=0,lateTexts=0;
  // Retain a real player through loading and put it inside the old burst. An
  // absent/out-of-range new-area actor would conceal a missed cancellation.
  const resetZone=()=>{s.w.loadZone(SIM_ARENA_ID);assert(s.w.actors.includes(s.p));s.p.pos={x:700,y:700};s.w['pendingBursts']=queue;reset=true;};
  const playerHeal=s.p.healBy.bind(s.p);s.p.healBy=n=>{if(reset)newAreaHeals++;return playerHeal(n);};
  const text=s.w.text.bind(s.w);s.w.text=(...args)=>{if(reset)lateTexts++;return text(...args);};
  if(stage==='flash'){
   const flashes=s.w.flashes,push=flashes.push;flashes.push=function(...values){const result=push.apply(this,values);if(!reset&&values.some(f=>f.color==='#abcdef'&&f.maxLife===.3))resetZone();return result;};
  }else{const heal=s.a.healBy.bind(s.a);s.a.healBy=n=>{const gained=heal(n);resetZone();return gained;};}
  s.w['updatePendingBursts']();assert(reset);assert.equal(s.w.zone.id,SIM_ARENA_ID);assert(!s.w.actors.includes(s.a));assert(!s.w.actors.includes(s.b));assert.equal(s.w['pendingBursts'],queue);assert.equal(queue.length,1);assert.equal(s.a.life,stage==='heal'?531:500);assert.equal(s.b.life,500);assert.equal(newAreaHeals,0);assert.equal(lateTexts,0);
  rows.push({name:'native-zone-reset-and-reference-restore-after-'+stage,firstLife:s.a.life,secondLife:s.b.life,pending:queue.length,newAreaHeals,lateTexts});
 }
 {
  const a=setup(),b=setup();a.w.actors=[a.a];b.w.actors=[b.b];a.schedule('outer',11);b.schedule('inner',31);const heal=a.a.healBy.bind(a.a);a.a.healBy=n=>{const gained=heal(n);b.w['updatePendingBursts']();return gained;};a.w['updatePendingBursts']();assert.equal(a.a.life,511);assert.equal(b.b.life,531);assert.equal(a.w['pendingBursts'].length,0);assert.equal(b.w['pendingBursts'].length,0);rows.push({name:'independent-world-nesting',outerLife:a.a.life,innerLife:b.b.life});
 }
 assert.equal(rows.length,4);assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({courses:rows.length,rows},null,2)+'\n');
}finally{restore();}
