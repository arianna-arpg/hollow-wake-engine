
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeAccount,serializeAccount,deserializeAccount,type Account} from '../src/meta/account';
import {MEMORY_UNLOCKS} from '../src/data/memoryUnlocks';
import {investUnlock,applyUnlock,unlockCompleted,investedToward,type Unlockable} from '../src/meta/unlocks';
const text=(a:Account)=>JSON.stringify(serializeAccount(a));
const restore=(a:Account):Account=>{
 const value=deserializeAccount(JSON.parse(text(a)));assert(value);return value;
};
const oldRandom=Math.random;const results:{name:string;saves:number}[]=[];
try{
 Math.random=()=>.375;
 for(const id of ['__proto__','constructor','toString']){
  let a=makeAccount();a.credits=100;
  const u:Unlockable={id,kind:'feature',label:'Literal',description:'Literal',cost:10,payload:{flag:'probe_'+id}};
  assert.equal(investUnlock(a,u,3),3);a=restore(a);
  assert.equal(investedToward(a,u),3);assert(Object.hasOwn(a.invested,id));assert.equal(Object.getPrototypeOf(a.invested),Object.prototype);
  assert.equal(a.credits,97);assert(applyUnlock(a,u));assert.equal(a.credits,90);a=restore(a);
  assert(a.features.has(u.payload.flag));assert(!Object.hasOwn(a.invested,id));assert(unlockCompleted(a,u));assert(!applyUnlock(a,u));
  results.push({name:'literal-investment-'+id,saves:2});
 }
 const definition=MEMORY_UNLOCKS.find(row=>row.tier==='discovery');assert(definition);
 for(const id of ['__proto__','constructor','toString']){
  let a=makeAccount();a.credits=1000;
  const u:Unlockable={id,kind:'memory',label:'Aliased offer',description:'Aliased offer',cost:definition.cost,payload:{memoryUnlockId:definition.id}};
  assert.equal(investUnlock(a,u,3),3);a=restore(a);assert.equal(investedToward(a,u),3);
  assert(applyUnlock(a,u));assert.equal(a.credits,1000-definition.cost);assert(unlockCompleted(a,u,0));a=restore(a);
  const first: Account['memoryReceipts'][string]=a.memoryReceipts[definition.id];assert(first);assert.equal(first.sequence,1);
  assert((first.kind==='skill'?a.unlockedSkills:a.unlockedSupports).has(first.id));
  assert(applyUnlock(a,u));a=restore(a);assert.equal(a.memoryReceipts[definition.id].sequence,2);
  assert(unlockCompleted(a,u,1));assert.equal(a.credits,1000-2*definition.cost);
  results.push({name:'aliased-memory-offer-'+id,saves:3});
 }
 const originalId=definition.id;
 try{
  for(const id of ['__proto__','constructor','toString']){
   definition.id=id;let a=makeAccount();a.credits=1000;
   const u:Unlockable={id:'literal_receipt_offer',kind:'memory',label:'Receipt',description:'Receipt',cost:definition.cost,payload:{memoryUnlockId:id}};
   assert(applyUnlock(a,u));a=restore(a);
   assert(Object.hasOwn(a.memoryReceipts,id));assert.equal(Object.getPrototypeOf(a.memoryReceipts),Object.prototype);
   assert.equal(a.memoryReceipts[id].sequence,1);assert(unlockCompleted(a,u,0));assert(applyUnlock(a,u));a=restore(a);
   assert.equal(a.memoryReceipts[id].sequence,2);assert.equal(a.credits,1000-2*definition.cost);
   results.push({name:'literal-receipt-'+id,saves:2});
  }
 }finally{definition.id=originalId;}
 let a=makeAccount();a.credits=1000;
 const u:Unlockable={id:'free_memory',kind:'memory',label:'Free',description:'Free',cost:definition.cost,payload:{memoryUnlockId:definition.id}};
 a.invested[u.id]=definition.cost;a=restore(a);const before=text(a);Math.random=()=>1;
 assert.equal(applyUnlock(a,u),false);assert.equal(text(a),before);a=restore(a);
 assert.equal(a.credits,1000);assert.equal(a.invested[u.id],definition.cost);
 results.push({name:'free-memory-refusal',saves:2});
 fs.writeFileSync(process.argv[2],JSON.stringify({passed:true,results,saves:results.reduce((n,r)=>n+r.saves,0)})+'\n',{flag:'wx'});
}finally{Math.random=oldRandom;}
