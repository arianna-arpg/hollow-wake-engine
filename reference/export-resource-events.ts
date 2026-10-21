import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {MONSTERS} from '../src/data/monsters';
import {makeSkillInstance,instanceChargeGain,type SkillInstance,type ChargeGainSpec} from '../src/engine/skills';
import type {GaugeFeedSpec} from '../src/engine/gauge';
import {treeGraph} from '../src/engine/skilltree';
import {mod} from '../src/engine/stats';

bootSimEngine();
const wire=(v:unknown):any=>JSON.parse(JSON.stringify(v));
const rows:{id:string;spec:GaugeFeedSpec}[]=[];
for(const def of Object.values(SKILLS)){
 for(const [i,spec] of (def.chargeGain??[]).entries())rows.push({id:'skill:'+def.id+':'+i,spec});
 for(const [i,spec] of (def.gauge?.feeds??[]).entries())rows.push({id:'gauge:'+def.id+':'+i,spec});
 const graph=treeGraph(def);if(graph)for(const id of graph.order){
  const inst=makeSkillInstance(def,20,4);inst.treeNodes=[id];
  for(const [i,spec] of instanceChargeGain(inst).entries())if(!(def.chargeGain??[]).includes(spec))rows.push({id:'tree:'+def.id+':'+id+':'+i,spec});
 }
}
for(const def of Object.values(SUPPORTS))for(const [i,spec] of (def.chargeGain??[]).entries())rows.push({id:'support:'+def.id+':'+i,spec});
const authoredRows=rows.length;
for(const on of ['hit','kill','takeHit','block','enemyDeath','allyDeath','second','move','orbPickup','channelSecond','channelFinish','use'] as const){
 rows.push({id:'synthetic:filters:'+on,spec:{on,amount:1,radius:30,orbKind:'life',eliteVictim:true,whileToggled:true,chance:.5}});
}
for(const p of [0,1,.5])rows.push({id:'synthetic:chance:'+p,spec:{on:'hit',amount:1,chance:p}});
const restore=seedGlobalRandom(230000),predicates:any[]=[],courses:any[]=[];
try{
 const w=makeSimWorld('swashbuckler',230000),aw:any=w,a:any=w.player,inst=makeSkillInstance(SKILLS.firebolt,20,4),victim=w.createMonster('zombie',1,'enemy');
 const boss=Object.values(MONSTERS).find(d=>d.boss);assert(boss);
 const contexts=[
  {name:'eligible',toggle:'aura',victim:'rare',distance:0,roll:.25},
  {name:'summon-toggle',toggle:'summon',victim:'rare',distance:0,roll:.25},
  {name:'inactive',toggle:'off',victim:'rare',distance:0,roll:.25},
  {name:'wrong-event',toggle:'aura',victim:'rare',distance:0,roll:.25,wrongEvent:true},
  {name:'default-radius-edge',toggle:'aura',victim:'rare',distance:360,roll:.25},
  {name:'default-radius-outside',toggle:'aura',victim:'rare',distance:360.000000001,roll:.25},
  {name:'authored-radius-edge',toggle:'aura',victim:'rare',distance:'edge',roll:.25},
  {name:'authored-radius-outside',toggle:'aura',victim:'rare',distance:'outside',roll:.25},
  {name:'no-position',toggle:'aura',victim:'rare',distance:'none',roll:.25},
  {name:'wrong-orb',toggle:'aura',victim:'rare',distance:0,roll:.25,orb:'other'},
  {name:'missing-orb',toggle:'aura',victim:'rare',distance:0,roll:.25,orb:'none'},
  {name:'no-victim',toggle:'aura',victim:'none',distance:0,roll:.25},
  {name:'normal-victim',toggle:'aura',victim:'normal',distance:0,roll:.25},
  {name:'magic-victim',toggle:'aura',victim:'magic',distance:0,roll:.25},
  {name:'champion-victim',toggle:'aura',victim:'champion',distance:0,roll:.25},
  {name:'crowned-victim',toggle:'aura',victim:'crowned',distance:0,roll:.25},
  {name:'normal-boss',toggle:'aura',victim:'boss',distance:0,roll:.25},
  {name:'zero-roll',toggle:'aura',victim:'rare',distance:0,roll:0},
  {name:'equal-chance',toggle:'aura',victim:'rare',distance:0,roll:'equal'},
  {name:'last-roll',toggle:'aura',victim:'rare',distance:0,roll:.999999999999},
 ] as const;
 for(const row of rows)for(const c of contexts){
  const spec=row.spec,distance=c.distance==='edge'?(spec.radius??360):c.distance==='outside'?(spec.radius??360)+1e-9:c.distance;
  a.pos={x:0,y:0};a.activeAuras.clear();a.summonToggles.clear();
  if(c.toggle==='aura')a.activeAuras.set(inst.def.id,{inst});if(c.toggle==='summon')a.summonToggles.set(inst.def.id,{inst,reserved:0});
  victim.rarity=(c.victim==='boss'||c.victim==='none'?'normal':c.victim) as typeof victim.rarity;victim.defId=c.victim==='boss'?boss.id:'zombie';
  const on='wrongEvent' in c?(spec.on==='hit'?'kill':'hit'):spec.on,at=distance==='none'?undefined:{x:distance,y:0};
  const orbKind='orb' in c?(c.orb==='none'?undefined:'__other_orb__'):(spec.orbKind??'life'),body=c.victim==='none'?undefined:victim;
  const roll=c.roll==='equal'?Math.min(.999999999999,spec.chance??.5):c.roll;const draws:number[]=[];const random=Math.random;Math.random=()=>{draws.push(roll);return roll;};
  let fires:boolean;try{fires=process.argv.includes('--sdk-events')?aw.sdkResourceEvents().fires(a,inst,spec,on,at,orbKind,body):aw.tapFires(a,inst,spec,on,at,orbKind,body);}finally{Math.random=random;}
  const eligibleElite=body?aw.isEliteVictim(body):false;
  predicates.push(wire({row:row.id,context:c.name,input:{spec,on,toggled:c.toggle!=='off',distance:at?distance:null,orbKind:orbKind??null,victimPresent:!!body,elite:eligibleElite,roll},fires,draws}));
 }
 function course(name:string,skills:SkillInstance[],body:(step:(label:string,on:ChargeGainSpec['on'],opts?:{distance?:number;orbKind?:string;elite?:boolean})=>void)=>void){
  a.skills=skills;a.charges.clear();a.chargeState.clear();a.chargeModCount.clear();a.gainEvents=[];a.cooldowns.clear();a.activeAuras.clear();a.summonToggles.clear();
  for(const s of a.sheet.sourceNames())if(s.startsWith('charge:'))a.sheet.removeSource(s);
  const snapshot=()=>wire({charges:[...a.charges],clocks:[...a.chargeState],modifierCounts:[...a.chargeModCount],events:a.gainEvents,cooldowns:[...a.cooldowns],skills:skills.map(s=>({id:s.def.id,state:s.state??null,terms:s.def.gauge?a.gaugeEff(s):null})),sources:a.sheet.sourceNames().filter((s:string)=>s.startsWith('charge:'))});
  const steps:any[]=[];
  body((label,on,opts={})=>{const before=snapshot(),draws:number[]=[];const random=Math.random;Math.random=()=>{const n=[.1,.9,.5,0][draws.length%4];draws.push(n);return n;};
   victim.rarity=opts.elite?'rare':'normal';victim.defId='zombie';try{aw.tapCharges(a,on,opts.distance===undefined?undefined:{x:opts.distance,y:0},opts.orbKind,victim);}finally{Math.random=random;}
   steps.push({label,on,...opts,before,after:snapshot(),draws});
  });courses.push({name,skills:skills.map(s=>wire({id:s.def.id,tags:s.def.tags,taps:instanceChargeGain(s),gauge:s.def.gauge??null})),steps});
 }
 const paired=(id:string)=>makeSkillInstance({...SKILLS.firebolt,id,chargeGain:[{on:'kill',charge:'frenzy',amount:1,max:8,chance:.5}],gauge:{need:4,feeds:[{on:'kill',amount:1,chance:.5},{on:'kill',amount:2,chance:1}],cooldownPer:2}},20,4);
 const first=paired('event_first'),second=paired('event_second');a.sheet.setSource('event-gauge-investment',[mod('gaugeGain','flat',.5)]);
 course('interleaved-charge-gauge-and-cooldown',[first,second],step=>{
  step('initial-order','kill');a.cooldowns.set(first.def.id,3);a.cooldowns.set(second.def.id,1);step('shave-then-later-feed-banks','kill');
  (first.state??={}).gaugeLock=8;(second.state??={}).gaugeLock=8;a.cooldowns.set(first.def.id,1);step('lockout-does-not-prevent-shave','kill');
  a.charges.set('frenzy',8);step('full-bank-still-consumes-rolls','kill');a.startChargeDrain('frenzy',1);step('draining-bank-still-consumes-rolls','kill');
 });
 course('authored-equipped-feed-set',['soul_harvest','reapers_toll','life_flask','bloodlust'].map(id=>{assert(SKILLS[id],id);return makeSkillInstance(SKILLS[id],20,4);}),step=>{
  for(const on of ['hit','kill','takeHit','block','enemyDeath','allyDeath','orbPickup','channelFinish'] as const){step(on+'-normal',on,{distance:0,orbKind:'life'});step(on+'-elite',on,{distance:360,orbKind:'mana',elite:true});}
 });
 const rowsByName=new Map(predicates.map(r=>[r.row+'/'+r.context,r]));
 assert.equal(rowsByName.get('synthetic:chance:0/eligible').fires,false);assert.equal(rowsByName.get('synthetic:chance:0/eligible').draws.length,1);
 assert.equal(rowsByName.get('synthetic:chance:1/eligible').fires,true);assert.equal(rowsByName.get('synthetic:chance:1/eligible').draws.length,1);
 assert.equal(rowsByName.get('synthetic:filters:hit/inactive').draws.length,0);
 assert.equal(rowsByName.get('synthetic:filters:enemyDeath/authored-radius-edge').fires,true);
 assert.equal(rowsByName.get('synthetic:filters:enemyDeath/authored-radius-outside').fires,false);
 assert.equal(rowsByName.get('synthetic:filters:hit/equal-chance').fires,false);
}finally{restore();}
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'M23 investigation: original equipped resource feed predicate and dispatch, not special use/minion carry paths',authoredRows,rows,predicates,courses})+'\n',{flag:'wx'});
console.log(JSON.stringify({authoredRows,predicateCases:predicates.length,courses:courses.length,transitions:courses.reduce((n,c)=>n+c.steps.length,0)}));
