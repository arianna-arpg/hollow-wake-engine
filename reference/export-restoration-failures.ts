import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet} from '../src/engine/stats';
import type {ProcDef} from '../src/data/procs';
import type {SkillTag} from '../src/engine/stats';
const destination=process.argv[2];
bootSimEngine();
interface Spec {kind:'instant'|'proc';resource:'es'|'poise'|'mana';at:string;full?:boolean;capacity?:boolean}
const specs:Spec[]=[
  ...(['instant','proc'] as const).flatMap<Spec>(kind=>[{kind,resource:'es',at:'reset'},
    {kind,resource:'es',at:'maximum'},{kind,resource:'mana',at:'maximum'}]),
  ...['feedingCue','noEvent','tags','push'].map<Spec>(at=>({kind:'instant',resource:'es',at})),
  {kind:'instant',resource:'es',at:'feedingCue',full:true},
  {kind:'instant',resource:'poise',at:'ignoredCue'},
  {kind:'instant',resource:'es',at:'ignoredNoEvent',full:true},
  {kind:'instant',resource:'es',at:'ignoredTags',capacity:true},
  {kind:'instant',resource:'es',at:'sharedTags'},
];
const rows:unknown[]=[];
for(const spec of specs){
  const restore=seedGlobalRandom(0xc043);
  try{
    const world=makeSimWorld('warrior',0xc043),actor=world.player,events:string[]=[];
    actor.sheet=new StatSheet();for(const id of ['life','mana','energyShield','poise'])actor.sheet.setBase(id,100);
    actor.life=100;actor.mana=actor.es=actor.poise=spec.full?100:40;actor.esDelay=5;
    actor.gainEvents=[];actor.restoreGains=[];actor.procCuePulses=[];
    if(spec.capacity)for(let i=0;i<64;i++)actor.gainEvents.push({kind:'restore',id:'mana',depth:0,n:1});
    const state=()=>structuredClone({mana:actor.mana,es:actor.es,poise:actor.poise,esDelay:actor.esDelay,
      gains:Array.from(actor.gainEvents),restoreGains:actor.restoreGains,procCues:actor.procCuePulses});
    const fail=(label:string):never=>{events.push(label);throw new Error('observed-'+label);};
    const effect=spec.kind==='instant'?{resource:spec.resource,amount:20}:{type:'restore',resource:spec.resource,flat:20};
    const opts:NonNullable<Parameters<ReturnType<typeof makeSimWorld>['applyRestore']>[2]>={};
    if(spec.at==='reset')Object.defineProperty(effect,'resetEsDelay',{get(){return fail('reset');}});
    if(spec.at==='maximum'){
      actor[spec.resource==='mana'?'availableMaxMana':'maxEs']=()=>{actor[spec.resource]=45;return fail('maximum');};
    }
    for(const[at,key]of [['feedingCue','feedingCue'],['noEvent','noEvent'],['tags','tags'],
      ['ignoredCue','feedingCue'],['ignoredNoEvent','noEvent'],['ignoredTags','tags']]){
      if(spec.at===at)Object.defineProperty(opts,key,{get(){return fail(key);}});
    }
    if(spec.at==='push')Object.defineProperty(actor.gainEvents,'push',{value(){return fail('push');},enumerable:false});
    const tags:SkillTag[]=['spell','physical'];if(spec.at==='sharedTags')opts.tags=tags;
    const before=state();let result:unknown,error:string|null=null,sharedTags:boolean|undefined;
    try{
      if(spec.kind==='instant')result=world['applyRestore'](actor,effect as Parameters<ReturnType<typeof makeSimWorld>['applyRestore']>[1],opts);
      else result=world['executeProc']({id:'failure-restore',name:'Failure Restore',trigger:'block',effect} as ProcDef,actor,null,null,0);
    }catch(e){error=String(e);}
    const ignored=spec.at.startsWith('ignored')||spec.at==='sharedTags';
    assert.equal(error,ignored?null:'Error: observed-'+spec.at);
    if(spec.at==='sharedTags'){sharedTags=actor.gainEvents[0].tags===tags;assert(sharedTags);tags.push('fire');}
    rows.push({spec,before,result,error,events,sharedTags,after:state()});
  }finally{restore();}
}
fs.writeFileSync(destination,JSON.stringify({schemaVersion:1,stage:'Exploratory only; not accepted fixtures',
  scope:'Native instant/proc restoration failure boundaries, surviving partial state, short-circuit reads and borrowed event-tag identity.',
  courses:rows.length,rows},(_k,v)=>v===undefined?{$undefined:true}:v,2)+'\n',{flag:'wx'});
