import test from 'node:test';
import assert from 'node:assert/strict';
import {ProgressionSession} from '../dist/progression-session.js';
import {unlockContentPack} from '../scripts/compile-unlock-content.mjs';
import {memoryRewardPack} from '../scripts/compile-memory-rewards.mjs';
import {progressionGatePack} from '../scripts/compile-progression-gates.mjs';
const content = {unlocks:unlockContentPack(),memories:memoryRewardPack(),gates:progressionGatePack()};
const clean = v => JSON.parse(JSON.stringify(v));
const run = (s,op,extra={},profile=0) => clean(s.command({op,profile,...extra}));
const save = (s,id=0) => {const r=run(s,'save',{},id);assert(r.ok,JSON.stringify(r));return r.save;};
function fixture(edit=()=>{}) {
  const s=new ProgressionSession(content);assert(run(s,'open',{seed:1}).ok);
  const account=save(s).account;account.credits=1000;edit(account);
  assert(run(s,'close').ok);assert(run(s,'open',{seed:1,account}).ok);return s;
}

test('account transactions preserve partial investments and detached replies',()=>{
  const s=fixture();let row=run(s,'invest',{id:'feat_vendor_wares_1',amount:17});
  assert.equal(row.spent,17);assert.equal(save(s).account.invested.feat_vendor_wares_1,17);
  row=run(s,'buy',{id:'feat_vendor_wares_1'});assert.equal(row.result,true);assert.equal(row.spent,43);
  const saved=save(s);assert.equal(saved.account.credits,940);assert(saved.account.features.includes('brandt_extra_gems'));
  saved.account.credits=0;saved.account.features.length=0;assert.equal(save(s).account.credits,940);
  assert.equal(run(s,'buy',{id:'feat_vendor_wares_1'}).result,false);
  assert.equal(save(s).random.draws,0);
});

test('full catalogue is paged, detached and independent of purchase randomness',()=>{
  const s=fixture(),before=save(s),rows=[];
  for(let offset=0; ;offset+=64){const page=run(s,'catalogue',{offset,limit:64});assert(page.ok,JSON.stringify(page));rows.push(...page.rows);if(offset+64>=page.total)break;}
  assert(rows.length>190);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  assert(rows.some(r=>r.id==='memory_discovery'&&r.visible));assert.deepEqual(save(s),before);
  assert.equal(run(s,'catalogue',{offset:0,limit:65}).ok,false);
});

test('seeded rewards continue after save/restore and do not share state',()=>{
  const s=fixture();assert(run(s,'open',{seed:1,account:save(s).account},1).ok);
  const first=run(s,'buy',{id:'memory_discovery'});assert(first.result);assert.equal(first.spent,30);assert.equal(first.draws,1);
  assert.equal(save(s,1).random.draws,0);assert.equal(save(s,1).account.credits,1000);
  const snapshot=save(s);assert(run(s,'restore',{save:snapshot},2).ok);
  for(let i=0;i<10;i++)assert.deepEqual(run(s,'buy',{id:'memory_discovery'}),run(s,'buy',{id:'memory_discovery'},2));
  assert.deepEqual(save(s),save(s,2));assert.equal(save(s).account.memoryReceipts.memory_discovery.sequence,11);
  assert.equal(run(s,'buy',{id:'memory_discovery'},1).receipt.id,first.receipt.id);
});

test('earned class settlement and acknowledgement survive a round trip',()=>{
  const s=fixture(a=>{a.features=['bounty_board','quest_giver'];a.ledger={'deed:melee_finishes':300};});
  assert(run(s,'settle').claimed.includes('class_spellblade'));
  let snapshot=save(s);assert(snapshot.account.pendingClassUnlocks.includes('spellblade'));
  assert(run(s,'restore',{save:snapshot},1).ok);
  assert.equal(run(s,'acknowledge',{id:'class_spellblade'},1).result,true);
  snapshot=save(s,1);assert(snapshot.account.unlockedClasses.includes('spellblade'));assert(!snapshot.account.pendingClassUnlocks.includes('spellblade'));
  assert.equal(run(s,'acknowledge',{id:'class_spellblade'},1).result,false);
});

test('storage purchases retain opaque items and place previously overflowing reserve bodies',()=>{
  const s=fixture(a=>{
    a.features=[content.unlocks.reliquaryFeature];a.ledger[content.unlocks.reliquaryConfig.attunement]=1;
    a.reliquary.items=[{uid:1,relicKey:'__proto__',w:6,h:4,payload:{custom:['a',1,{keep:true}]}},
      {uid:2,relicKey:'overflow',w:1,h:1,payload:{unknown:42}}];
    a.reliquary.stash.cells=JSON.parse('{"__proto__":{"y":0,"x":0,"page":0}}');
  });
  const before=save(s).account.reliquary.items;
  const receipt=run(s,'buy',{id:'relic_stash_2'});assert(receipt.result,JSON.stringify(receipt));assert.equal(receipt.spent,40);
  const relic=save(s).account.reliquary;assert.deepEqual(relic.items,before);assert.equal(relic.stash.pages,2);
  assert.deepEqual(relic.stash.cells.overflow,{page:1,x:0,y:0});assert.equal(relic.stash.cells.__proto__.page,0);
  assert.equal(run(s,'buy',{id:'reliquary_power_1'}).spent,25);assert.equal(save(s).account.reliquary.rank,1);
  assert(run(s,'restore',{save:save(s)},1).ok);
});

