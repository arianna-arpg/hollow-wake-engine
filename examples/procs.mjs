import {StatSheet,StatRules} from '@hollow-wake/engine';
import {ProcContent,ProcRuntime} from '@hollow-wake/engine/combat/procs';

/** One actor, explicit time/randomness and a small application-owned ward effect. */
export function procCycle(){
  const source=new ProcContent({schemaVersion:1,capability:'proc-dispatch/v1',contentId:'ward-example',rules:{maxExtraDepth:2,depthFalloff:.5,ppmCatchup:4},
    procs:[{id:'ward',trigger:'condition',condition:'lowLife',icd:2,effect:{type:'ward',amount:10}}],riders:[]});
  const sheet=new StatSheet(new StatRules({proc_ward:{base:0},procDepth:{base:0},luck:{base:0}}));
  const actor={dead:false,sheet,ward:0,procReadyAt:new Map(),procAttemptAt:new Map(),procFiredAt:new Map(),buffs:new Map(),statuses:[]};
  const clock={time:0,draws:0};const unsupported=()=>{throw new Error('Example does not supply this host effect');};
  const runtime=new ProcRuntime(source,{
    time:()=>clock.time,random:()=>{clock.draws++;return .1;},stat:(a,id,tags,extra)=>a.sheet.get(id,tags,extra),condition:(a,id)=>a.sheet.hasCondition(id),
    armed:(a,ids,extra)=>a.sheet.armedFamily('proc_',ids,extra),tags:i=>i.tags,extra:i=>i.extra??[],carryTags:i=>i.tags,carryCourt:()=>1,
    victim:unsupported,castRider:unsupported,bankStatus:unsupported,lastGasp:unsupported,
    execute(proc,a){if(proc.effect.type!=='ward')throw new Error('Unsupported example payload');a.ward+=proc.effect.amount;},
  });
  sheet.setBase('proc_ward',1);runtime.own(actor,'condition',{condition:'lowLife'});
  clock.time=1;runtime.own(actor,'condition',{condition:'lowLife'});
  clock.time=2;runtime.own(actor,'condition',{condition:'lowLife'});
  return {ward:actor.ward,draws:clock.draws,nextReady:actor.procReadyAt.get('ward')};
}
