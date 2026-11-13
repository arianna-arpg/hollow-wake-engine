import test from 'node:test';import assert from 'node:assert/strict';
import {AccountWorkshopSession} from '../dist/account-workshop-session.js';
import {AccountWorkshopSessionCore} from '../dist/account-workshop-core.js';
import {CompleteAccountWorkshopSession} from '../dist/account-workshop-complete.js';
import {CraftingSession} from '../dist/crafting-session.js';
import {definitions,baseline} from './shared-account/fixtures.mjs';
import {openCourse,accountSave,workshopSave} from './shared-account/contracts.mjs';

test('public construction ignores inaccessible complete-policy extras',()=>{
 const options={...definitions,get completeKernel(){throw Error('complete option read');},get ruleKernel(){throw Error('rule option read');}};
 const owner=new AccountWorkshopSession(options);
 assert.equal(owner.command({op:'account-save',account:0}).reason,'account-not-open');
});

test('complete construction requires a codec and uses the validated kernel once',()=>{
 for(const completeKernel of [undefined,null,false,0,{},[],{execute(){}},{execute(){},character:{}}])
  assert.throws(()=>new CompleteAccountWorkshopSession({...definitions,completeKernel}),/complete-kernel-required/);
 const kernel={execute(){throw Error('unused');},character:{admit(){throw Error('unused');},checkInventory(){},uidFloor(){return 1;}}};
 let reads=0;
 const owner=new CompleteAccountWorkshopSession({...definitions,get completeKernel(){reads++;return reads===1?kernel:undefined;}});
 assert.equal(reads,1);assert.equal(owner.command({op:'account-save',account:0}).reason,'account-not-open');
});

test('trusted rule results cannot override account features or progression',()=>{
 for(const field of ['features','progression']){
  const crafting=new CraftingSession(definitions.workshop,1);
  const ruleKernel={execute(open,command){
   assert.equal(crafting.command({...open,profile:0}).ok,true);
   try{
    const reply=command===undefined?null:crafting.command({...command,profile:0});
    const saved=crafting.command({op:'save',profile:0});assert.equal(saved.ok,true);
    if(command){if(field==='features')saved.save.state.account.features.push('unauthorized');else saved.save.state.account.progression=!saved.save.state.account.progression;}
    return{reply,save:saved.save};
   }finally{assert.equal(crafting.command({op:'close',profile:0}).ok,true);}
  }};
  const owner=openCourse(new AccountWorkshopSessionCore(definitions,{}, {ruleKernel}),baseline.scenarios[0]);
  const before=[accountSave(owner),workshopSave(owner)];
  assert.deepEqual(owner.command({op:'workshop',profile:1,command:{op:'options',uid:1001,offset:0,limit:1}}),{ok:false,reason:'account-owner-violation'});
  assert.deepEqual([accountSave(owner),workshopSave(owner)],before);
 }
});
