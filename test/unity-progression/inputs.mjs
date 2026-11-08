// Binding oracle: the already-qualified SDK session, never the Unity adapter.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ProgressionSession} from '../../dist/progression-session.js';
import {unlockContentPack} from '../../scripts/compile-unlock-content.mjs';
import {memoryRewardPack} from '../../scripts/compile-memory-rewards.mjs';
import {progressionGatePack} from '../../scripts/compile-progression-gates.mjs';
import {sha256} from '../../scripts/reference-utils.mjs';
const content={unlocks:unlockContentPack(),memories:memoryRewardPack(),gates:progressionGatePack()};
const baseline=JSON.parse(fs.readFileSync(new URL('../../baseline/unlock-lifecycle/compiled-content.json',import.meta.url)));
for(const [key,pack]of Object.entries(content))assert.equal(sha256(JSON.stringify(pack,null,2)+'\n'),baseline.packs[key].sha256);
const session=new ProgressionSession(content),steps=[],expected=[];
const call=(request,step=request)=>{
  const result=session.command(request);steps.push(step);expected.push(result);return result;
};
const save=(profile=0)=>{
  const reply=session.command({op:'save',profile});assert(reply.ok);
  steps.push({op:'save',profile});expected.push(reply.save);return JSON.parse(JSON.stringify(reply.save));
};
assert(call({op:'open',profile:0,seed:1}).ok);
const initial=save().account;
initial.credits=1000;
initial.features=['bounty_board','quest_giver','reliquary'];
initial.ledger={'deed:melee_finishes':300,oracle_reliquary_attuned:1};
initial.reliquary.items=[
  {uid:4294967295,relicKey:'__proto__',w:6,h:4,payload:JSON.parse('{"__proto__":{"kept":true},"n":0.3333333333333333,"tiny":5e-324,"large":9007199254740991,"text":"雪😀"}')},
  {uid:4294967294,relicKey:'overflow',w:1,h:1,payload:{text:'quote"slash\\\n\u0001'}}
];
initial.reliquary.stash.cells=JSON.parse('{"__proto__":{"page":0,"x":0,"y":0}}');
call({op:'close',profile:0});
call({op:'open',profile:0,seed:1,account:initial},{op:'open',profile:0,seed:1,text:JSON.stringify(initial)});
for(const command of [
  {op:'invest',id:'feat_vendor_wares_1',amount:17},{op:'buy',id:'feat_vendor_wares_1'},
  {op:'buy',id:'feat_vendor_wares_1'},{op:'settle'},{op:'acknowledge',id:'class_spellblade'},
  {op:'acknowledge',id:'class_spellblade'},{op:'buy',id:'relic_stash_2'},{op:'buy',id:'reliquary_power_1'},
  ...Array.from({length:10},()=>({op:'buy',id:'memory_discovery'}))
]){call({...command,profile:0});save();}
const checkpoint=save();
assert.equal(checkpoint.account.credits,575);assert.equal(checkpoint.random.draws,10);
assert(checkpoint.account.features.includes('brandt_extra_gems'));
assert(checkpoint.account.unlockedClasses.includes('spellblade'));
assert(!checkpoint.account.pendingClassUnlocks.includes('spellblade'));
assert.equal(checkpoint.account.reliquary.stash.cells.overflow.page,1);
assert.deepEqual(checkpoint.account.reliquary.items,initial.reliquary.items);
call({op:'restore',profile:1,save:checkpoint},{op:'restore',profile:1,text:JSON.stringify(checkpoint)});
for(let i=0;i<10;i++){
  const a=call({op:'buy',profile:0,id:'memory_discovery'}),b=call({op:'buy',profile:1,id:'memory_discovery'});
  assert.deepEqual(a,b);
}
assert.deepEqual(save(0),save(1));
let total=1;
for(let offset=0;offset<total;offset+=64)total=call({op:'catalogue',profile:0,offset,limit:64}).total;
assert(total>190);
call({op:'observe',profile:1,level:99,credits:9007199254740991,ledger:JSON.parse('{"__proto__":9007199254740991,"count":42}'),roster:[]},
  {op:'observe',profile:1,level:99,credits:9007199254740991,ledger:'{"__proto__":9007199254740991,"count":42}',roster:'[]'});
const observed=save(1);assert.equal(observed.account.credits,9007199254740991);
call({op:'relics',profile:1,state:initial.reliquary},{op:'relics',profile:1,text:JSON.stringify(initial.reliquary)});save(1);
// C# owns routing, so nested lifecycle/profile fields must never reach the core.
for(const text of ['{"op":"close"}','{"op":"buy","id":"memory_discovery","profile":1}','null','[']){
  steps.push({op:'execute',profile:0,text});
  expected.push({ok:false,reason:text==='['?'invalid-json':text==='null'?'invalid-request':'invalid-profile-command'});
}
save();
for(let profile=2;profile<8;profile++)call({op:'open',profile,seed:profile});
const throws=(step)=>{steps.push({...step,throws:true});expected.push({threw:true});};
throws({op:'open',profile:8,seed:1});throws({op:'open',profile:0,seed:1});
call({op:'close',profile:2});
const bad={...checkpoint,content:['foreign']};
throws({op:'restore',profile:2,text:JSON.stringify(bad)});
call({op:'restore',profile:2,save:checkpoint},{op:'restore',profile:2,text:JSON.stringify(checkpoint)});save(2);
for(let profile=0;profile<8;profile++)call({op:'close',profile});
// Exercise the actual large text envelope and the largest public profile number.
const large=structuredClone(initial);large.reliquary.items[0].payload='x'.repeat(129000);
assert(call({op:'open',profile:4294967295,seed:4294967295,account:large},
  {op:'open',profile:4294967295,seed:4294967295,text:JSON.stringify(large)}).ok);
const largeSave=save(4294967295);
call({op:'restore',profile:0,save:largeSave},{op:'restore',profile:0,text:JSON.stringify(largeSave)});save();
call({op:'close',profile:4294967295});call({op:'close',profile:0});
fs.writeFileSync(process.argv[2],JSON.stringify({steps,expected}),{flag:'wx'});
console.log(JSON.stringify({steps:steps.length,catalogue:total,independentChecks:true}));
