import assert from 'node:assert/strict';
import {openCourse,send,accountSave,workshopSave,access} from './contracts.mjs';

export function preparedContracts(test,{AccountWorkshopSession,definitions,baseline}) {
const copy=value=>JSON.parse(JSON.stringify(value));
const fresh=()=>openCourse(new AccountWorkshopSession(definitions),baseline.scenarios[0]);
const sendPlain=(host,request)=>copy(send(host,request));
const account=command=>({op:'account',account:1,command});
const inventory=(command,profile=1)=>({op:'workshop',profile,command});
const salvage=(uid=1002,profile=1)=>inventory({op:'salvage',uid,lane:'break',access},profile);
const memory=()=>account({op:'buy',id:'memory_discovery'});
const states=(host,profiles=[1])=>({account:sendPlain(host,{op:'account-save',account:1}),
 inventories:profiles.map(profile=>sendPlain(host,{op:'workshop-save',profile}))});
const prepare=(host,commands)=>sendPlain(host,{op:'prepare',commands});
const preparedSave=(host,pending,kind,handle)=>sendPlain(host,{op:'prepared-save',token:pending.token,kind,handle});

test('prepared account and inventory changes publish together and preserve ordinary command results',()=>{
 const host=fresh(),ordinary=fresh();
 for(const owner of [host,ordinary])send(owner,{op:'open-workshop',profile:2,account:1,seed:71,state:baseline.scenarios[0].initial.inventory});
 const before=states(host,[1,2]);
 const {owner,...observed}=baseline.rows.find(row=>row.scenario==='shared-authority'&&row.name==='observe-deed').command;
 const commands=[salvage(),salvage(1003),account({...observed,credits:1000,roster:baseline.scenarios[0].initial.account.roster}),
  account({op:'buy',id:'feat_craft_second'}),inventory({op:'craft',uid:1001,affixId:'life',score:.5,access},2),memory()];
 const expected=commands.map(command=>sendPlain(ordinary,command)),after=states(ordinary,[1,2]);
 const pending=prepare(host,commands);assert.deepEqual(pending.replies,expected);
 assert.deepEqual(pending.writes,[{kind:'account',handle:1},{kind:'workshop',handle:1},{kind:'workshop',handle:2}]);
 assert.deepEqual(states(host,[1,2]),before);
 assert.deepEqual(preparedSave(host,pending,'account',1),after.account);
 assert.deepEqual(preparedSave(host,pending,'workshop',1),after.inventories[0]);
 assert.deepEqual(preparedSave(host,pending,'workshop',2),after.inventories[1]);
 send(host,{op:'commit-prepared',token:pending.token});assert.deepEqual(states(host,[1,2]),after);
 assert.deepEqual(sendPlain(host,memory()),sendPlain(ordinary,memory()));
});
test('abort restores both random streams and retiring tokens cannot reach a later proposal',()=>{
 const host=fresh(),before=states(host),first=prepare(host,[memory(),salvage()]);
 const candidate=preparedSave(host,first,'account',1);
 send(host,{op:'abort-prepared',token:first.token});assert.deepEqual(states(host),before);
 const next=prepare(host,[memory(),salvage()]);assert(next.token>first.token);assert.deepEqual(next.replies,first.replies);
 assert.deepEqual(preparedSave(host,next,'account',1),candidate);
 for(const op of ['prepared-save','commit-prepared','abort-prepared']){
  const request={op,token:first.token,...(op==='prepared-save'?{kind:'account',handle:1}:{})};
  assert.equal(host.command(request).reason,'stale-prepared-change');assert.deepEqual(states(host),before);
 }
 send(host,{op:'commit-prepared',token:next.token});assert.deepEqual(states(host).account,candidate);
 assert.equal(host.command({op:'commit-prepared',token:next.token}).reason,'no-prepared-change');
});
test('pending storage retains committed reads and refuses every other mutation or rule query',()=>{
 const host=fresh(),before=states(host),pending=prepare(host,[memory()]);
 for(const request of [memory(),salvage(),account({op:'catalogue',offset:0,limit:1}),{op:'prepare',commands:[salvage()]},
  {op:'close-workshop',profile:1},{op:'close-account',account:1},{op:'open-account',account:2,key:'new',seed:7},
  {op:'open-workshop',profile:2,account:1,seed:7,state:baseline.scenarios[0].initial.inventory}])
  assert.equal(host.command(request).reason,'prepared-change-pending');
 assert.deepEqual(states(host),before);
 assert.equal(host.command({op:'prepared-save',token:pending.token,kind:'workshop',handle:1}).reason,'record-not-prepared');
 assert.equal(host.command({op:'prepared-save',token:pending.token,kind:'other',handle:1}).reason,'invalid-prepared-kind');
 send(host,{op:'abort-prepared',token:pending.token});assert.equal(sendPlain(host,memory()).changed,true);
});
test('an invalid later command discards earlier candidate changes without burning a token',()=>{
 for(const invalid of [account({op:'unknown'}),inventory({op:'salvage',uid:1002,lane:'wrong',access}),
  {op:'close-workshop',profile:1},{op:'restore-account',account:2,save:{}},{op:'prepare',commands:[memory()]}]){
  const host=fresh(),before=states(host);
  assert.equal(host.command({op:'prepare',commands:[memory(),salvage(),invalid]}).ok,false);
  assert.deepEqual(states(host),before);
  const pending=prepare(host,[memory()]);assert.equal(pending.token,1);send(host,{op:'abort-prepared',token:pending.token});
 }
});
test('unchanged batches need no commit and gameplay refusal remains visible to caller policy',()=>{
 const host=fresh(),before=states(host),request=account({op:'buy',id:'feat_craft_second'});
 const result=prepare(host,[request,account({op:'catalogue',offset:0,limit:1})]);
 assert.equal(result.token,0);assert.deepEqual(result.writes,[]);assert.equal(result.replies[0].reply.result,false);
 assert.deepEqual(states(host),before);assert.equal(host.command({op:'commit-prepared',token:0}).ok,false);
 // Transport admission does not silently reinterpret a gameplay refusal. A
 // coordinator can reject this provisional batch before writing any record.
 const pending=prepare(host,[request,memory()]);assert(pending.token>0);assert.equal(pending.replies[0].reply.result,false);
 assert.deepEqual(states(host),before);send(host,{op:'abort-prepared',token:pending.token});assert.deepEqual(states(host),before);
});
test('prepared replies and candidate saves cannot mutate the staged or committed owner',()=>{
 const host=fresh(),before=states(host),pending=host.command({op:'prepare',commands:[memory(),salvage()]});
 assert.equal(pending.ok,true);
 const expected=preparedSave(host,pending,'account',1),exposed=host.command({op:'prepared-save',token:pending.token,kind:'account',handle:1});
 assert.equal(exposed.ok,true);
 exposed.save.progression.account.credits=0;pending.writes.length=0;pending.replies[0].version=999;
 assert.deepEqual(states(host),before);assert.deepEqual(preparedSave(host,pending,'account',1),expected);
 send(host,{op:'commit-prepared',token:pending.token});assert.deepEqual(states(host).account,expected);
});
test('record and batch bounds roll back the whole candidate and leave every inventory usable',()=>{
 const host=fresh();for(let profile=2;profile<=8;profile++)send(host,{op:'open-workshop',profile,account:1,seed:profile,state:baseline.scenarios[0].initial.inventory});
 const profiles=Array.from({length:8},(_,i)=>i+1),before=states(host,profiles);
 assert.equal(host.command({op:'prepare',commands:profiles.map(profile=>salvage(1002,profile))}).reason,'prepared-record-limit');
 assert.deepEqual(states(host,profiles),before);
 for(const commands of [[],Array.from({length:17},memory),null,{}])assert.equal(host.command({op:'prepare',commands}).ok,false);
 const allowed=prepare(host,profiles.slice(0,7).map(profile=>salvage(1002,profile)));assert.equal(allowed.writes.length,8);
 assert.deepEqual(states(host,profiles),before);send(host,{op:'abort-prepared',token:allowed.token});
 for(const profile of profiles)assert.equal(sendPlain(host,inventory({op:'options',uid:1001,offset:0,limit:1},profile)).changed,false);
});
test('random continuation overflow in a later operation cannot publish the earlier operation',()=>{
 const host=fresh(),saved=accountSave(host),inventorySave=workshopSave(host);saved.progression.random.draws=Number.MAX_SAFE_INTEGER;
 const resumed=new AccountWorkshopSession(definitions);send(resumed,{op:'restore-account',account:1,save:saved});send(resumed,{op:'restore-workshop',profile:1,account:1,save:inventorySave});
 const before=states(resumed);assert.equal(resumed.command({op:'prepare',commands:[salvage(),memory()]}).ok,false);
 assert.deepEqual(states(resumed),before);assert.equal(sendPlain(resumed,salvage()).accountChanged,true);
});

const gear=(host,profile=1,token)=>sendPlain(host,{op:token===undefined?'workshop-equipment-text':'prepared-workshop-equipment-text',profile,...token===undefined?{}:{token}}).text;
const equip=(profile=1)=>inventory({op:'equip',uid:1002,actorLevel:99,slot:'ring1'},profile);
test('equipment reads separate committed and prepared maps without publishing or consuming random state',()=>{
 const host=fresh(),ordinary=fresh(),before=states(host),empty=gear(host);
 assert.deepEqual(JSON.parse(empty),{});sendPlain(ordinary,equip());const expected=states(ordinary);
 const pending=prepare(host,[equip()]);assert(pending.replies[0].reply.result.changed);
 const text=gear(host,1,pending.token);assert.equal(JSON.parse(text).ring1.uid,1002);
 assert.deepEqual(JSON.parse(text),expected.inventories[0].save.workshop.state.equipped);
 assert(text.length<JSON.stringify(expected.inventories[0]).length/2);
 for(let i=0;i<4;i++){assert.equal(gear(host),empty);assert.equal(gear(host,1,pending.token),text);}
 assert.deepEqual(states(host),before);send(host,{op:'commit-prepared',token:pending.token});
 assert.equal(gear(host),text);assert.deepEqual(states(host),expected);
});
test('candidate gear includes unchanged dependencies and aborted tokens cannot read later proposals',()=>{
 const host=fresh();send(host,{op:'open-workshop',profile:2,account:1,seed:71,state:baseline.scenarios[0].initial.inventory});
 const before=states(host,[1,2]),pending=prepare(host,[equip()]),candidate=gear(host,1,pending.token);
 assert(!pending.writes.some(row=>row.kind==='workshop'&&row.handle===2));assert.equal(gear(host,2,pending.token),gear(host,2));
 send(host,{op:'abort-prepared',token:pending.token});assert.deepEqual(states(host,[1,2]),before);
 const next=prepare(host,[equip(2)]);assert(next.token>pending.token);
 assert.equal(host.command({op:'prepared-workshop-equipment-text',profile:1,token:pending.token}).reason,'stale-prepared-change');
 assert.deepEqual(JSON.parse(gear(host,1,next.token)),{});assert.equal(gear(host,2,next.token),candidate);
 send(host,{op:'commit-prepared',token:next.token});assert.equal(gear(host,2),candidate);assert.deepEqual(JSON.parse(gear(host)),{});
 assert.equal(host.command({op:'prepared-workshop-equipment-text',profile:2,token:next.token}).reason,'no-prepared-change');
});
test('malformed equipment reads preserve both complete states and the active proposal',()=>{
 const host=fresh(),before=states(host),pending=prepare(host,[equip()]),candidate=gear(host,1,pending.token);
 for(const request of [{op:'workshop-equipment-text',profile:1,token:pending.token},
  {op:'workshop-equipment-text',profile:1,account:1},{op:'workshop-equipment-text',profile:-1},
  {op:'workshop-equipment-text',profile:2},...[0,-1,null,undefined,1.5,Number.MAX_SAFE_INTEGER+1].map(token=>({op:'prepared-workshop-equipment-text',profile:1,token})),
  {op:'prepared-workshop-equipment-text',profile:2,token:pending.token}])assert.equal(host.command(request).ok,false,JSON.stringify(request));
 assert.deepEqual(states(host),before);assert.equal(gear(host,1,pending.token),candidate);
 send(host,{op:'abort-prepared',token:pending.token});send(host,{op:'close-workshop',profile:1});
 assert.equal(host.command({op:'workshop-equipment-text',profile:1}).reason,'workshop-not-open');
});
}
