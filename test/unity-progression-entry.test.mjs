import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {ProgressionSession} from '../dist/progression-session.js';
import {unlockContentPack} from '../scripts/compile-unlock-content.mjs';
import {memoryRewardPack} from '../scripts/compile-memory-rewards.mjs';
import {progressionGatePack} from '../scripts/compile-progression-gates.mjs';
import {root,sha256} from '../scripts/reference-utils.mjs';
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/unity-progression-contract-'));
let create,dispatch;
try{
  const built=await build({entryPoints:[path.join(root,'adapters/unity/progression-entry.mjs')],bundle:true,
    format:'esm',platform:'neutral',write:false,metafile:true,tsconfigRaw:{},
    alias:{'@hollow-wake/engine/progression/session':path.join(root,'dist/progression-session.js')}});
  assert(Object.values(built.metafile.outputs).every(row=>!row.imports.length));
  const file=path.join(directory,'entry.mjs');fs.writeFileSync(file,built.outputFiles[0].contents,{flag:'wx'});
  ({create,dispatch}=await import(pathToFileURL(file).href));
}finally{
  assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(path.join(root,'.artifacts')));
  fs.rmSync(directory,{recursive:true});
}
const content={unlocks:unlockContentPack(),gates:progressionGatePack(),memories:memoryRewardPack()};
const baseline=JSON.parse(fs.readFileSync(new URL('../baseline/unlock-lifecycle/compiled-content.json',import.meta.url)));
for(const [key,pack]of Object.entries(content))assert.equal(sha256(JSON.stringify(pack,null,2)+'\n'),baseline.packs[key].sha256);
const send=(host,op,fields={})=>dispatch(host,{op,profile:0,...fields});
const execute=(host,body,profile=0)=>send(host,'profile-command',{profile,text:JSON.stringify(body)});
function snapshot(host,profile=0){
  const reply=send(host,'snapshot-text',{profile});assert(reply.ok,JSON.stringify(reply));return JSON.parse(reply.text);
}
function account(){
  const host=create(content);assert(send(host,'open',{seed:1}).ok);
  const state=snapshot(host).account;state.credits=1000;
  state.features=['bounty_board','quest_giver','reliquary'];
  state.ledger={'deed:melee_finishes':300,oracle_reliquary_attuned:1};
  state.reliquary.items=[
    {uid:4294967295,relicKey:'__proto__',w:6,h:4,payload:JSON.parse('{"__proto__":{"kept":true},"n":0.3333333333333333,"tiny":5e-324,"large":9007199254740991,"text":"雪😀"}')},
    {uid:4294967294,relicKey:'overflow',w:1,h:1,payload:{text:'quote"slash\\\n\u0001'}}
  ];
  state.reliquary.stash.cells=JSON.parse('{"__proto__":{"page":0,"x":0,"y":0}}');
  return state;
}
test('Unity account envelopes reproduce the complete existing progression course',()=>{
  const host=create(content),original=new ProgressionSession(content),start=account();
  assert(send(host,'open-text',{seed:1,text:JSON.stringify(start)}).ok);
  assert(original.command({op:'open',profile:0,seed:1,account:start}).ok);
  for(const command of [
    {op:'invest',id:'feat_vendor_wares_1',amount:17},{op:'buy',id:'feat_vendor_wares_1'},
    {op:'buy',id:'feat_vendor_wares_1'},{op:'settle'},{op:'acknowledge',id:'class_spellblade'},
    {op:'acknowledge',id:'class_spellblade'},{op:'buy',id:'relic_stash_2'},{op:'buy',id:'reliquary_power_1'},
    ...Array.from({length:10},()=>({op:'buy',id:'memory_discovery'}))
  ]){
    assert.deepEqual(execute(host,command),original.command({...command,profile:0}),command.op);
    assert.deepEqual(snapshot(host),JSON.parse(JSON.stringify(original.command({op:'save',profile:0}).save)));
  }
  const state=snapshot(host);
  assert.equal(state.account.credits,575);assert.equal(state.random.draws,10);
  assert(state.account.features.includes('brandt_extra_gems'));
  assert(state.account.unlockedClasses.includes('spellblade'));
  assert(!state.account.pendingClassUnlocks.includes('spellblade'));
  assert.equal(state.account.reliquary.stash.cells.overflow.page,1);
  assert.deepEqual(state.account.reliquary.items,start.reliquary.items);
});
test('opaque snapshots preserve arbitrary keys, binary64 values and random continuation',()=>{
  const host=create(content),other=create(content),start=account();
  assert(send(host,'open-text',{seed:0xffffffff,text:JSON.stringify(start)}).ok);
  execute(host,{op:'buy',id:'memory_discovery'});
  const saved=send(host,'snapshot-text').text;
  assert(send(other,'restore-text',{profile:0xffffffff,text:saved}).ok);
  assert.equal(send(other,'snapshot-text',{profile:0xffffffff}).text,saved);
  for(let index=0;index<10;index++)
    assert.deepEqual(execute(other,{op:'buy',id:'memory_discovery'},0xffffffff),execute(host,{op:'buy',id:'memory_discovery'}));
  assert.equal(send(other,'snapshot-text',{profile:0xffffffff}).text,send(host,'snapshot-text').text);
});
test('all catalogue pages and authoritative observation commands keep their original meaning',()=>{
  const host=create(content);assert(send(host,'open',{seed:0}).ok);
  assert(send(host,'observe-text',{level:99,credits:9007199254740991,
    ledger:'{"__proto__":9007199254740991,"literal":42}',roster:'[]'}).ok);
  const saved=snapshot(host);assert.equal(saved.account.credits,9007199254740991);
  assert.equal(saved.account.ledger.__proto__,9007199254740991);
  const rows=[];let total;
  for(let offset=0;total===undefined||offset<total;offset+=64){
    const page=execute(host,{op:'catalogue',offset,limit:64});assert(page.ok);
    total=page.total;rows.push(...page.rows);
  }
  assert(total>64);assert.equal(rows.length,total);assert.equal(new Set(rows.map(r=>r.id)).size,total);
  assert.deepEqual(snapshot(host),saved);
  const relics=account().reliquary;
  assert(send(host,'relics-text',{text:JSON.stringify(relics)}).ok);
  assert.deepEqual(snapshot(host).account.reliquary,relics);
});
test('profile routing and malformed envelopes cannot affect either account',()=>{
  const host=create(content);
  assert(send(host,'open',{seed:0}).ok);assert(send(host,'open',{profile:1,seed:17}).ok);
  const before=[snapshot(host),snapshot(host,1)];
  for(const request of [
    null,[],{op:'snapshot-text',profile:0,extra:true},
    {op:'open-text',profile:2,seed:1,text:'{}',extra:true},
    {op:'profile-command',profile:0,text:'{"op":"buy","id":"memory_discovery","profile":1}'},
    ...['open','restore','close'].map(op=>({op:'profile-command',profile:0,text:JSON.stringify({op})})),
    {op:'profile-command',profile:0,text:'null'},{op:'profile-command',profile:0,text:'['},
    {op:'restore-text',profile:2,text:'x'.repeat(524289)},
    {op:'observe-text',profile:0,level:1,credits:2,ledger:'{}, "profile":1',roster:'[]'},
    {op:'observe-text',profile:0,level:1,credits:2,ledger:'{}',roster:'[]',price:0},
    {op:'relics-text',profile:0,text:'[]'}
  ])assert.equal(dispatch(host,request).ok,false);
  assert.deepEqual([snapshot(host),snapshot(host,1)],before);
  assert.equal(send(host,'snapshot-text',{profile:2}).reason,'not-open');
});
test('eight profiles share content while capacity and restore failures preserve ownership',()=>{
  const host=create(content);
  for(let profile=0;profile<8;profile++)assert(send(host,'open',{profile,seed:profile}).ok);
  assert.equal(send(host,'open',{profile:8,seed:1}).reason,'profile-limit');
  const saved=send(host,'snapshot-text').text;assert(send(host,'close').ok);
  const bad=JSON.parse(saved);bad.content=['foreign'];
  assert.equal(send(host,'restore-text',{text:JSON.stringify(bad)}).reason,'content-mismatch');
  assert.equal(send(host,'snapshot-text').reason,'not-open');
  assert(send(host,'restore-text',{text:saved}).ok);assert.equal(send(host,'snapshot-text').text,saved);
});
test('large admitted accounts survive the actual text save and restore envelopes',()=>{
  let admitted=0;
  for(const size of [129000,130000,131000,131050]){
    const host=create(content),state=account();
    state.reliquary.items[0].payload='x'.repeat(size);
    const reply=send(host,'open-text',{seed:1,text:JSON.stringify(state)});
    if(reply.ok){
      admitted++;const saved=send(host,'snapshot-text');assert(saved.ok);
      assert(send(host,'restore-text',{profile:1,text:saved.text}).ok);
      assert.equal(snapshot(host,1).account.reliquary.items[0].payload.length,size);
    }else{assert.equal(reply.reason,'json-limit');assert.equal(send(host,'snapshot-text').reason,'not-open');}
  }
  assert(admitted>0);
});
