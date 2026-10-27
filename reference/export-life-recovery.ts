// Run against the pinned original game before implementing the SDK capability.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {Actor} from '../src/engine/actor';
import {StatSheet} from '../src/engine/stats';
import {SIM_TAP} from '../src/engine/tap';
import {recentIndex} from '../src/engine/recency';

type Phase = 'ceiling' | 'maximum' | 'rate' | 'tap' | 'observer' | 'recent';
interface Input {
  name: string; operation?: 'heal' | 'refill'; amount?: number; silent?: boolean;
  life?: number; maximum?: number; reserved?: number; seal?: number; rate?: number;
  dead?: boolean; healedSince?: number; noTap?: boolean; noObserver?: boolean;
  faultAt?: Phase; nestedAt?: Phase; nestedSilent?: boolean;
  mutateAt?: Phase; mutation?: {life?: number; lifeSealAt?: number; healedSince?: number; dead?: boolean};
  replaceObserverAt?: Phase;
}
const inputs: Input[] = [
  {name:'ordinary',amount:20}, {name:'silent',amount:20,silent:true},
  {name:'zero',amount:0}, {name:'negative',amount:-5}, {name:'negative-zero',amount:-0},
  {name:'dead',amount:20,dead:true}, {name:'capped',amount:100},
  {name:'already-full',amount:20,life:100}, {name:'above-fallen-cap',amount:20,life:130},
  {name:'reserved',amount:100,reserved:30}, {name:'reservation-above-maximum',amount:20,reserved:200},
  {name:'seal',amount:100,seal:65}, {name:'seal-below-life',amount:20,seal:30},
  {name:'zero-seal',amount:20,seal:0}, {name:'seal-above-reserved-cap',amount:100,reserved:30,seal:90},
  {name:'double-rate',amount:20,rate:2}, {name:'half-rate',amount:20,rate:.5},
  {name:'zero-rate',amount:20,rate:0}, {name:'fractional',amount:.1,life:.2,rate:.3},
  {name:'existing-ledger',amount:20,healedSince:7},
  {name:'without-tap',amount:20,noTap:true}, {name:'without-observer',amount:20,noObserver:true},
  {name:'without-notifications',amount:20,noTap:true,noObserver:true},
  {name:'zero-does-not-query',amount:0,faultAt:'ceiling'},
  {name:'dead-does-not-query',amount:20,dead:true,faultAt:'ceiling'},
  ...(['ceiling','maximum','rate','tap','observer','recent'] as const)
    .map(phase=>({name:'throw-'+phase,amount:20,faultAt:phase})),
  ...(['ceiling','maximum','rate','tap','observer','recent'] as const)
    .map(phase=>({name:'nested-'+phase,amount:20,nestedAt:phase})),
  {name:'nested-silent-observer',amount:20,nestedAt:'observer',nestedSilent:true},
  {name:'ceiling-mutates-life',amount:20,mutateAt:'ceiling',mutation:{life:10}},
  {name:'rate-mutates-life',amount:20,mutateAt:'rate',mutation:{life:10}},
  {name:'ceiling-mutates-existing-seal',amount:100,seal:60,mutateAt:'ceiling',mutation:{lifeSealAt:80}},
  {name:'ceiling-adds-seal-after-branch',amount:100,mutateAt:'ceiling',mutation:{lifeSealAt:60}},
  {name:'observer-mutates-life-and-ledger',amount:20,mutateAt:'observer',mutation:{life:10,healedSince:7}},
  {name:'tap-marks-dead',amount:20,mutateAt:'tap',mutation:{dead:true}},
  {name:'tap-replaces-observer',amount:20,replaceObserverAt:'tap'},
  {name:'NaN-diagnostic',amount:NaN}, {name:'infinity-diagnostic',amount:Infinity},
  {name:'negative-infinity-diagnostic',amount:-Infinity}, {name:'dead-NaN-diagnostic',amount:NaN,dead:true},
  {name:'refill',operation:'refill'}, {name:'refill-full',operation:'refill',life:100},
  {name:'refill-above-maximum',operation:'refill',life:130},
  {name:'refill-bypasses-heal-restrictions',operation:'refill',rate:0,reserved:30,seal:60},
  {name:'refill-dead',operation:'refill',dead:true},
  {name:'refill-no-observer',operation:'refill',noObserver:true},
  {name:'refill-throw-maximum',operation:'refill',faultAt:'maximum'},
  {name:'refill-throw-observer',operation:'refill',faultAt:'observer'},
  {name:'refill-nested-maximum',operation:'refill',nestedAt:'maximum'},
  {name:'refill-observer-mutation',operation:'refill',mutateAt:'observer',mutation:{life:10,healedSince:7}},
];

