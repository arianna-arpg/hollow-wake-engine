import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {root,sha256} from './reference-utils.mjs';

// Validate mechanics at authoring time so a recall can read ordered rows
// directly. Reordering these rows changes seeded results.
export function validatePouchContent(p){
  const word=(v,label)=>assert(typeof v==='string'&&v.length>0,label);
  const weight=(v,label)=>assert(Number.isFinite(v)&&v>=0,label);
  const strings=(rows,label)=>{
    assert(Array.isArray(rows),label);
    for(const id of rows)word(id,label);
    assert.equal(new Set(rows).size,rows.length,'duplicate '+label);
    return new Set(rows);
  };
  const refs=(ids,definitions,label)=>{for(const id of strings(ids,label))assert(definitions.has(id),'unknown '+label+' '+id);};
  const skills=strings(p.skills.map(s=>s.id),'skill'),supports=strings(p.supports.map(s=>s.id),'support');
  for(const d of [...p.skills,...p.supports]){
    word(d.name,d.id);word(d.color,d.id);weight(d.weight,d.id);
    assert(Number.isSafeInteger(d.min)&&d.min>=0,d.id);
    assert(Array.isArray(d.tags)&&d.tags.every(t=>typeof t==='string'),d.id);
  }
  for(const s of p.supports)if(s.cut){
    strings(s.cut.axes.map(a=>a.id),'axis '+s.id);
    for(const a of s.cut.axes){
      assert(a.rows.length,'empty cut axis '+s.id);
      strings(a.rows.map(row=>row.id),'cut row '+s.id);
      for(const row of a.rows)weight(row.weight,row.id);
    }
  }
  refs(p.skillPool,skills,'skill pool');refs(p.supportPool,supports,'support pool');
  refs(p.starters,skills,'starter');
  assert(p.skills.some(s=>!s.noDrop&&p.starters.includes(s.id)&&p.skillPool.includes(s.id)),'no starter fallback');
  for(const floor of Object.values(p.floors)){
    refs(floor.skills,skills,'floor skill');refs(floor.supports,supports,'floor support');
  }
  strings(p.facets.map(f=>f.id),'facet');
  for(const facet of p.facets){
    const attrs=strings(facet.attrs.map(a=>a.id),'facet attribute');
    assert(attrs.has(facet.id),'facet lead missing');
  }
  const rarities=new Set(Object.keys(p.rarities));
  assert(rarities.has('common'),'missing common rarity');
  for(const row of Object.values(p.rarities)){
    weight(row.weight,'rarity weight');assert(Number.isSafeInteger(row.sockets)&&row.sockets>0&&row.sockets<=1024,'socket count');
  }
  const r=p.rules;
  assert(Number.isFinite(r.skillShare)&&r.skillShare>=0&&r.skillShare<=1,'skill share');
  for(const n of [r.biasMult,r.kitMult,r.floorMult,...Object.values(r.tagWeights)])weight(n,'drop multiplier');
  for(const [id,n] of Object.entries(r.boss)){assert(rarities.has(id),'unknown boss rarity');weight(n,id);}
  for(const id of rarities)assert(Object.hasOwn(r.boss,id),'missing boss rarity '+id);
  for(const table of Object.values(r.tiers))for(const [id,n] of Object.entries(table)){assert(rarities.has(id),'unknown tier rarity');weight(n,id);}
  for(const key of ['lesson','dropPrefix','total','legendary'])word(r[key],key);
  return p;
}

export function originalPouchData(){
  const dir=path.join(root,'baseline/pouch-recall');
  const raw=gunzipSync(fs.readFileSync(path.join(dir,'observations.json.gz')));
  const receipt=JSON.parse(fs.readFileSync(path.join(dir,'acceptance.json')));
  assert.equal(sha256(raw),receipt.sha256);
  const {defs}=JSON.parse(raw);
  validatePouchContent(defs);
  const text=JSON.stringify(defs);
  assert.equal(sha256(text),receipt.contentSha256);
  return text+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [mode,filename,...rest]=process.argv.slice(2);
  assert(!rest.length,'unexpected arguments');
  if(mode==='--out'&&filename)fs.writeFileSync(filename,originalPouchData(),{flag:'wx'});
  else if(mode==='--validate'&&filename)validatePouchContent(JSON.parse(fs.readFileSync(filename)));
  else{
    assert(!mode,'use --out NEW_FILE or --validate FILE');
    assert.equal(fs.readFileSync(path.join(root,'content/pouch-recall.json'),'utf8').replaceAll('\r\n','\n'),originalPouchData());
  }
  console.log('Pouch content verified');
}
