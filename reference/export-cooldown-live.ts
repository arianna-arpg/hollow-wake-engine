// Original-only observations. Hooks call native methods and expose observable
// customization/partial failure; they do not implement the cooldown rule.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {PROC_LIST,procPowerStat,type ProcDef,type ProcEffect} from '../src/data/procs';
import {procCueRows} from '../src/engine/procCues';

type Fx=Extract<ProcEffect,{type:'cooldown'}>;
const S='__cooldown_strike',F='__cooldown_fire',U='__cooldown_unslotted';
const names=['bar-replaced','bar-retagged','trigger-retargeted','map-replaced','method-replaced',
  'seconds-replaced','skills-replaced','tags-throw','reset-throw','delete-before','delete-after',
  'cue-before','cue-after','selected-method-receiver','bound-method-receiver','custom-call-property',
  'snapshot-iterator-failure','snapshot-iterator-mutation','named-selector-callback',
  'tag-selector-callback','seconds-getter-selects-method','null-bar-slots'];
bootSimEngine();
const authored=PROC_LIST.filter(p=>p.effect.type==='cooldown');
assert(authored.length>0);assert.equal(new Set(authored.map(p=>p.id)).size,authored.length);
const courses=[...names.map(name=>({name,authored:undefined as ProcDef|undefined})),
  ...authored.map(proc=>({name:'authored:'+proc.id,authored:proc}))];