bootSimEngine();
const previousTap = SIM_TAP.current;
const rows: unknown[] = [];
try {
  for (const input of inputs) {
    const actor = new Actor('life-recovery-reference', 'player', {x:0,y:0});
    actor.sheet = new StatSheet();
    actor.sheet.setBase('life', input.maximum ?? 100);
    actor.sheet.setBase('healTaken', input.rate ?? 1);
    actor.life = input.life ?? 50; actor.dead = input.dead ?? false;
    actor.reservedLife = input.reserved ?? 0; actor.lifeSealAt = input.seal;
    actor.healedSince = input.healedSince ?? 0;
    const events: unknown[] = [];
    const state = () => ({life:actor.life,dead:actor.dead,healedSince:actor.healedSince,
      since:[...actor.since],seal:actor.lifeSealAt,reserved:actor.reservedLife});
    const record = (phase:string,details?:unknown) => {events.push({phase,details,state:state()});};
    let entered = false, mutated = false;
    const hook = (phase:Phase,details?:unknown) => {
      record(phase,details);
      if (input.mutateAt===phase && !mutated) {
        mutated=true; Object.assign(actor,input.mutation); record('mutation',input.mutation);
      }
      if (input.replaceObserverAt===phase) actor.onLifeHealed=function(this:Actor,amount,silent){
        assert.equal(this,actor); record('replacement-observer',{amount,silent,receiver:true});
      };
      if (input.nestedAt===phase && !entered) {
        entered=true; const landed=actor.healBy(5,input.nestedSilent??false); record('nested-return',{landed});
      }
      if (input.faultAt===phase) throw new Error('failure:'+phase);
    };
    const maximum=actor.maxLife.bind(actor),ceiling=actor.lifeCeiling.bind(actor),
      get=actor.sheet.get.bind(actor.sheet),recent=actor.noteRecent.bind(actor);
    actor.maxLife=()=>{hook('maximum');const value=maximum();record('maximum-return',{value});return value;};
    actor.lifeCeiling=()=>{hook('ceiling');const value=ceiling();record('ceiling-return',{value});return value;};
    actor.sheet.get=(id,tags,extra)=>{if(id==='healTaken')hook('rate');const value=get(id,tags,extra);
      if(id==='healTaken')record('rate-return',{value});return value;};
    actor.noteRecent=kind=>{hook('recent',{kind});recent(kind);record('recent-return',{kind});};
    SIM_TAP.current=input.noTap?null:{onHeal:(a,amount)=>{assert.equal(a,actor);hook('tap',{amount});}};
    actor.onLifeHealed=input.noObserver?undefined:function(this:Actor,amount,silent){
      assert.equal(this,actor);hook('observer',{amount,silent,receiver:true});
    };
    const before=state();let result:unknown,error:string|null=null;
    try {result=input.operation==='refill'?actor.refillLife():actor.healBy(input.amount!,input.silent);}
    catch(failure){error=(failure as Error).message;}
    rows.push({input,before,result,error,events,after:state()});
  }
} finally {SIM_TAP.current=previousTap;}
assert.equal(SIM_TAP.current,previousTap);
assert.equal(new Set(inputs.map(input=>input.name)).size,inputs.length);
fs.writeFileSync(process.argv[2],JSON.stringify({
  schemaVersion:1,scope:'Original Actor healing/refill behavior, including query order, nested calls and partial failure. Diagnostics do not imply supported malformed content.',
  numericEncoding:'Nonfinite numbers and negative zero use {$number:string}; undefined uses {$undefined:true}.',
  healRecentIndex:recentIndex('heal'),courses:rows.length,rows,
},(_key,value)=>value===undefined?{$undefined:true}:typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0))
  ?{$number:Object.is(value,-0)?'-0':String(value)}:value,2)+'\n');
