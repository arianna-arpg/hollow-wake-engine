// Private original-only boundary discovery; all scalar state/queues are seeded.
// This complements real World courses and is not an accepted SDK baseline.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {Actor} from '../src/engine/actor';
import {CONDITION_IDS,StatSheet,type ConditionId} from '../src/engine/stats';
import {RECENT_CONDITIONS,RECENT_KINDS,RECENT_NEVER} from '../src/engine/recency';

bootSimEngine();
function sheet(){const s=new StatSheet();s.setBase('life',100);s.setBase('mana',100);s.setBase('energyShield',100);return s;}
function body(){const a=new Actor('condition-boundary','player',{x:0,y:0});a.sheet=sheet();a.life=100;a.mana=100;a.es=100;a.poise=0;a.idleFor=.5;a.plantFor=0;return a;}
function snapshot(a:Actor){return {life:a.life,mana:a.mana,es:a.es,poise:a.poise,poiseBroken:a.poiseBroken,recharging:a.esRecharging,guard:a.casting?.mode==='guard',plant:a.plantFor,idle:a.idleFor,stride:a.strideDist,strideSpent:a.strideSpent,comboWatch:a.comboWatch,comboLeft:a.comboCondLeft,comboBits:a.comboCondBits,since:[...a.since],mask:a['condMask'],actorConditions:CONDITION_IDS.filter(id=>a.conditionHolds(id)),sheetConditions:CONDITION_IDS.filter(id=>a.sheet.hasCondition(id)),rose:[...a.condRose],sheetMarkerCurrent:a['condSheet']===a.sheet};}
type Observation={label:string,before:ReturnType<typeof snapshot>,after:ReturnType<typeof snapshot>,reads:{stat:string,value:number}[],publications:{active:ConditionId[],maskAtSink:number,roseAtSink:ConditionId[]}[],gauges:number,queueIdentityPreserved:boolean};
const courses:{name:string,steps:Observation[]}[]=[];
function course(name:string,run:(a:Actor,take:(label:string,dt?:number)=>void)=>void){
  const a=body(),steps:Observation[]=[];let armed=false,reads:Observation['reads']=[],publications:Observation['publications']=[],gauges=0;
  const wrapped=new WeakSet<StatSheet>();
  function instrument(){if(wrapped.has(a.sheet))return;wrapped.add(a.sheet);const s=a.sheet,get=s.get.bind(s),publish=s.setConditions.bind(s),gauge=s.setGauges.bind(s);
    s.get=(key,tags,extra)=>{const value=get(key,tags,extra);if(armed)reads.push({stat:key,value});return value;};
    s.setConditions=active=>{publications.push({active:[...active],maskAtSink:a['condMask'],roseAtSink:[...a.condRose]});publish(active);};
    s.setGauges=entries=>{gauges++;gauge(entries);};
  }
  const refresh=a['refreshConditions'].bind(a);a['refreshConditions']=()=>{instrument();armed=true;try{refresh();}finally{armed=false;}};
  const take=(label:string,dt?:number)=>{reads=[];publications=[];gauges=0;const before=snapshot(a),queue=a.condRose;if(dt===undefined)a['refreshConditions']();else a.updateTimers(dt);steps.push({label,before,after:snapshot(a),reads,publications,gauges,queueIdentityPreserved:a.condRose===queue});assert.equal(a.condRose,queue);};
  run(a,take);courses.push({name,steps});
}
for(const [name,field,line]of [['low-life','life',35],['full-life','life',95],['low-mana','mana',25],['full-mana','mana',95],['has-es','es',.5],['full-es','es',99],['low-es','es',35],['poised','poise',.5]] as const){
  course(name+'-threshold',(a,take)=>{for(const [side,value]of [['below',line-.000001],['equal',line],['above',line+.000001]] as const){a[field]=value;take(side);}take('stable-repeat');});
}
course('actor-specific-low-life-line',(a,take)=>{a.sheet.setBase('lowLifeLine',.6);for(const value of [59.999999,60,60.000001]){a.life=value;take(String(value));}a.sheet.setBase('lowLifeLine',0);a.life=0;take('zero-line');});
course('zero-mana-and-shield-maxima',(a,take)=>{a.sheet.setBase('mana',0);a.sheet.setBase('energyShield',0);for(const value of [0,.5,1]){a.mana=value;a.es=value;take(String(value));}});
course('stance-strict-threshold-and-precedence',(a,take)=>{a.idleFor=0;for(const plant of [.999999,1,1.000001]){a.plantFor=plant;take('plant-'+plant);}a.plantFor=0;for(const idle of [.149999,.15,.150001]){a.idleFor=idle;take('idle-'+idle);}a.plantFor=2;a.idleFor=0;take('stationary-precedes-moving');});
course('guard-poise-break-recharge',(a,take)=>{take('birth');a.casting={mode:'guard'} as Actor['casting'];a.poise=10;a.esRecharging=true;take('guard-poised-recharging');a.poiseBroken=true;take('broken-excludes-poised');a.casting=null;a.poise=0;a.esRecharging=false;take('guard-and-recharge-ended');a.poiseBroken=false;take('break-ended');});
for(const row of RECENT_CONDITIONS){course('recency-'+row.id,(a,take)=>{const index=RECENT_KINDS.indexOf(row.kind);for(const [label,value]of [['never',RECENT_NEVER],['below',3.999999],['equal',4],['above',4.000001],['zero',0]] as const){a.since[index]=value;take(label);}take('stable-repeat');});}
course('crit-hurt-counter-has-no-native-condition',(a,take)=>{take('never');a.since[RECENT_KINDS.indexOf('critHurt')]=0;take('stamped');});
course('combo-watch-freshness-bits',(a,take)=>{a.comboCondBits=3;a.comboCondLeft=1;take('unwatched');a.comboWatch=true;for(const bits of [0,1,2,3,4,7]){a.comboCondBits=bits;take('bits-'+bits);}a.comboCondLeft=0;take('expired');a.comboCondLeft=.000001;take('positive-freshness');a.comboWatch=false;take('watch-disabled');});
course('stride-lazy-reach-and-inclusive-threshold',(a,take)=>{a.sheet.setBase('strideReach',100);take('zero-distance-no-reach-query');for(const distance of [99.999999,100,100.000001]){a.strideDist=distance;take(String(distance));}a.sheet.setBase('strideReach',0);take('positive-distance-zero-reach');a.strideDist=0;take('zero-both');});
course('birth-stability-sheet-replacement-last-fold',(a,take)=>{assert(!a.conditionHolds('fullLife'));take('birth');assert.equal(a.condRose.length,0);take('stable');a.life=20;assert(a.conditionHolds('fullLife'));take('life-changed-last-fold-was-full');a.condRose=[];a.sheet=sheet();take('new-sheet-same-condition');assert.equal(a.condRose.length,0);take('new-sheet-stable');a.life=100;take('full-rises');a.life=20;take('low-rises-again');});
for(const length of [14,15,16,17])course('queue-cap-prefilled-'+length,(a,take)=>{
  take('birth');a.condRose=Array<ConditionId>(length).fill('moving');a.life=20;a.mana=20;a.es=20;a.poise=1;a.esRecharging=true;a.casting={mode:'guard'} as Actor['casting'];a.plantFor=2;a.comboWatch=true;a.comboCondLeft=1;a.comboCondBits=3;a.since.fill(0);a.strideDist=100;a.sheet.setBase('strideReach',100);take('many-rises');assert.equal(a.condRose.length,Math.max(length,16));take('stable-full-queue');
  a.condRose=[];a.life=100;a.mana=100;a.es=100;a.poise=0;a.esRecharging=false;a.casting=null;a.plantFor=0;a.comboWatch=false;a.since.fill(RECENT_NEVER);a.strideDist=0;take('fall-and-inverse-rise');a.life=20;take('low-rises-after-drain');
});
course('timer-phase-recency-combo-expiry',(a,take)=>{a.since[0]=3.99;a.comboWatch=true;a.comboCondBits=3;a.comboCondLeft=.01;take('fold-before-decay',.02);assert(a.conditionHolds('recentlyHit'));assert(a.conditionHolds('comboVaried'));assert.equal(a.comboCondLeft,0);take('following-fold',.02);assert(!a.conditionHolds('recentlyHit'));assert(!a.conditionHolds('comboVaried'));});
course('timer-phase-stride-spend-before-fold',(a,take)=>{a.sheet.setBase('strideReach',100);a.strideDist=100;take('armed');a.strideSpent=true;take('spend-then-fold',.016);assert.equal(a.strideDist,0);assert(!a.conditionHolds('strided'));assert(!a.strideSpent);});
fs.writeFileSync(process.argv[2],JSON.stringify({schema:'private-condition-boundary-traces/v1',setup:'Fresh original Actors with seeded scalar state, real StatSheet queries and original condition/timer methods. Direct refresh courses are policy-boundary observations; two explicitly labelled timer courses preserve the native phase. Full World behavior is recorded separately.',conditionIds:CONDITION_IDS,courses},null,2)+'\n',{flag:'wx'});