test('observations and resurrection compose without replacing owned rewards',()=>{
  const s=fixture();assert(run(s,'buy',{id:'feat_bounty_board'}).result);
  assert(run(s,'observe',{level:8,credits:42,ledger:{'deed:melee_finishes':12},roster:[{charId:'hero',name:'Hero',fallen:{level:7,fee:19}}]}).ok);
  const id=content.unlocks.keys.resurrectPrefix+'hero';assert.equal(run(s,'buy',{id}).spent,19);
  const snapshot=save(s);assert.equal(snapshot.account.roster[0].fallen,undefined);assert(snapshot.account.features.includes('bounty_board'));
});

test('invalid commands, hostile JSON shapes and incomplete observations leave state and RNG unchanged',()=>{
  const s=fixture(),before=save(s);
  let getterCalls=0;
  const getter={op:'observe',profile:0,get ledger(){getterCalls++;return {};}};
  const cyclic={};cyclic.self=cyclic;
  for(const request of [getter,cyclic,{op:'open',profile:5,seed:-1}, {op:'buy',profile:-1,id:'memory_discovery'},
    {op:'buy',profile:0,id:'memory_discovery',price:0},{op:'invest',profile:0,id:'memory_discovery',amount:Infinity},
    {op:'invest',profile:0,id:'memory_discovery',amount:0.5}, {op:'observe',profile:0,level:8,credits:77,ledger:{},roster:[{}]},
    {op:'restore',profile:2,save:{...before,content:['wrong']}}, {op:'relics',profile:0,state:{}},new Map(),
    {op:'buy',profile:0,id:'x'.repeat(131073)}, {op:'buy',profile:0,id:'absent'}, {op:'observe',profile:0,ledger:new Date()}]) {
    assert.equal(s.command(request).ok,false);assert.deepEqual(save(s),before);
  }
  assert.equal(getterCalls,0);
});

test('restoration rejects corrupt accounts without occupying the requested handle',()=>{
  const s=fixture(),original=save(s);
  for(const edit of [p=>p.schemaVersion=2,p=>p.random.state=-1,p=>p.random.draws=1.2,p=>p.account.credits=-1,
    p=>p.account.unlockedSkills=['same','same'],p=>p.account.ledger={x:NaN},p=>p.account.memoryReceipts={x:{sequence:0,kind:'skill',id:'x',tier:'secondary'}},
    p=>p.account.reliquary.stash.pages=0,p=>p.account.reliquary.items=[{uid:1,relicKey:'x',w:1,h:1,payload:{}}],
    p=>p.account.reliquary.seated=['missing'],p=>p.account.extra=true]) {
    const bad=structuredClone(original);edit(bad);assert.equal(s.command({op:'restore',profile:2,save:bad}).ok,false);
    assert.equal(run(s,'save',{},2).reason,'not-open');assert.deepEqual(save(s),original);
  }
  assert(run(s,'restore',{save:original},2).ok);
});

test('profile limits, retirement and uint32 handles are explicit',()=>{
  const s=new ProgressionSession(content,2);
  assert(run(s,'open',{seed:0},0xffffffff).ok);assert(run(s,'open',{seed:1}).ok);
  assert.equal(run(s,'open',{seed:1},1).reason,'profile-limit');assert.equal(run(s,'open',{seed:2}).reason,'already-open');
  assert(run(s,'close').ok);assert.equal(run(s,'buy',{id:'memory_discovery'}).reason,'not-open');
  assert(run(s,'open',{seed:1},1).ok);assert.equal(run(s,'open',{seed:1},0x100000000).ok,false);
  const snapshot=save(s,1);snapshot.random.state=0;assert(run(s,'close',{},1).ok);assert(run(s,'restore',{save:snapshot},1).ok);
  assert.equal(save(s,1).random.state,0);
});

test('a transaction that exceeds continuation limits rolls back funds, rewards and randomness together',()=>{
  const s=fixture(),snapshot=save(s);snapshot.random.draws=Number.MAX_SAFE_INTEGER;
  assert(run(s,'restore',{save:snapshot},1).ok);
  const before=save(s,1),result=run(s,'buy',{id:'memory_discovery'},1);
  assert.equal(result.ok,false);assert.equal(result.reason,'invalid-integer');assert.deepEqual(save(s,1),before);
  assert.equal(run(s,'buy',{id:'memory_discovery'}).result,true);
});

