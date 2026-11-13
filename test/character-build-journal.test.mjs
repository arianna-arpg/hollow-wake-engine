import assert from 'node:assert/strict';
import {CompleteAccountWorkshopSession} from '../dist/account-workshop-complete.js';
import {CraftingSession} from '../dist/crafting-session.js';
import {definitions,baseline} from './shared-account/fixtures.mjs';
import {openCourse,accountSave,workshopSave} from './shared-account/contracts.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));let contracts=0;
function setup(mode='normal'){
 const crafting=new CraftingSession(definitions.workshop,1),calls=[];let nextFault,exposed;
 const kernel={character:{admit:value=>copy(value),checkInventory(){},uidFloor(){return 1;}},execute(previous,open,command,scope){
  const result={reply:command?{ok:true,events:[{kind:'recalculate'},{kind:'recalculate'}]}:null,continuation:Object.freeze({}),character:scope.characterInput??{stamp:0}};
  assert.equal(crafting.command({...open,profile:0}).ok,true);
  try{const saved=crafting.command({op:'save',profile:0});assert.equal(saved.ok,true);result.save=saved.save;}
  finally{assert.equal(crafting.command({op:'close',profile:0}).ok,true);}
  if(command){
   const middle=Object.freeze({});result.rebuilds=[{before:previous,after:middle},{before:middle,after:result.continuation}];
   result.character={stamp:result.character.stamp+1};
   if(mode==='normalize'){const ledger=result.save.state.account.ledger;ledger.journal_counter=(ledger.journal_counter??0)+1;}
   if(nextFault)nextFault(result,previous);
   exposed=result.rebuilds;
  }
  calls.push({previous,scope,command,result});return result;
 }};
 const owner=openCourse(new CompleteAccountWorkshopSession({...definitions,completeKernel:kernel}),baseline.scenarios[0]);
 return{owner,calls,fault(fn){nextFault=fn;},get exposed(){return exposed;}};
}
const command={op:'workshop',profile:1,command:{op:'test-ordered-rebuilds'}};
const save=owner=>[accountSave(owner),workshopSave(owner)];
for(const mode of ['normal','normalize']){
 const f=setup(mode),before=save(f.owner),start=f.calls.at(-1).result.continuation;
 const reply=f.owner.command({op:'prepare',commands:[command,command]});assert.equal(reply.ok,true,JSON.stringify(reply));assert(reply.token);
 assert.deepEqual(save(f.owner),before,'preparation published a candidate');
 const journal=f.owner.preparedJournal(reply.token);assert.equal(journal.length,2);
 let cursor=start;
 for(const entry of journal){
  assert.equal(entry.transitions.length,mode==='normalize'?3:2);
  for(const step of entry.transitions){assert.equal(step.before,cursor);cursor=step.after;assert.equal(step.profile,1);assert.equal(step.accountKey,baseline.scenarios[0].name);assert(Object.isFrozen(step));}
 }
 assert.equal(cursor,f.calls.at(-1).result.continuation);assert(Object.isFrozen(journal));
 // The owner owns its rows even if a trusted kernel later reuses a returned array.
 f.exposed.length=0;assert.equal(journal[1].transitions.length,mode==='normalize'?3:2);
 const saved=f.owner.command({op:'prepared-save',token:reply.token,kind:'workshop',handle:1});assert.equal(saved.ok,true);assert(!JSON.stringify(saved).includes('rebuilds'));
 assert.equal(f.owner.command({op:'commit-prepared',token:reply.token}).ok,true);assert.equal(workshopSave(f.owner).character.stamp,2);contracts++;
}
for(const[name,fault]of [
 ['empty',r=>{r.rebuilds=[];}],['not-array',r=>{r.rebuilds={};}],['wrong-start',r=>{r.rebuilds[0].before={};}],
 ['gap',r=>{r.rebuilds[1].before={};}],['wrong-end',r=>{r.rebuilds[1].after={};}],['cycle',(r,p)=>{r.rebuilds[1].after=p;r.continuation=p;}],
 ['same-handle',r=>{r.rebuilds[0].after=r.rebuilds[0].before;}],['account-spoof',r=>{r.rebuilds[0].accountKey='other';}],
 ['profile-spoof',r=>{r.rebuilds[0].profile=2;}],['non-handle',r=>{r.rebuilds[0].after=7;}],
 ['too-many',(r,p)=>{let before=p;r.rebuilds=Array.from({length:257},()=>{const after={};const row={before,after};before=after;return row;});r.continuation=before;}]
]){
 const f=setup(),before=save(f.owner);f.fault(fault);
 const reply=f.owner.command({op:'prepare',commands:[command]});assert.equal(reply.ok,false,name);assert.deepEqual(save(f.owner),before,name+' changed committed state');
 assert.throws(()=>f.owner.preparedJournal(1),/no-prepared-change/);contracts++;
}
{
 const f=setup(),before=save(f.owner);let count=0;f.fault(r=>{if(++count===2)r.rebuilds[0].before={};});
 assert.equal(f.owner.command({op:'prepare',commands:[command,command]}).ok,false);assert.deepEqual(save(f.owner),before);contracts++;
}
{
 const f=setup(),before=save(f.owner);f.fault((r,p)=>{let before=p;r.rebuilds=Array.from({length:256},()=>{const after={};const row={before,after};before=after;return row;});r.continuation=before;});
 const reply=f.owner.command({op:'prepare',commands:[command]});assert.equal(reply.ok,true);assert.equal(f.owner.preparedJournal(reply.token)[0].transitions.length,256);
 assert.equal(f.owner.command({op:'abort-prepared',token:reply.token}).ok,true);assert.deepEqual(save(f.owner),before);contracts++;
}
console.log({contracts,opaqueIntermediatePaths:true,accountIdentityOwnerDerived:true,atomicPreparation:true,originalGameEquivalence:false});