const rows:unknown[]=[];
for(const course of courses){
  const restore=seedGlobalRandom(0xc144),world=makeSimWorld('warrior',0xc144),actor=world.player;
  try{
    actor.sheet=new StatSheet();actor.sheet.setBase('life',1000);actor.life=500;actor.dead=false;
    actor.buffs.clear();actor.statuses=[];actor.charges.clear();actor.procCuePulses=[];actor.procPopEvents=[];actor.procCues=undefined;
    actor.cooldowns=new Map([[S,10],[F,5],[U,1]]);const originalMap=actor.cooldowns,other=new Map<string,number>();
    actor.skills=[makeSkillInstance({...SKILLS.cleave,id:S,tags:['attack','fire','movement']},1),
      makeSkillInstance({...SKILLS.firebolt,id:F,tags:['spell','fire','summon']},1)];
    const trigger=actor.skills[0]!;
    const effect:Fx=course.authored?course.authored.effect as Fx:{type:'cooldown',seconds:1.5};
    if(['bar-replaced','bar-retagged','snapshot-iterator-mutation','tag-selector-callback','null-bar-slots','tags-throw'].includes(course.name))effect.tags=['fire'];
    if(course.name==='trigger-retargeted')effect.exceptSelf=true;
    if(['skills-replaced','named-selector-callback'].includes(course.name))effect.skills=[S,F,U];
    const input={name:course.name,effect:JSON.parse(JSON.stringify(effect)),authoredId:course.authored?.id??null};
    const proc:ProcDef=course.authored??{id:'__cooldown_live',name:'Cooldown live observation',color:'#abcdef',trigger:'hit',effect};
    actor.sheet.setBase(procPowerStat(proc.id),1);world.time=10;world.actors=[actor];
    const calls:unknown[]=[];let recording=false,first=true,draws=0;
    const entries=(map:Map<string,number>)=>Array.from(Map.prototype.entries.call(map)) as [string,number][];
    const state=()=>({clocks:entries(actor.cooldowns),originalClocks:entries(originalMap),otherClocks:entries(other),
      sameMap:actor.cooldowns===originalMap,bars:actor.skills.map(s=>s?{id:s.def.id,tags:[...s.def.tags]}:null),
      triggerId:trigger.def.id,pulses:actor.procCuePulses.map(p=>({...p})),rows:procCueRows(actor),time:world.time});
    const replacementSet=function(this:Map<string,number>,id:string,value:number){
      if(recording)calls.push({method:'replacement-set',id,value,receiver:this===originalMap?'original':'other'});
      return Reflect.apply(Map.prototype.set,this,[id,value*2]) as Map<string,number>;
    };
    originalMap.set=function(id,value){
      if(recording)calls.push({method:'set',id,value});
      const result=Reflect.apply(Map.prototype.set,this,[id,value]) as Map<string,number>;
      if(recording&&first){first=false;
        if(course.name==='bar-replaced')actor.skills=[];
        if(course.name==='bar-retagged')actor.skills[1]!.def={...actor.skills[1]!.def,tags:['cold']};
        if(course.name==='trigger-retargeted')trigger.def={...trigger.def,id:U};
        if(course.name==='map-replaced')actor.cooldowns=new Map([['late',20]]);
        if(course.name==='method-replaced')originalMap.set=replacementSet;
        if(course.name==='seconds-replaced')effect.seconds=3;
        if(course.name==='skills-replaced')effect.skills=[S];
      }
      return result;
    };
    originalMap.delete=function(id){
      if(recording)calls.push({method:'delete',id});
      if(recording&&course.name==='delete-before')throw Error(course.name);
      const result=Reflect.apply(Map.prototype.delete,this,[id]) as boolean;
      if(recording&&course.name==='delete-after')throw Error(course.name);
      return result;
    };
    if(course.name==='selected-method-receiver')Object.defineProperty(originalMap,'set',{get(){
      if(recording)calls.push({method:'select-set'});actor.cooldowns=new Map([['late',20]]);
      return function(this:Map<string,number>,id:string,value:number){
        calls.push({method:'selected-set',id,value,receiver:this===originalMap?'original':'other'});
        return Reflect.apply(Map.prototype.set,this,[id,value]);
      };
    }});
    if(course.name==='bound-method-receiver')originalMap.set=replacementSet.bind(other);
    if(course.name==='custom-call-property')Object.defineProperty(originalMap.set,'call',{get(){throw Error('custom-call-read');}});
    if(course.name==='null-bar-slots')actor.skills=[null,...actor.skills,null];
    if(course.name==='tags-throw'||course.name==='reset-throw'){
      let reads=0;const property=course.name==='tags-throw'?'tags':'reset';
      Object.defineProperty(effect,property,{get(){calls.push({method:property+'-get',read:++reads});
        if(reads===(property==='tags'?3:2))throw Error(course.name);return property==='tags'?['fire']:undefined;}});
    }
    if(course.name.startsWith('snapshot-iterator-'))originalMap[Symbol.iterator]=function*():Generator<[string,number],undefined,unknown>{
      const iterator=Reflect.apply(Map.prototype[Symbol.iterator],this,[]) as MapIterator<[string,number]>;
      let yielded=false;
      try{for(const row of iterator){calls.push({method:'iterator-yield',id:row[0]});yield row;
        if(!yielded){yielded=true;if(course.name==='snapshot-iterator-failure')throw Error(course.name);actor.skills=[];}
      }}finally{calls.push({method:'iterator-closed'});}return undefined;
    };
    if(course.name==='named-selector-callback'){
      const skills=effect.skills!;
      skills.includes=function(id,from){calls.push({method:'skills-includes',id,receiver:this===skills});
        actor.cooldowns=new Map([['late',20]]);return Reflect.apply(Array.prototype.includes,this,[id,from]) as boolean;};
    }
    if(course.name==='tag-selector-callback'){
      const tags=effect.tags!;
      Object.defineProperty(tags,'every',{value:function(this:typeof tags,predicate:(value:typeof tags[number],index:number,array:typeof tags)=>unknown,thisArg?:unknown){calls.push({method:'tags-every',receiver:this===tags});
        actor.skills[0]!.def={...actor.skills[0]!.def,tags:['cold']};
        return Reflect.apply(Array.prototype.every,this,[predicate,thisArg]) as boolean;}});
    }
    if(course.name==='seconds-getter-selects-method')Object.defineProperty(effect,'seconds',{get(){
      calls.push({method:'seconds-get'});originalMap.set=replacementSet;return 1.5;
    }});
    const pulses=actor.procCuePulses;
    pulses.push=function(...values){
      if(recording)calls.push({method:'cue-before',clocks:entries(actor.cooldowns),pulses:this.length});
      if(recording&&course.name==='cue-before')throw Error(course.name);
      const result=Reflect.apply(Array.prototype.push,this,values) as number;
      if(recording)calls.push({method:'cue-after',pulses:this.length});
      if(recording&&course.name==='cue-after')throw Error(course.name);return result;
    };
    const riders=world['fireProcRiders'];world['fireProcRiders']=function(...args){
      if(recording)calls.push({method:'riders-before',state:state()});
      const result=Reflect.apply(riders,this,args);
      if(recording)calls.push({method:'riders-after',state:state()});return result;
    };
    const random=Math.random;Math.random=()=>{if(recording)draws++;return random();};
    const before=state();recording=true;let failure:string|null=null;
    try{world['executeProc'](proc,actor,trigger,null,0);}catch(error){failure=(error as Error).message;}
    recording=false;assert.equal(draws,0);
    const throws=['tags-throw','reset-throw','delete-before','delete-after','cue-before','cue-after','snapshot-iterator-failure'];
    assert.equal(failure,throws.includes(course.name)?course.name:null,course.name);
    assert.equal(calls.filter((call:any)=>call.method==='riders-after').length,failure?0:1,course.name);
    rows.push({input,before,after:state(),failure,draws,calls});
  }finally{restore();}
}
assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,
  scope:'Native proc cooldown execution, live selections, partial failures and every initialized authored cooldown proc. Controlled setup; no SDK implementation, real event admission, renderer or performance claim.',
  authored:authored.map(p=>({id:p.id,effect:p.effect})),courses:rows.length,rows},null,2)+'\n',{flag:'wx'});
