import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
import {PouchRecall} from '@hollow-wake/engine/inventory/pouch-recall';
import {InventoryHost} from '@hollow-wake/engine/inventory/host';
import {originalPouchData,validatePouchContent} from './compile-pouch-recall.mjs';

const baseline=path.join(root,'baseline/pouch-recall');
const raw=gunzipSync(fs.readFileSync(path.join(baseline,'observations.json.gz')));
const receipt=JSON.parse(fs.readFileSync(path.join(baseline,'acceptance.json')));
assert.equal(sha256(raw),receipt.sha256);
const {defs,profiles,cases,actions}=JSON.parse(raw);
const packed=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/engine/content/pouch-recall.json'))));
assert.equal(sha256(JSON.stringify(packed)),receipt.contentSha256);
assert.equal(originalPouchData(),JSON.stringify(packed)+'\n');
assert.throws(()=>validatePouchContent({...defs,skillPool:[...defs.skillPool,defs.skillPool[0]]}),/duplicate skill pool/);
assert.throws(()=>validatePouchContent({...defs,floors:{test:{skills:['retired'],supports:[]}}}),/unknown floor skill/);
assert.throws(()=>validatePouchContent({...defs,rules:{...defs.rules,skillShare:1.01}}),/skill share/);
assert.throws(()=>validatePouchContent({...defs,supports:[{...defs.supports[0],cut:{axes:[{id:'empty',rows:[]}]}}]}),/empty cut axis/);
const rules=new PouchRecall(packed),actors=profiles.map(p=>rules.forActor(p));
assert.equal(cases.length,2304);assert.equal(actions.length,15);
for (const [i,row] of cases.entries()){
  assert.deepEqual(actors[row.profile].cut(row.unit,row.facet),{name:row.name,gem:row.gem},'cut '+i);
}
const inventory=new InventoryHost(()=>({w:1,h:1}));
const extraDir=path.join(root,'baseline/pouch-interactions');
const extraBytes=gunzipSync(fs.readFileSync(path.join(extraDir,'observations.json.gz')));
assert.equal(sha256(extraBytes),JSON.parse(fs.readFileSync(path.join(extraDir,'acceptance.json'))).sha256);
const cross=JSON.parse(extraBytes);
const hosts=cross.options.map(({all,level,weights})=>new PouchRecall({...defs,rules:{...defs.rules,tagWeights:weights}})
  .forActor({all,level,skills:cross.skills,supports:cross.supports}));
assert.equal(cross.cases.length,720);
for(const row of cross.cases)assert.deepEqual(hosts[row.profile].cut(row.unit,row.facet).gem,row.gem,cross.options[row.profile].name);
for(const a of actions){
  const original=JSON.stringify(a.before);
  const bag={items:a.before,board:{w:12,h:8},inventory,sealed:a.mode==='sealed'};
  const actor=actors[0];
  assert.deepEqual(actor.view(bag,a.uid),a.view,a.mode+' view');
  const next=actor.recall(bag,a.uid,a.group,a.item?.uid??100000,a.facet);
  assert.equal(next.ok,!!a.result,a.mode);
  if(next.ok){
    assert.deepEqual(next.result,a.result,a.mode+' reveal');
    assert.deepEqual(next.items.at(-1),a.item,a.mode+' minted item');
    assert.deepEqual(next.items.map(i=>i.uid),a.bagOrder,a.mode+' owners');
    const pouch=next.items.find(i=>i.uid===a.uid);
    assert.equal(!!pouch,a.pouchPresent);
    if(pouch)assert.deepEqual(pouch.mem,a.remaining);
    const beforeLedger=a.mode==='threshold'?{[defs.rules.dropPrefix+'firebolt']:defs.rules.threshold-1}:{};
    const writes=rules.receipts(next.result,{ledger:beforeLedger,seatLedger:{},skills:profiles[0].skills,secondary:[],
      local:true,progression:a.mode!=='immortal'});
    assert.deepEqual(writes.ledger,a.ledger,a.mode+' account');
    assert.deepEqual(writes.seatLedger,a.seatLedger,a.mode+' player');
    assert.deepEqual(writes.secondary,a.secondary,a.mode+' awakening');
    assert.equal(writes.dirty,a.dirty,a.mode+' dirty');
  }else assert.equal(next.reason,a.floats[0]??null,a.mode+' refusal');
  assert.equal(JSON.stringify(a.before),original,a.mode+' changed its source');
}
// Input snapshots cannot reprice another actor or share one player's receipts.
const access={...profiles[1],skills:[],supports:[]},actor=rules.forActor(access);
const stone={d:'skeleton_warrior',s:415};
const before=actor.cut(stone);
access.skills.push('raise_dead');access.supports.push('teeming_vein');access.all=true;
assert.deepEqual(actor.cut(stone),before);
assert.throws(()=>actor.cut({...stone,s:-1}));assert.throws(()=>actor.cut(stone,'invalid'));
const state={ledger:{},seatLedger:{},skills:[],secondary:[],local:false,progression:true};
const first=rules.receipts({id:'firebolt',rarity:'legendary'},state);
assert.deepEqual(first.skills,['firebolt']);assert.deepEqual(first.secondary,['skill:firebolt']);
assert.deepEqual(first.seatLedger,{});assert(!Object.hasOwn(first.ledger,defs.rules.lesson));
assert.deepEqual(state.ledger,{});assert.deepEqual(state.skills,[]);
const second=rules.receipts({id:'firebolt',rarity:'legendary'},{...state,...first});
assert.deepEqual(second.secondary,first.secondary);assert.equal(second.ledger[defs.rules.total],2);
const single=actions.find(a=>a.mode==='lastCell');
const masked={items:[single.before[0]],board:{w:2,h:2,open:(x,y)=>x===0&&y===0},inventory,sealed:false};
assert.deepEqual(actors[0].recall(masked,single.uid,single.group,999).items[0],{...single.item,uid:999});
console.log({originalCuts:cases.length+cross.cases.length,originalActions:actions.length,skills:defs.skills.length,
  poolSkills:defs.skillPool.length,supports:defs.supports.length,floors:Object.keys(defs.floors).length,contentSha256:receipt.contentSha256});
