import fs from 'node:fs';
import assert from 'node:assert/strict';
import {vocationQuestDefs,vocationStepQuestId} from '../src/quests/vocations';
import {VOCATION_CFG,VOCATION_LIST,vocationLedgerKey,vocationDiscoveryKey,vocationStepKey,vocationRootId} from '../src/data/vocations';
import {odysseyMilestoneKey} from '../src/data/powerProgression';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {CLASSES} from '../src/data/classes';
import {NullInput} from '../src/net/intent';
bootSimEngine();
const quests=vocationQuestDefs(), compiled=quests.map(q=>{const {gate,...fields}=q;return fields;});
const ids=quests.map(q=>q.id);assert.equal(new Set(ids).size,ids.length);
const gates=[];
for(const v of VOCATION_LIST)for(const [i] of v.quest.steps.entries()){
  const q=quests.find(q=>q.id===vocationStepQuestId(v.id,i+1));assert(q&&q.gate);
  let bits='';
  for(let mask=0;mask<256;mask++){
    const runLedger:Record<string,number>={},accountLedger:Record<string,number>={};
    if(mask&1)accountLedger[odysseyMilestoneKey(1)]=1;
    if(mask&4)accountLedger[vocationLedgerKey(v.id)]=1;
    if(mask&8)runLedger[vocationDiscoveryKey(v.id)]=1;
    if(mask&16)runLedger[vocationStepKey(v.id,i)]=1;
    if(mask&32)accountLedger[vocationStepKey(v.id,i)]=1;
    const vocations=mask&64?[v.id]:mask&128?Array.from({length:VOCATION_CFG.maxPerCharacter},(_,n)=>'__other'+n):[];
    bits+=q.gate({classId:mask&2?v.classId:'__other',vocations,runLedger,accountLedger})?'1':'0';
  }
  gates.push({vocation:v.id,id:q.id,step:i+1,bits});
}
const grants=[];
type Trial={id:string,mode?:string,stage?:number,remote?:boolean,unknown?:boolean,existing?:boolean,capped?:boolean,inject?:string,reenter?:boolean,preexisting?:boolean,moveAfterCue?:boolean};
const v=VOCATION_LIST[0], other=VOCATION_LIST.find(row=>row.id!==v.id)!;
const identities=VOCATION_LIST.flatMap(def=>def.quest.steps.map((step,i)=>{
  const generated=quests.find(q=>q.id===vocationStepQuestId(def.id,i+1))!;
  const grant=generated.reward;
  return {quest:generated.id,declaredFields:Object.keys(generated),undefinedFields:Object.keys(generated).filter(k=>(generated as any)[k]===undefined),
    rewardFields:Object.keys(grant),undefinedRewards:Object.keys(grant).filter(k=>(grant as any)[k]===undefined),
    borrowedZone:generated.zone===step.zone,sharedGiver:generated.giver===generated.turnIn?.giver,
    requirementIdentity:step.requiresLedger===undefined?null:generated.requiresLedger===step.requiresLedger};
}));
const trials:Trial[]=[
  {id:'ordinary'},{id:'sealed',mode:'immortal',stage:1},{id:'sworn',mode:'immortal',stage:0},
  {id:'unknown',unknown:true},{id:'already-granted',existing:true},{id:'capped',capped:true},
  {id:'preexisting-ledger',preexisting:true},{id:'reentrant',reenter:true},
  {id:'move-between-cues',moveAfterCue:true},
  {id:'second-seat',remote:true},{id:'second-seat-local-sealed',remote:true,mode:'immortal',stage:1},
  ...['recalcSeat','markMetaDirty','text'].map(inject=>({id:'failure-'+inject,inject})),
];
for(const trial of trials){
  const restore=seedGlobalRandom(0x71c94);try{
    const w=makeSimWorld('warrior',0x71c94);w.meta.modeId=trial.mode??'mortal';w.meta.modeStage=trial.stage??0;
    const seat=trial.remote?w.addSeat('p1',CLASSES[0],new NullInput(),{startingCompanions:false,startingFlasks:false}):w.localSeat;
    if(trial.remote){seat.meta.modeId='mortal';seat.meta.modeStage=0;}
    if(trial.existing)seat.meta.vocations.push(v.id);
    if(trial.capped)for(let n=0;n<VOCATION_CFG.maxPerCharacter;n++)seat.meta.vocations.push(other.id);
    const key=vocationLedgerKey(v.id);
    if(trial.preexisting){w.ledger[key]=3;w.account.ledger[key]=6;}
    const at=w.texts.length;w.accountDirty=false;w.metaDirty.clear();
    const snap=()=>({localVocations:[...w.meta.vocations],targetVocations:[...seat.meta.vocations],root:seat.meta.allocated.has(vocationRootId(v.id)),
      run:w.ledger[key]??null,account:w.account.ledger[key]??null,accountDirty:w.accountDirty,dirty:[...w.metaDirty],textCount:w.texts.length-at});
    const events:any[]=[];let reentered=false;
    for(const name of ['metaProgressionActive','recalcSeat','markMetaDirty','text']){
      const fn=(w as any)[name];
      (w as any)[name]=function(...args:any[]){
        events.push({name,when:'before',state:snap(),text:name==='text'?[{...args[0]},...args.slice(1)]:undefined});
        if(trial.inject===name)throw Error('injected '+name);
        if(trial.reenter&&name==='recalcSeat'&&!reentered){reentered=true;events.push({nested:w.grantVocation(v.id,seat)});}
        const r=fn.apply(w,args);
        if(trial.moveAfterCue&&name==='text'&&w.texts.length===at+1){seat.actor.pos.x+=19;seat.actor.pos.y-=7;}
        events.push({name,when:'after',state:snap()});return r;
      };
    }
    const before=snap();let result:boolean|null=null,error:string|null=null;
    try{result=w.grantVocation(trial.unknown?'__unknown':v.id,seat);}catch(e){error=(e as Error).message;}
    assert.equal(error,trial.inject?'injected '+trial.inject:null);
    grants.push({trial,before,result,error,after:snap(),events});
  }finally{restore();}
}
const ordinary=VOCATION_LIST.find(v=>!v.secret)!;
const gate=quests.find(q=>q.id===vocationStepQuestId(ordinary.id,1))!.gate!;
const receipts={classId:ordinary.classId,accountLedger:{[odysseyMilestoneKey(1)]:1},runLedger:{},vocations:['__other']};
const oldCap=VOCATION_CFG.maxPerCharacter;
let liveCap;
try{
  const before=gate(receipts);VOCATION_CFG.maxPerCharacter=2;
  const expanded=gate(receipts);receipts.vocations=[ordinary.id];const repeat=gate(receipts);
  liveCap={before,expanded,repeat};
}finally{VOCATION_CFG.maxPerCharacter=oldCap;}
const out={schemaVersion:1,config:{maxPerCharacter:VOCATION_CFG.maxPerCharacter},vocations:VOCATION_LIST.length,quests:quests.length,
  generated:compiled,identities,gates,grants,liveCap};
fs.writeFileSync(process.argv[2],JSON.stringify(out)+'\n',{flag:'wx'});console.log({vocations:out.vocations,quests:out.quests,gateCombinations:gates.length*256,grants:grants.length});
