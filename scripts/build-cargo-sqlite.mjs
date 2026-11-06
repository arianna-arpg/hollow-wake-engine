import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {cargoAtlas} from './compile-cargo-cards.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';
import {craftingPack} from './compile-crafting-content.mjs';

export function writeCargoDatabase(file,tables){
  // Only an exclusively created file in the caller's fresh staging directory.
  fs.closeSync(fs.openSync(file,'wx'));
  const db=new DatabaseSync(file);
  try{
    db.exec('CREATE TABLE faces (kind TEXT, id TEXT, payload TEXT NOT NULL, PRIMARY KEY(kind,id)) WITHOUT ROWID; BEGIN');
    const put=db.prepare('INSERT INTO faces VALUES(?,?,?)');
    for(const [kind,rows] of Object.entries(tables))for(const [id,row] of Object.entries(rows))put.run(kind,id,JSON.stringify(row));
    db.exec('COMMIT; VACUUM');
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{db.close();}
}
export function buildCargoSqlite(destination){
  const target=path.resolve(destination);assert(!fs.existsSync(target),'Choose a new output directory');
  const parent=path.dirname(target);fs.mkdirSync(parent,{recursive:true});
  const stage=fs.mkdtempSync(path.join(parent,'.cargo-sqlite-'));
  const {manifest,data}=cargoAtlas(skillProgressionPack().contentId,craftingPack().contentId);
  const tables={skills:Object.create(null),supports:Object.create(null),monsters:Object.create(null)};
  for(const r of manifest.pages){
    const part=data.subarray(r.offset,r.offset+r.length);assert.equal(sha256(part),r.sha256);
    const page=JSON.parse(part);
    for(const key of Object.keys(tables))Object.assign(tables[key],page[key]);
  }
  const file=path.join(stage,'cargo-display.sqlite3');writeCargoDatabase(file,tables);
  const catalog={format:'cargo-sqlite/v1',config:manifest.config,pageAtlasSha256:manifest.sha256,
    bytes:fs.statSync(file).size,sha256:sha256(fs.readFileSync(file)),
    counts:Object.fromEntries(Object.entries(tables).map(([id,rows])=>[id,Object.keys(rows).length]))};
  writeJSON(path.join(stage,'catalog.json'),catalog);
  for(const name of ['cargo-reader.mjs','cargo-reader.d.ts'])fs.copyFileSync(path.join(root,'adapters/sqlite',name),path.join(stage,name));
  for(const name of ['LICENSE.md','NOTICE.md'])fs.copyFileSync(path.join(root,name),path.join(stage,name));
  writeJSON(path.join(stage,'package.json'),{name:'@hollow-wake/cargo-sqlite',version:'0.1.0',type:'module',private:true,
    license:'PolyForm-Noncommercial-1.0.0',engines:{node:'>=24'},files:['cargo-display.sqlite3','catalog.json','cargo-reader.mjs','cargo-reader.d.ts','LICENSE.md','NOTICE.md'],
    exports:{'.':{types:'./cargo-reader.d.ts',import:'./cargo-reader.mjs'},'./catalog.json':'./catalog.json','./cargo-display.sqlite3':'./cargo-display.sqlite3'}});
  // An interrupted build can only leave its private staging directory.
  assert(!fs.existsSync(target),'Output directory already exists');fs.renameSync(stage,target);return catalog;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  assert.equal(process.argv.length,3,'Supply a new output directory');console.log(buildCargoSqlite(process.argv[2]));
}
