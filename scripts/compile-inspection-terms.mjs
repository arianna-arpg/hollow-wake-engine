import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';

// Factor only complete slot families whose labels reconstruct byte for byte.
// Any future exception remains a literal dictionary entry.
export function inspectionTerms() {
  const dir=path.join(root,'baseline/item-inspection');
  const bytes=gunzipSync(fs.readFileSync(path.join(dir,'terms.json.gz')));
  assert.equal(sha256(bytes),JSON.parse(fs.readFileSync(path.join(dir,'observations.json'))).termsSha256);
  const terms=JSON.parse(bytes);
  const families=new Map();
  for(const [stat,[label,percent]] of Object.entries(terms.stats)){
    const match=/^slotgraft_([1-9]\d*)_(.+)$/.exec(stat);
    if(!match || percent)continue;
    const [,slot,id]=match,suffix=' Graft (Skill Slot '+slot+')';
    if(!label.endsWith(suffix))continue;
    const name=label.slice(0,-suffix.length);
    const family=families.get(id)??{name,slots:[]};
    if(name!==family.name)continue;
    family.slots.push(Number(slot));
    families.set(id,family);
  }
  const grafts=Object.create(null);
  for(const [id,{name,slots}] of families){
    slots.sort((a,b)=>a-b);
    if(slots.length<2 || !slots.every((s,i)=>s===i+1))continue;
    grafts[id]=[name,slots.length];
    for(const slot of slots){
      const key='slotgraft_'+slot+'_'+id;
      assert.deepEqual(terms.stats[key],[name+' Graft (Skill Slot '+slot+')',false]);
      delete terms.stats[key];
    }
  }
  return {...terms,grafts};
}
