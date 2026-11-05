
import fs from 'node:fs';
import {makeAccount,serializeAccount,type Account} from '../src/meta/account';
import {investUnlock,applyUnlock,investedToward,unlockCompleted,reconcileClassBundleGems,UNLOCK_CATALOG,type Unlockable} from '../src/meta/unlocks';
import {MEMORY_UNLOCK_CFG,MEMORY_UNLOCKS} from '../src/data/memoryUnlocks';
const encode=(_key:string,value:unknown):unknown=>typeof value==='number'&&!Number.isFinite(value)?{number:String(value)}:value;
const snapshot=(a:Account)=>JSON.parse(JSON.stringify(serializeAccount(a),encode));
const rows:unknown[]=[];
const oldRandom=Math.random,oldLegacy=MEMORY_UNLOCK_CFG.legacyGemBundles;
let draws=0;
try{
 for(const roll of [-1,1,NaN]){
  const a=makeAccount();a.credits=100;
  const u:Unlockable={id:'free_offer',kind:'memory',label:'Free',description:'Retuned',cost:10,payload:{memoryUnlockId:'memory_discovery'}};
  a.invested[u.id]=10;draws=0;Math.random=()=>{draws++;return roll;};
  const before=snapshot(a),result=applyUnlock(a,u);
  rows.push({name:'free-memory-'+String(roll),before,result,after:snapshot(a),draws,completed:unlockCompleted(a,u)});
 }
 for(const id of ['__proto__','constructor','toString']){
  const a=makeAccount();a.credits=100;
  a.invested=Object.create({[id]:9}) as Record<string,number>;
  const u:Unlockable={id,kind:'feature',label:'Literal',description:'Literal',cost:10,payload:{flag:'literal'}};
  const before=snapshot(a),held=investedToward(a,u),result=investUnlock(a,u,3);
  rows.push({name:'inherited-investment-'+id,before,held,result,after:snapshot(a),own:Object.hasOwn(a.invested,id),prototypeOwn:Object.hasOwn(Object.getPrototypeOf(a.invested),id)});
 }
 for(const cost of [-1,NaN,Infinity]){
  const a=makeAccount();a.credits=100;
  const u:Unlockable={id:'invalid-cost',kind:'feature',label:'Cost',description:'Cost',cost,payload:{flag:'invalid-cost'}};
  const before=snapshot(a),result=investUnlock(a,u,10),after=snapshot(a),applied=applyUnlock(a,u);
  rows.push({name:'invalid-cost-'+String(cost),before,result,after,applied,final:snapshot(a)});
 }
 // Original migration with a literal receipt ID and an inherited destination balance.
 const definition=MEMORY_UNLOCKS.find(r=>r.tier==='discovery')!;
 const oldId=definition.id;
 const bundle=UNLOCK_CATALOG.find(row=>row.kind==='skill')!;
 try{
  MEMORY_UNLOCK_CFG.legacyGemBundles=false;
  for(const id of ['__proto__','constructor','toString']){
   definition.id=id;
   const a=makeAccount();a.invested=Object.create({[id]:7}) as Record<string,number>;a.invested[bundle.id]=4;
   const before=snapshot(a);reconcileClassBundleGems(a);
   rows.push({name:'migration-destination-'+id,before,after:snapshot(a),own:Object.hasOwn(a.invested,id),prototypeOwn:Object.hasOwn(Object.getPrototypeOf(a.invested),id)});
  }
 }finally{definition.id=oldId;}
 fs.writeFileSync(process.argv[2],JSON.stringify({rows},encode)+'\n',{flag:'wx'});
}finally{Math.random=oldRandom;MEMORY_UNLOCK_CFG.legacyGemBundles=oldLegacy;}
