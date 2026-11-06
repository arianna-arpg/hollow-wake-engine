import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {CargoInspector,CargoAtlas} from '@hollow-wake/engine/inventory/cargo-cards';
import {ItemContent} from '@hollow-wake/engine/items';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {itemPack} from './compile-item-content.mjs';
import {craftingPack} from './compile-crafting-content.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';
import {cargoAtlas} from './compile-cargo-cards.mjs';
import {cargoFixtures} from './cargo-card-fixtures.mjs';

import {verifyFace} from './cargo-card-observer.mjs';

function run(){
  const {rows,accepted}=cargoFixtures(),items=new ItemContent(itemPack());
  const craft=new CraftingContent(craftingPack(items),items),skills=new SkillProgression(skillProgressionPack());
  const {manifest,data}=cargoAtlas(skills.pack.contentId,craft.pack.contentId);
  const atlas=new CargoAtlas(manifest,(_index,r)=>{
    const bytes=data.subarray(r.offset,r.offset+r.length);assert.equal(sha256(bytes),r.sha256);return bytes.toString();
  });
  const inspector=new CargoInspector(skills,craft,atlas.config),essences=new Map(craft.pack.essences.map(e=>[e.id,e]));
  let visible=0,unknown=0,foreign=0,maxRefs=0;
  for(const r of rows){
    if(r.view.place==='guest-stash'){assert.equal(r.card,null);foreign++;continue;} // Host inventory lookup refused this UID.
    const refs=inspector.references(r.item),planned=new Set(refs.map(q=>q.table+'/'+q.id)),used=new Set();
    assert.equal(refs.length,planned.size);maxRefs=Math.max(maxRefs,refs.length);
    const read=q=>{const key=q.table+'/'+q.id;assert(planned.has(key));used.add(key);return atlas.read(q);};
    const context={inBag:['pack','guest'].includes(r.view.place),attributes:r.view.attrs,lane:r.view.lane,confirmMemorySale:r.view.confirm};
    const state=JSON.stringify([r.item,context]);
    // A separate live-game replay below the reference gate verifies the SDK
    // support policy. Here the recorded host verdicts isolate presentation.
    const card=inspector.inspect(r.item,context,read,g=>{
      assert.deepEqual(g,r.item.gem);
      return r.values.fit.map(({slot,id,fits,sockets,occupied})=>({slot,skillId:id,fits,sockets,occupied}));
    });
    assert.equal(JSON.stringify([r.item,context]),state);assert.deepEqual(used,planned);
    if(!r.card){assert.equal(card,null);unknown++;continue;}
    verifyFace(r,card,essences);visible++;
  }
  const first=rows.find(r=>r.item.gem?.kind==='support').item;
  const a=inspector.inspect(first,{},atlas.read);assert.equal(a.compatibility,null);
  assert.deepEqual(inspector.inspect(first,{},atlas.read,()=>[]).compatibility,[]);
  const malicious=inspector.inspect(first,{},atlas.read,g=>{g.level=99;g.supportId='other';return [];});
  assert.equal(malicious.title,a.title);assert.equal(first.gem.level,1);
  assert.throws(()=>inspector.inspect(first,{},atlas.read,()=>[{slot:1,fits:true,skillId:'ruin',sockets:1,occupied:2}]),/invalid-integer/);
  assert.throws(()=>inspector.references({...first,mem:[]}),/ambiguous-cargo/);
  assert.throws(()=>inspector.references({baseId:'rough_memory',mem:[]}),/empty-memory/);
  assert.throws(()=>inspector.references({get gem(){throw Error('getter ran');}}),/invalid-property/);
  assert.throws(()=>new CargoInspector(skills,craft,{...atlas.config,skillContentId:'wrong'}),/content-mismatch/);
  const bad=structuredClone(manifest);bad.pages[1].offset++;
  assert.throws(()=>new CargoAtlas(bad,()=>''),/invalid-page-range/);
  const firebolt=rows.find(r=>r.label==='skill/firebolt/legendary').item;
  const ref=inspector.references(firebolt)[0];let corrupt=true,loads=0;
  const retry=new CargoAtlas(manifest,(_,range)=>{
    loads++;return corrupt?'?':data.subarray(range.offset,range.offset+range.length).toString();
  });
  assert.throws(()=>retry.read(ref),/invalid-display-json/);
  corrupt=false;
  const detached=retry.read(ref);detached.description='changed';detached.tags.length=0;
  assert.notEqual(retry.read(ref).description,'changed');assert(retry.read(ref).tags.length);assert.equal(loads,2);
  const unknownHero=inspector.inspect(firebolt,{},retry.read);
  assert(unknownHero.requirements.length>0&&unknownHero.requirements.every(r=>r.met===null));
  assert(inspector.inspect(firebolt,{attributes:{intelligence:0}},retry.read).requirements.some(r=>r.met===false));
  assert(inspector.inspect(firebolt,{attributes:{intelligence:100}},retry.read).requirements.every(r=>r.met));
  assert.equal(visible,accepted.counts.accepted);assert.equal(visible+unknown+foreign,accepted.counts.cases);
  const refs=manifest.pages.slice(0,5).map((range,page)=>({table:'skills',page,id:Object.keys(JSON.parse(data.subarray(range.offset,range.offset+range.length)).skills)[0]}));
  for(const [capacity,expected] of [[1,8],[4,6]]){
    let reads=0;const cache=new CargoAtlas(manifest,(_,range)=>{reads++;return data.subarray(range.offset,range.offset+range.length).toString();},capacity);
    for(const page of [0,1,2,3,0,4,1,0])cache.read(refs[page]);
    assert.equal(reads,expected,'least-recently used eviction at capacity '+capacity);
  }
  for(const bad of [0,5,1.5])assert.throws(()=>new CargoAtlas(manifest,()=>'',bad),/invalid-integer/);
  const result={passed:true,visible,unknown,foreign,maxRefs,pageCount:manifest.pages.length,totalBytes:manifest.bytes,
    largestPage:Math.max(...manifest.pages.map(p=>p.length)),sha256:manifest.sha256,originalCards:accepted.files['cards.jsonl'].sha256};
  writeJSON(path.join(root,'.artifacts/cargo-cards-verification.json'),result);console.log(result);
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)run();
