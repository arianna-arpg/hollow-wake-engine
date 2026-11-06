import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {ItemContent} from '@hollow-wake/engine/items';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {CargoAtlas,CargoInspector} from '@hollow-wake/engine/inventory/cargo-cards';
import {root,sha256} from './reference-utils.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';
import {craftingPack} from './compile-crafting-content.mjs';
import {itemPack} from './compile-item-content.mjs';
import {cargoAtlas} from './compile-cargo-cards.mjs';
import {cargoFixtures} from './cargo-card-fixtures.mjs';
import {writeCargoDatabase} from './build-cargo-sqlite.mjs';

const [out,...rest]=process.argv.slice(2);
assert(out&&!rest.length&&!fs.existsSync(out),'Supply a new benchmark report path');
const dir=fs.mkdtempSync(path.join(root,'.artifacts/cargo-storage-'));
const flatFile=path.join(dir,'catalog.json'),pagedFile=path.join(dir,'cargo-pages.txt'),sqlFile=path.join(dir,'catalog.sqlite3');
const items=new ItemContent(itemPack()),craft=new CraftingContent(craftingPack(items),items),skills=new SkillProgression(skillProgressionPack());
function prepareFiles(){
  const {manifest,data}=cargoAtlas(skills.pack.contentId,craft.pack.contentId);
  const all={skills:Object.create(null),supports:Object.create(null),monsters:Object.create(null)};
  for(const r of manifest.pages){
    const page=JSON.parse(data.subarray(r.offset,r.offset+r.length));
    for(const k of Object.keys(all))Object.assign(all[k],page[k]);
  }
  fs.writeFileSync(flatFile,JSON.stringify(all));fs.writeFileSync(pagedFile,data);
  writeCargoDatabase(sqlFile,all);
  return manifest;
}
const manifest=prepareFiles();
const inspector=new CargoInspector(skills,craft,manifest.config);
const digest=file=>sha256(fs.readFileSync(file)),flatDigest=digest(flatFile),sqlDigest=digest(sqlFile);
const readers={
  eager(){
    const bytes=fs.readFileSync(flatFile);assert.equal(sha256(bytes),flatDigest);const tables=JSON.parse(bytes);
    return {read:q=>Object.hasOwn(tables[q.table],q.id)?tables[q.table][q.id]:null,close(){},io:()=>({appBytes:bytes.length})};
  },
  paged1(){return makePaged(1);},
  paged4(){return makePaged(4);},
  sqlite(){return makeSqlite(false);},
  sqliteSnapshot(){return makeSqlite(true);},
};
function makeSqlite(snapshot){
  assert.equal(digest(sqlFile),sqlDigest);
  const db=new DatabaseSync(sqlFile,{readOnly:true});
  // A shipped immutable catalogue can keep its read transaction open. This
  // avoids taking and releasing the file lock for each individual lookup.
  if(snapshot)db.exec('BEGIN');
  const stmt=db.prepare('SELECT payload FROM faces WHERE kind=? AND id=?');
  let selects=0;
  return {read:q=>{selects++;const row=stmt.get(q.table,q.id);return row?JSON.parse(row.payload):null;},
    close:()=>db.close(),io:()=>({selects})};
}
function makePaged(capacity){
    const fd=fs.openSync(pagedFile,'r');let bytesRead=0,reads=0;
    const atlas=new CargoAtlas(manifest,(_,range)=>{
      const b=Buffer.allocUnsafe(range.length);assert.equal(fs.readSync(fd,b,0,b.length,range.offset),b.length);assert.equal(sha256(b),range.sha256);
      bytesRead+=b.length;reads++;return b.toString();
    },capacity);
    return {read:atlas.read,close:()=>fs.closeSync(fd),io:()=>({appBytes:bytesRead,pageReads:reads})};
}
const demo=JSON.parse(fs.readFileSync(path.join(root,'examples/godot-inventory/cargo-sample.json')));
const schedule={same:[demo[1]],bag:demo,catalog:cargoFixtures().rows.filter(r=>r.label.startsWith('skill/')&&r.label.endsWith('/common')).map(r=>r.item)};
const context={inBag:true,lane:'sell',confirmMemorySale:true};
// Prove identical full answers for every measured item before timing anything.
const check=Object.values(readers).map(make=>make());
try{for(const item of [...demo,...schedule.catalog]){
  const expected=inspector.inspect(item,context,check[0].read);
  for(const api of check.slice(1))assert.deepEqual(inspector.inspect(item,context,api.read),expected);
}}finally{for(const api of check)api.close();}
const implementations=Object.keys(readers),runs=Object.fromEntries(implementations.map(k=>[k,[]]));
const queries=2048,rounds=7;
for(let round=0;round<rounds;round++)for(let j=0;j<implementations.length;j++){
  const kind=implementations[(round+j)%implementations.length];
  const start=performance.now(),api=readers[kind]();
  try{
    const first=inspector.inspect(demo[1],context,api.read);assert(first?.kind==='skill');
    const observation={firstCardUs:(performance.now()-start)*1000,firstIO:api.io(),workloads:{}};
    for(const [workload,sequence] of Object.entries(schedule)){
      const startIO=api.io(),t=performance.now();let checksum=0;
      for(let i=0;i<queries;i++){
        const id=workload==='catalog'?(i*97)%sequence.length:i%sequence.length;
        const card=inspector.inspect(sequence[id],context,api.read);
        checksum+=card.title.length+card.lines.length;
      }
      const elapsed=performance.now()-t,endIO=api.io();
      observation.workloads[workload]={usPerQuery:elapsed*1000/queries,checksum,
        io:Object.fromEntries(Object.entries(endIO).map(([k,n])=>[k,n-startIO[k]]))};
    }
    runs[kind].push(observation);
  }finally{api.close();}
}
const median=rows=>[...rows].sort((a,b)=>a-b)[Math.floor(rows.length/2)],summary={};
for(const kind of implementations){
  const rows=runs[kind];summary[kind]={firstCardUs:median(rows.map(r=>r.firstCardUs))};
  for(const workload of Object.keys(schedule)){
    for(const r of rows)assert.equal(r.workloads[workload].checksum,runs.eager[0].workloads[workload].checksum);
    summary[kind][workload]=median(rows.map(r=>r.workloads[workload].usPerQuery));
  }
}
const report={schemaVersion:1,platform:process.platform,arch:process.arch,node:process.version,cpu:os.cpus()[0]?.model,
  termsSha256:manifest.sha256,fileBytes:{eager:fs.statSync(flatFile).size,paged:manifest.bytes,sqlite:fs.statSync(sqlFile).size},
  rounds,queries,summary,runs,scope:'Warm OS file cache on one development host. First card includes opening and integrity checks. Eager and SQLite verify their complete file; paged verifies touched ranges. Subsequent times include a full detached card query. SQLite page-cache reads are internal and not counted. Actor rules were initialized before timing.'};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log({fileBytes:report.fileBytes,summary});
