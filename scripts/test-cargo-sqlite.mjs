import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {buildCargoSqlite} from './build-cargo-sqlite.mjs';
import {cargoFixtures} from './cargo-card-fixtures.mjs';

// Reuse the five tarballs verified by the installed support-gate replay.
const [flag,location,...extra]=process.argv.slice(2);
assert(flag==='--installed'&&location&&!extra.length,'First run reference:cargo-cards, then supply --installed RECEIPT');
const base=JSON.parse(fs.readFileSync(location)),hash=f=>sha256(fs.readFileSync(f));
const dir=fs.mkdtempSync(path.join(root,'.artifacts/cargo-db-consumer-')),data=path.join(dir,'package'),consumer=path.join(dir,'consumer');
const manifest=buildCargoSqlite(data);
assert.throws(()=>buildCargoSqlite(data),/new output/);
assert.equal(hash(path.join(data,'cargo-display.sqlite3')),manifest.sha256);
const npm=(where,args)=>execFileSync(process.execPath,[npmCli(),...args,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:where,encoding:'utf8',windowsHide:true});
const [packed]=JSON.parse(npm(data,['pack','--json','--offline','--ignore-scripts','--pack-destination',dir]));
fs.mkdirSync(consumer);writeJSON(path.join(consumer,'package.json'),{type:'module',private:true});
const archives=Object.entries(base.archives).map(([name,digest])=>{
  const file=path.join(base.dir,name);assert.equal(hash(file),digest);return file;
});
const archive=path.join(dir,packed.filename);
npm(consumer,['install',...archives,archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
const {rows,accepted}=cargoFixtures();
fs.writeFileSync(path.join(consumer,'items.jsonl'),rows.filter(r=>r.view.place!=='guest-stash').map(r=>JSON.stringify({
  label:r.label,item:r.item,view:{inBag:['pack','guest'].includes(r.view.place),lane:r.view.lane,attributes:r.view.attrs,confirmMemorySale:r.view.confirm},
  fit:r.values?.fit?.map(s=>({slot:s.slot,skillId:s.id,fits:s.fits,sockets:s.sockets,occupied:s.occupied}))??[],
})).join('\n'));
fs.copyFileSync(path.join(root,'reference/installed-cargo-sqlite.mjs'),path.join(consumer,'run.mjs'));
execFileSync(process.execPath,['run.mjs'],{cwd:consumer,stdio:'inherit',windowsHide:true,timeout:120000});
const result=JSON.parse(fs.readFileSync(path.join(consumer,'result.json')));
assert.equal(result.cards,accepted.counts.accepted);assert.equal(result.unknown,2);assert.equal(result.sha256,manifest.sha256);
const receipt={passed:true,...result,counts:manifest.counts,bytes:manifest.bytes,pageAtlasSha256:manifest.pageAtlasSha256,
  package:packed.filename,archiveSha256:hash(archive),baseArchives:base.archives};
writeJSON(path.join(root,'.artifacts/cargo-sqlite-verified.json'),receipt);
writeJSON(path.join(root,'.artifacts/cargo-sqlite-installed-latest.json'),{dir,archive,consumer});
console.log({cards:receipt.cards,unknown:receipt.unknown,bytes:receipt.bytes,archive:packed.filename});
