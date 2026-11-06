import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {root,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {buildItemContent} from './compile-item-content.mjs';
import {buildSkillProgressionContent} from './compile-skill-progression.mjs';
import {buildCraftingContent} from './compile-crafting-content.mjs';
import {buildCargoPackage} from './compile-cargo-cards.mjs';
import {cargoFixtures} from './cargo-card-fixtures.mjs';
const source=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
verifyReference(source,lock);
const dir=fs.mkdtempSync(path.join(root,'.artifacts/installed-cargo-fit-'));
const consumer=path.join(dir,'consumer'),content=path.join(dir,'content');
fs.mkdirSync(consumer);buildCargoPackage(content);
const npm=(where,args)=>execFileSync(process.execPath,[npmCli(),...args,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:where,encoding:'utf8',windowsHide:true});
const pack=where=>JSON.parse(npm(where,['pack','--json','--ignore-scripts','--offline','--pack-destination',dir]))[0];
const sdk=pack(root),data=pack(content);
const archives=[sdk,data];
for(const [folder,build] of [['items',buildItemContent],['skills',buildSkillProgressionContent],['craft',buildCraftingContent]]){
  const where=path.join(dir,folder);build(where);archives.push(pack(where));
}
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
npm(consumer,['install',...archives.map(p=>path.join(dir,p.filename)),'--offline','--ignore-scripts','--no-fund','--no-audit']);
const example=JSON.parse(execFileSync(process.execPath,['node_modules/@hollow-wake/engine/examples/cargo-cards.mjs'],{cwd:consumer,encoding:'utf8'}));
assert.equal(example.title,'Firebolt Lv 1');assert(example.requirements[0].met&&example.quote.amount.count>0);
const {rows,accepted}=cargoFixtures(),roster=gunzipSync(fs.readFileSync(path.join(root,'baseline/cargo-cards/roster.json.gz')));
assert.equal(sha256(roster),accepted.files['roster.json'].sha256);
fs.writeFileSync(path.join(consumer,'roster.json'),roster);
writeJSON(path.join(consumer,'support-cases.json'),rows.filter(r=>r.item.gem?.kind==='support'&&r.view.place!=='guest-stash'));
fs.copyFileSync(path.join(root,'adapters/hollow-wake/supportRulesAdapter.ts'),path.join(consumer,'supportRulesAdapter.ts'));
fs.copyFileSync(path.join(root,'reference/replay-cargo-fit.ts'),path.join(consumer,'replay.ts'));
for(const name of ['skills','status','attackSequenceSpec']){
  const url=pathToFileURL(path.join(source,'src/engine',name+'.ts')).href;
  fs.writeFileSync(path.join(consumer,name+'.ts'),'export * from '+JSON.stringify(url)+';\n');
}
const loader=pathToFileURL(path.join(source,'node_modules/tsx/dist/loader.mjs')).href;
execFileSync(process.execPath,['--import',loader,'replay.ts',source],{cwd:consumer,stdio:'inherit',timeout:180000,windowsHide:true});
const result=JSON.parse(fs.readFileSync(path.join(consumer,'fit-result.json')));
assert(result.passed&&result.cases>1400&&result.slots>4000);assert.equal(result.crewOnly,accepted.counts.crewOnly);
verifyReference(source,lock);
const receipt={...result,sdk:sdk.integrity,data:data.integrity,installedPackages:archives.length,example:example.title,sourceCommit:lock.commit};
writeJSON(path.join(root,'.artifacts/cargo-cards-fit.json'),receipt);console.log(receipt);
writeJSON(path.join(root,'.artifacts/cargo-cards-installed-latest.json'),{dir,consumer,
  archives:Object.fromEntries(archives.map(p=>[p.filename,sha256(fs.readFileSync(path.join(dir,p.filename)))]))});
