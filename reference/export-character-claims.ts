import fs from 'node:fs';
import assert from 'node:assert/strict';
import {UNLOCK_CATALOG,isUnlockVisible,isUnlockOwned,pendingClassUnlocks,acknowledgeClassUnlock,claimClassUnlock,settleClassUnlocks,classUnlockProgress} from '../src/meta/unlocks';
import {isClassUnlocked,isClassDiscovered,makeAccount,type Account} from '../src/meta/account';
import {bootSimEngine} from '../src/sim/arena';
bootSimEngine();
const classes=UNLOCK_CATALOG.filter(u=>u.kind==='class');assert.equal(classes.length,36);
const idMap=new Map(UNLOCK_CATALOG.map(u=>[u.id,u]));
function openDoor(a:Account,id:string){const u=idMap.get(id)!;if(u.kind==='class')a.unlockedClasses.add(u.payload.classId);
  else if(u.kind==='feature')a.features.add(u.payload.flag);else throw Error('Unknown class door '+id);assert(isUnlockOwned(a,u));}
function snap(a:Account,u:typeof classes[number]){return {discovered:isClassDiscovered(a,u.payload.classId),selectable:isClassUnlocked(a,u.payload.classId),
  pending:pendingClassUnlocks(a).map(p=>p.id),skills:u.payload.skillIds.map(s=>a.unlockedSkills.has(s)),supports:u.payload.supportIds.map(s=>a.unlockedSupports.has(s)),
  investment:a.invested[u.id]??null};}
const claims=[];
for(const u of classes)for(const label of ['ready','view','below','missing-door','owned','pending']){
 const a=makeAccount(),doors=typeof u.requiresUnlock==='string'?[u.requiresUnlock]:u.requiresUnlock??[];
 if(label!=='missing-door')for(const id of doors)openDoor(a,id);
 if(label==='owned'||label==='pending')a.unlockedClasses.add(u.payload.classId);
 if(label==='pending')a.pendingClassUnlocks.add(u.payload.classId);
 const row=u.reqAnyOf?.[0];assert(row?.ledger);const n=row.n??1,view={[row.ledger]:label==='below'?n-1:n};
 if(label!=='view')Object.assign(a.ledger,view);a.invested[u.id]=7;
 const before=snap(a,u),visible=isUnlockVisible(label==='view'?{...a,ledger:view}:a,u);
 const first=claimClassUnlock(a,u,label==='view'?view:undefined),after=snap(a,u),again=claimClassUnlock(a,u,label==='view'?view:undefined);
 const ack=acknowledgeClassUnlock(a,u),active=snap(a,u),repeatAck=acknowledgeClassUnlock(a,u);
 claims.push({id:u.id,label,before,visible,first,after,again,ack,active,repeatAck,localCredit:a.ledger[row.ledger]??null,
  progress:classUnlockProgress(a,u,label==='view'?view:undefined).revealed});
}
const all=makeAccount(),view:Record<string,number>={};for(const u of classes){
 for(const id of typeof u.requiresUnlock==='string'?[u.requiresUnlock]:u.requiresUnlock??[]){const dep=idMap.get(id)!;if(dep.kind==='feature')openDoor(all,id);}
 for(const gate of u.reqAnyOf??[]){assert(gate.ledger);view[gate.ledger]=Math.max(view[gate.ledger]??0,gate.n??1);}
}
const first=settleClassUnlocks(all,view).map(u=>u.id),pending=pendingClassUnlocks(all).map(u=>u.id);
const second=settleClassUnlocks(all,view).map(u=>u.id);assert(first.length>0&&second.length===0);
const activated=classes.filter(u=>acknowledgeClassUnlock(all,u)).map(u=>u.id);
const reversed=makeAccount();for(const u of classes){
  for(const id of typeof u.requiresUnlock==='string'?[u.requiresUnlock]:u.requiresUnlock??[]){const dep=idMap.get(id)!;if(dep.kind==='feature')openDoor(reversed,id);}
}
const order=[...UNLOCK_CATALOG];let reverseFirst:string[]=[];
try{
  UNLOCK_CATALOG.reverse();
  reverseFirst=settleClassUnlocks(reversed,view).map(u=>u.id);
}finally{UNLOCK_CATALOG.splice(0,UNLOCK_CATALOG.length,...order);}
fs.writeFileSync(process.argv[2],JSON.stringify({claims,fixedPoint:{first,pending,second,activated,reverseFirst,accountLedger:all.ledger}})+'\n',{flag:'wx'});
console.log({classes:classes.length,claims:claims.length,settled:first.length,activated:activated.length});
