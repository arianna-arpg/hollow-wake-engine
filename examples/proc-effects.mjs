import {StatSheet,StatRules} from '@hollow-wake/engine';
import {ProcContent,ProcRuntime} from '@hollow-wake/engine/combat/procs';
import {scaleProcEffect,gainWard,applyWardEffect} from '@hollow-wake/engine/combat/effects';

const resources={rate:actor=>actor.sheet.get('wardGain')};
const effects={maximumLife:actor=>actor.sheet.get('life'),gain:(actor,amount)=>gainWard(actor,amount,resources)};

/** Explicit event -> proc gates -> magnitude -> resource -> cue -> rider tail.
 * Calls own independent simulation state; shared ports hold no actor state. */
export function wardCycle(){
  const source=new ProcContent({schemaVersion:1,capability:'proc-dispatch/v1',contentId:'portable-ward',rules:{maxExtraDepth:2,depthFalloff:.5,ppmCatchup:4},
    procs:[{id:'ward',trigger:'condition',condition:'lowLife',icd:2,effect:{type:'ward',flat:10,pctMaxLife:.1}}],riders:[]});
  const sheet=new StatSheet(new StatRules({life:{base:1000},wardGain:{base:.5},proc_ward:{base:1},procPower_ward:{base:2},procDepth:{base:0},luck:{base:0}}));
  const actor={dead:false,sheet,ward:6,procReadyAt:new Map(),procAttemptAt:new Map(),procFiredAt:new Map(),buffs:new Map(),statuses:[]};
  const clock={time:0,draws:0},cues=[],tails=[];const unsupported=()=>{throw new Error('Example host service is not supplied');};
  const runtime=new ProcRuntime(source,{
    time:()=>clock.time,random:()=>{clock.draws++;return .1;},stat:(a,id,tags,extra)=>a.sheet.get(id,tags,extra),condition:(a,id)=>a.sheet.hasCondition(id),
    armed:(a,ids,extra)=>a.sheet.armedFamily('proc_',ids,extra),tags:i=>i.tags,extra:i=>i.extra??[],carryTags:i=>i.tags,carryCourt:()=>1,
    victim:unsupported,castRider:unsupported,bankStatus:unsupported,lastGasp:unsupported,
    execute(proc,a,inst,target,depth){
      const fx=scaleProcEffect(proc.effect,a.sheet.get('procPower_'+proc.id));if(fx.type!=='ward')throw new Error('Example requires a ward effect');
      if(applyWardEffect(a,fx,effects))cues.push({time:clock.time,ward:a.ward});
      tails.push({time:clock.time,depth});runtime.riders(proc,a,inst,target,depth);
    },
  });
  for(const time of [0,1,2]){clock.time=time;runtime.own(actor,'condition',{condition:'lowLife'});}
  return {ward:actor.ward,draws:clock.draws,nextReady:actor.procReadyAt.get('ward'),cues,tails};
}