test('serialization refuses holes, accessors and oversized/deep payloads without admitting a profile',()=>{
  const s=fixture(),snapshot=save(s),hole=[];hole.length=1;
  let depth={};for(let i=0;i<17;i++)depth={nested:depth};
  for(const payload of [hole,depth,'x'.repeat(131073),new Set(['x'])]) {
    const account=structuredClone(snapshot.account);
    account.reliquary.items=[{uid:1,relicKey:'x',w:1,h:1,payload}];account.reliquary.stash.cells.x={page:0,x:0,y:0};
    assert.equal(s.command({op:'open',profile:1,seed:1,account}).ok,false);assert.equal(run(s,'save',{},1).reason,'not-open');
  }
  assert.deepEqual(save(s),snapshot);
});

test('an oversized reward reply cannot commit a class grant before its refusal',()=>{
  const custom=structuredClone(content),row=structuredClone(custom.unlocks.catalog.find(r=>r.kind==='class'));
  row.id='x'.repeat(131073);delete row.reqAnyOf;delete row.requiresUnlock;row.reqLevel=0;
  custom.unlocks.catalog.push(row);
  const s=new ProgressionSession(custom);assert(run(s,'open',{seed:1}).ok);const before=save(s);
  const result=run(s,'settle');assert.equal(result.ok,false);assert.equal(result.reason,'json-limit');
  assert.deepEqual(save(s),before,'response rejection must preserve ownership and pending claims');
});

test('every admitted profile can save and restore inside the complete command envelope',()=>{
  const s=fixture(),base=save(s).account;
  const characters=value=>typeof value==='string'?value.length:value&&typeof value==='object'
    ?Object.entries(value).reduce((sum,[key,item])=>sum+(Array.isArray(value)?0:key.length)+characters(item),0):0;
  const account=structuredClone(base);account.reliquary.items=[{uid:1,relicKey:'payload',w:1,h:1,payload:''}];
  account.reliquary.stash.cells.payload={page:0,x:0,y:0};
  assert(run(s,'open',{seed:1,account},1).ok);const sample=save(s,1);assert(run(s,'close',{},1).ok);
  const length=131072-characters(sample);
  for(const padding of [length-32,length-4,length-1,length]){
    const value=structuredClone(account);value.reliquary.items[0].payload='x'.repeat(padding);
    const admitted=run(s,'open',{seed:1,account:value},1);
    if(admitted.ok){
      const saved=run(s,'save',{},1);assert(saved.ok,'admitted profile must fit the save reply');
      assert(run(s,'restore',{save:saved.save},2).ok,'returned save must fit the restore request');
      assert(run(s,'close',{},2).ok);assert(run(s,'close',{},1).ok);
    }
  }
});

test('canonical UTF-8 byte limits account for number formatting and escaped payloads',()=>{
  const s=fixture(),before=save(s),base=before.account;
  for(const payload of [Array(25000).fill(Number.MAX_VALUE),'\u0001'.repeat(90000)]) {
    const account=structuredClone(base);account.reliquary.items=[{uid:1,relicKey:'wire',w:1,h:1,payload}];
    account.reliquary.stash.cells.wire={page:0,x:0,y:0};
    const request={op:'open',profile:1,seed:1,account};assert(Buffer.byteLength(JSON.stringify(request))>512*1024);
    assert.equal(s.command(request).reason,'json-byte-limit');assert.equal(run(s,'save',{},1).reason,'not-open');
  }
  for(const payload of ['"\\\b\t\n\f\r\u0001雪😀'.repeat(1000),Array(12000).fill(Number.MAX_VALUE)]) {
    const account=structuredClone(base);account.reliquary.items=[{uid:1,relicKey:'wire',w:1,h:1,payload}];
    account.reliquary.stash.cells.wire={page:0,x:0,y:0};
    assert(run(s,'open',{seed:1,account},1).ok);const snapshot=save(s,1);
    assert(Buffer.byteLength(JSON.stringify({op:'restore',profile:0xffffffff,save:snapshot}))<=512*1024);
    assert(run(s,'restore',{save:snapshot},0xffffffff).ok);
    assert.deepEqual(save(s,0xffffffff),snapshot);assert(run(s,'close',{},1).ok);assert(run(s,'close',{},0xffffffff).ok);
  }
  for(const id of ['\ud800','\udfff'])assert.equal(s.command({op:'buy',profile:0,id}).reason,'invalid-unicode');
  assert.equal(s.command({op:'buy',profile:0,id:'\u0000'}).reason,'unsupported-nul');
  assert.deepEqual(save(s),before);
});
