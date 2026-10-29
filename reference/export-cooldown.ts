// Unaccepted, original-only discovery. Normal methods execute; named hooks expose
// supported JavaScript customization and committed failures, not replacement logic.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine, makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {procPowerStat, type ProcDef, type ProcEffect} from '../src/data/procs';
import {procCueRows} from '../src/engine/procCues';
type Fx = Extract<ProcEffect, {type: 'cooldown'}>;
type Tags = (typeof SKILLS.cleave)['tags'];
type Clocks = [string, number][];
type Hook = 'nested' | 'insert' | 'delete' | 'throw-before' | 'throw-after' | 'rider-throw';
interface Course {name: string; effect: Fx; expected: Clocks; cue?: boolean; clocks?: Clocks;
  bars?: {id: string; tags: Tags}[]; noTrigger?: boolean; power?: number; dead?: boolean;
  cueDisabled?: boolean; announceDisabled?: boolean; hook?: Hook; retry?: Clocks;}
const S='__cooldown_strike', F='__cooldown_fire', U='__cooldown_unslotted';
const clocks: Clocks=[[S,10],[F,5],[U,1]], reduced: Clocks=[[S,8.5],[F,3.5]];
const effects=(fx: Omit<Fx,'type'>): Fx=>({type:'cooldown',...fx});
const courses: Course[]=[
  {name:'empty-effect',effect:effects({}),expected:clocks,cue:false},
  {name:'fixed-seconds',effect:effects({seconds:1.5}),expected:reduced},
  {name:'fraction',effect:effects({fraction:.25}),expected:[[S,7.5],[F,3.75],[U,.75]]},
  {name:'seconds-and-fraction',effect:effects({seconds:2,fraction:.25}),expected:[[S,5.5],[F,1.75]]},
  {name:'reset-precedes-signed-arithmetic',effect:effects({reset:true,seconds:-50,fraction:-3}),expected:[]},
  {name:'explicit-unslotted',effect:effects({skills:[U],seconds:.5}),expected:[[S,10],[F,5],[U,.5]]},
  {name:'missing-skill',effect:effects({skills:['absent'],seconds:1}),expected:clocks,cue:false},
  {name:'empty-skills',effect:effects({skills:[],reset:true}),expected:clocks,cue:false},
  {name:'empty-tags-still-requires-bar',effect:effects({tags:[],seconds:1.5}),expected:[...reduced,[U,1]]},
  {name:'all-tags-required',effect:effects({tags:['attack','fire'],seconds:1.5}),expected:clocks,cue:false},
  {name:'filters-intersect-empty',effect:effects({skills:[S],tags:['fire'],reset:true}),expected:clocks,cue:false},
  {name:'filters-intersect-match',effect:effects({skills:[S,F],tags:['spell','fire'],seconds:1.5}),expected:[[S,10],[F,3.5],[U,1]]},
  {name:'except-trigger',effect:effects({exceptSelf:true,seconds:1.5}),expected:[[S,10],[F,3.5]]},
  {name:'except-without-trigger',effect:effects({exceptSelf:true,seconds:1.5}),noTrigger:true,expected:reduced},
  {name:'first-duplicate-bar-defines-tags',effect:effects({tags:['fire'],seconds:1.5}),bars:[{id:S,tags:['attack']},{id:S,tags:['fire']},{id:F,tags:['fire']}],expected:[[S,10],[F,3.5],[U,1]]},
  {name:'negative-seconds-extends',effect:effects({seconds:-2}),expected:[[S,12],[F,7],[U,3]],cue:false},
  {name:'negative-fraction-extends',effect:effects({fraction:-1}),expected:[[S,20],[F,10],[U,2]],cue:false},
  {name:'fraction-beyond-one-deletes',effect:effects({fraction:2}),expected:[]},
  {name:'nonpositive-clocks-delete-without-gain',effect:effects({}),clocks:[[S,-0],[F,0],[U,-1]],expected:[],cue:false},
  {name:'zero-power-preserves-structural-effect',effect:effects({seconds:1.5}),power:0,expected:reduced},
  {name:'large-power-preserves-structural-effect',effect:effects({seconds:1.5}),power:99,expected:reduced},
  {name:'subtraction-order-rounding',effect:effects({seconds:1,fraction:.5}),clocks:[[S,1e16]],expected:[[S,5e15]]},
  {name:'dead-owner-mutates-without-cue',effect:effects({seconds:1.5}),dead:true,expected:reduced,cue:false},
  {name:'cue-disabled',effect:effects({seconds:1.5}),cueDisabled:true,expected:reduced,cue:false},
  {name:'announcement-disabled',effect:effects({seconds:1.5}),announceDisabled:true,expected:reduced,cue:false},
  {name:'nested-write-keeps-outer-value-snapshot',effect:effects({seconds:1.5}),hook:'nested',expected:[[S,7.5],[F,3.5]]},
  {name:'inserted-clock-is-not-visited',effect:effects({seconds:1.5}),hook:'insert',expected:[...reduced,['late',20]]},
  {name:'deleted-clock-is-restored-from-snapshot',effect:effects({seconds:1.5}),hook:'delete',expected:reduced},
  {name:'failure-before-first-write-and-continuation',effect:effects({seconds:1.5}),hook:'throw-before',expected:clocks,cue:false,retry:reduced},
  {name:'failure-after-first-write-and-continuation',effect:effects({seconds:1.5}),hook:'throw-after',expected:[[S,8.5],[F,5],[U,1]],cue:false,retry:[[S,7],[F,3.5]]},
  {name:'rider-failure-preserves-mutation-and-cue',effect:effects({seconds:1.5}),hook:'rider-throw',expected:reduced},
];
const encode=(v:any):any=>typeof v==='number'&&Object.is(v,-0)?{$number:'-0'}:
  Array.isArray(v)?v.map(encode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)])):v;
