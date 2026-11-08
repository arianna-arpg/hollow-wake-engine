// Oracle: already-qualified SDK sessions and frozen authored content, outside Unity.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root} from '../../scripts/reference-utils.mjs';
import {ProgressionSession} from '../../dist/progression-session.js';
import {EquipmentSlots} from '../../dist/equipment-actions.js';
import {WorkshopVestiges} from '@hollow-wake/engine/items/vestiges/workshop';
import {createCraftingContext} from '../../adapters/embedded/crafting-session.mjs';
const assets=JSON.parse(fs.readFileSync(process.argv[3]));
const account=new ProgressionSession(assets.progression);
const workshop=createCraftingContext(assets.workshop,items=>new WorkshopVestiges(items)).session;
workshop.configureEquipment(new EquipmentSlots(assets.equipment));
const call=(owner,request)=>{const reply=owner.command(request);assert(reply.ok,JSON.stringify(reply));return reply;};
const save=(owner,profile=1)=>call(owner,{op:'save',profile}).save;
call(account,{op:'open',profile:1,seed:1});
const initialAccount=save(account).account;
initialAccount.credits=1000;initialAccount.features=['bounty_board','quest_giver','reliquary'];
initialAccount.ledger={'deed:melee_finishes':300,oracle_reliquary_attuned:1};
initialAccount.reliquary.items=[{uid:4294967295,relicKey:'opaque',w:1,h:1,
  payload:JSON.parse('{"__proto__":{"kept":true},"n":0.3333333333333333,"tiny":5e-324,"large":9007199254740991,"text":"雪😀"}')}];
initialAccount.reliquary.stash.cells={opaque:{page:0,x:0,y:0}};
call(account,{op:'close',profile:1});call(account,{op:'open',profile:1,seed:1,account:initialAccount});
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const temp=fs.mkdtempSync(path.join(root,'.artifacts/unity-account-inputs-'));
let equipment;
try{
  const file=path.join(temp,'equipment.json');
  execFileSync(process.execPath,[path.join(root,'test/unity-live-equipment/inputs.mjs'),file],{windowsHide:true});
  equipment=JSON.parse(fs.readFileSync(file));
}finally{assert.equal(path.dirname(temp),path.join(root,'.artifacts'));fs.rmSync(temp,{recursive:true,force:true});}
call(workshop,{op:'open',profile:1,seed:17,state:JSON.parse(equipment.state)});
const commands={
  purchase:JSON.stringify({op:'buy',id:'feat_vendor_wares_1'}),
  memory:JSON.stringify({op:'buy',id:'memory_discovery'}),
  forge:JSON.stringify({op:'mint',kind:'forge',options:{baseId:'helmet_armor',ilvl:1,rarity:'common',sockets:2,quality:.5}}),
  equip:JSON.stringify({op:'equip',uid:4294967297,slot:'ring1',actorLevel:1}),
  invalidWorkshop:JSON.stringify({op:'mint',kind:'forge',options:{baseId:'helmet_armor',ilvl:1,rarity:'invalid',sockets:0}}),
};
const invalidBefore=save(workshop);
assert.equal(workshop.command({...JSON.parse(commands.invalidWorkshop),profile:1}).ok,false);
assert.deepEqual(save(workshop),invalidBefore);
const expected={},capture=name=>expected[name]={account:save(account),workshop:save(workshop)};
const execute=(a,w,profile=1)=>({
  account:a?call(account,{...JSON.parse(a),profile}):null,
  workshop:w?call(workshop,{...JSON.parse(w),profile}):null
});
capture('initial');
assert(execute(commands.purchase,commands.forge).account.result);
capture('pair');
const before=save(account);assert.equal(execute(commands.purchase,null).account.result,false);assert.deepEqual(save(account),before);
assert(execute(commands.memory,commands.equip).account.result);capture('equipped');
assert(execute(commands.memory,commands.forge).account.result);capture('continued');
assert(execute(commands.memory,commands.forge).account.result);capture('cancel-committed');
call(account,{op:'restore',profile:2,save:expected.initial.account});
call(workshop,{op:'restore',profile:2,save:expected.initial.workshop});
assert(execute(commands.memory,commands.equip,2).account.result);
expected['publication-failure']={account:save(account,2),workshop:save(workshop,2)};
call(account,{op:'close',profile:2});call(workshop,{op:'close',profile:2});
call(account,{op:'open',profile:2,seed:17});
call(account,{op:'observe',profile:2,level:1,credits:1000,ledger:{},roster:[]});
call(workshop,{op:'open',profile:2,seed:17,state:{board:{w:6,h:6},items:[],overflow:[],equipped:{},essences:{},
  account:{features:[],ledger:{},craftLore:{},progression:true}}});
const sampleExpected={},sampleCapture=name=>sampleExpected[name]={account:save(account,2),workshop:save(workshop,2)};
sampleCapture('initial');
assert(execute(commands.memory,null,2).account.result);sampleCapture('memory');
execute(null,commands.forge,2);sampleCapture('forge');
assert(execute(commands.memory,null,2).account.result);sampleCapture('continued');
const input={account:JSON.stringify(initialAccount),state:equipment.state,config:equipment.config,...commands,
  extra:'{"__proto__":{"kept":true},"value":9007199254740991}',
  stash:'{"items":[],"fraction":0.125,"text":"雪 🎒"}',expected,sampleExpected};
fs.writeFileSync(process.argv[2],JSON.stringify(input),{flag:'wx'});
console.log({passed:true,states:Object.keys(expected).length,originalEquipment:true,opaqueAccount:true});