// Appended to the existing journal course. Every account update below uses the
// real progression owner; only character rebuilds use that course's test kernel.
const observed=(owner,credits,counter)=>{
 const a=accountSave(owner).progression.account;
 return{op:'account',account:1,command:{op:'observe',level:a.level,credits,ledger:{...copy(a.ledger),ordered_counter:counter},roster:copy(a.roster)}};
};
{
 const f=setup(),before=accountSave(f.owner),first=observed(f.owner,7,1),second=observed(f.owner,11,2);
 const pending=f.owner.command({op:'prepare',commands:[first,command,second]});assert.equal(pending.ok,true);assert(pending.token);
 const journal=f.owner.preparedJournal(pending.token);assert.equal(journal.length,3);assert.deepEqual(journal.map(e=>e.accounts.length),[1,0,1]);
 const start=journal[0].accounts[0],end=journal[2].accounts[0];assert.equal(start.account,1);assert.equal(start.accountKey,before.key);
 assert.deepEqual(copy(start.before.save),before);assert.equal(start.after.save.progression.account.credits,7);assert.equal(start.after.save.progression.account.ledger.ordered_counter,1);
 assert.equal(end.after.save.progression.account.credits,11);assert.equal(end.after.save.progression.account.ledger.ordered_counter,2);
 assert.equal(start.after,end.before,'same admitted account state must share one frozen view');
 assert.deepEqual(accountSave(f.owner),before,'account journal preparation published candidate');
 first.command.credits=999;assert.equal(journal[0].command.command.credits,7);assert.equal(start.after.save.progression.account.credits,7);
 assert(Object.isFrozen(start.after.save.progression.account.ledger));assert(Object.isFrozen(journal[0].accounts));assert(Object.isFrozen(start));
 assert.equal(Reflect.set(start.after.save.progression.account.ledger,'ordered_counter',99),false);
 const final=f.owner.command({op:'prepared-save',token:pending.token,kind:'account',handle:1});assert.equal(final.ok,true);assert.deepEqual(copy(final.save),copy(end.after.save));
 assert(!Object.hasOwn(final.save,'activeProfile'));assert(!Object.hasOwn(final.save,'accounts'));
 assert.equal(f.owner.command({op:'commit-prepared',token:pending.token}).ok,true);assert.deepEqual(accountSave(f.owner),copy(end.after.save));
 assert.equal(f.owner.command(observed(f.owner,25,3)).ok,true);assert.equal(end.after.save.progression.account.credits,11,'later mutation changed retained acknowledgement view');
}
{
 const f=setup('normalize'),before=accountSave(f.owner),pending=f.owner.command({op:'prepare',commands:[command,command]});assert.equal(pending.ok,true);
 const journal=f.owner.preparedJournal(pending.token),[a,b]=journal.map(e=>e.accounts[0]);assert(a&&b);
 assert.deepEqual(copy(a.before.save),before);assert.equal(a.after.save.progression.account.ledger.journal_counter,1);assert.equal(b.after.save.progression.account.ledger.journal_counter,2);assert.equal(a.after,b.before);
 assert.equal(a.after.version,a.before.version+1);assert.equal(b.after.version,a.after.version+1);
 assert.equal(f.owner.command({op:'abort-prepared',token:pending.token}).ok,true);assert.deepEqual(accountSave(f.owner),before);
}
{
 const f=setup(),before=save(f.owner),pending=f.owner.command({op:'prepare',commands:[observed(f.owner,5,1),{...command,profile:999}]});
 assert.equal(pending.ok,false);assert.deepEqual(save(f.owner),before);assert.throws(()=>f.owner.preparedJournal(1),/no-prepared-change/);
 assert.equal(f.owner.command(observed(f.owner,3,1)).ok,true,'failed batch made owner unusable');
}
{
 const f=setup(),a=accountSave(f.owner).progression.account,pending=f.owner.command({op:'prepare',commands:[{op:'account',account:1,command:{op:'observe',level:a.level,credits:a.credits,ledger:a.ledger,roster:a.roster}}]});
 assert.equal(pending.ok,true);assert.equal(pending.token,0,'identical account observation generated a save');
}
console.log({accountJournalCourses:4,intermediateAccountPublication:true,normalizedWorkshopLedger:true,sharedImmutableViews:true,unchangedSaveFormat:true});