bootSimEngine();const rows:unknown[]=[];
for(const course of courses){
  const restore=seedGlobalRandom(0xc044),world=makeSimWorld('warrior',0xc044),actor=world.player;
  try{
    actor.sheet=new StatSheet();actor.sheet.setBase('life',1000);actor.life=500;actor.dead=course.dead??false;
    actor.buffs.clear();actor.statuses=[];actor.charges.clear();actor.procCuePulses=[];actor.procPopEvents=[];actor.procCues=undefined;
    actor.cooldowns=new Map(course.clocks??clocks);const originalMap=actor.cooldowns;
    actor.skills=(course.bars??[{id:S,tags:['attack','melee','physical']},{id:F,tags:['spell','fire']}]).map(row=>
      makeSkillInstance({...SKILLS[row.id===F?'firebolt':'cleave'],id:row.id,tags:row.tags},1));
    const trigger=course.noTrigger?null:actor.skills[0]!;
    const proc:ProcDef={id:'__cooldown_probe',name:'Cooldown discovery',color:'#abcdef',trigger:'hit',effect:course.effect,
      ...(course.cueDisabled?{procCue:false as const}:{}),...(course.announceDisabled?{announceName:false as const}:{})};
    actor.sheet.setBase(procPowerStat(proc.id),course.power??1);world.time=10;world.actors=[actor];
    const calls:unknown[]=[],nativeSet=originalMap.set,nativeDelete=originalMap.delete;let hooked=false,recording=false,draws=0;
    const state=()=>encode({clocks:[...actor.cooldowns],originalClocks:[...originalMap],sameMap:actor.cooldowns===originalMap,
      pulses:actor.procCuePulses.map(p=>({...p})),rows:procCueRows(actor),time:world.time});
    originalMap.set=function(id,value){
      if(recording)calls.push({method:'set',id,value});
      const fire=recording&&!hooked;if(fire)hooked=true;
      if(fire&&course.hook==='throw-before')throw new Error('before-write');
      const result=nativeSet.call(this,id,value);
      if(fire){
        if(course.hook==='nested')world['executeProc']({...proc,id:'__cooldown_nested',effect:effects({seconds:1})},actor,trigger,null,1);
        if(course.hook==='insert')nativeSet.call(this,'late',20);
        if(course.hook==='delete')nativeDelete.call(this,F);
        if(course.hook==='throw-after')throw new Error('after-write');
      }
      return result;
    };
    originalMap.delete=function(id){if(recording)calls.push({method:'delete',id});return nativeDelete.call(this,id);};
    const riders=world['fireProcRiders'];world['fireProcRiders']=function(...args){
      if(recording)calls.push({method:'riders',id:args[0].id,depth:args[4],state:state()});
      const result=riders.apply(this,args);if(course.hook==='rider-throw')throw new Error('rider-failure');return result;
    };
    const random=Math.random;Math.random=()=>{if(recording)draws++;return random();};
    const before=state(),stages:unknown[]=[];
    for(const[phase,expected]of [[0,course.expected],...(course.retry?[[1,course.retry]]:[])] as [number,Clocks][]){
      recording=true;let failure:string|null=null;
      try{world['executeProc'](proc,actor,trigger,null,0);}catch(error){failure=(error as Error).message;}
      recording=false;assert.deepEqual([...actor.cooldowns],expected,course.name+' phase '+phase);
      const expectedFailure=phase===0?course.hook==='throw-before'?'before-write':course.hook==='throw-after'?'after-write':course.hook==='rider-throw'?'rider-failure':null:null;
      assert.equal(failure,expectedFailure,course.name);assert.equal(draws,0);
      const expectsCue=phase===1||course.cue!==false;
      assert.equal(actor.procCuePulses.some(p=>p.id===proc.id&&p.phase==='gain'),expectsCue,course.name);
      stages.push({phase,state:state(),failure,draws,calls:encode(calls)});
    }
    const riderCalls=calls.filter((c:any)=>c.method==='riders');
    assert.equal(riderCalls.length,course.hook==='nested'?2:1,course.name);
    rows.push({name:course.name,input:encode(course),before,stages});
  }finally{restore();}
}
assert.equal(rows.length,31);assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({
  scope:'Unaccepted original cooldown discovery. No SDK extraction or baseline revision. Native map mutation, cues, riders, customization, committed failure and continuation observed.',courses:rows.length,rows},null,2)+'\n',{flag:'wx'});
