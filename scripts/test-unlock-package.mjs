import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {buildMemoryRewards} from './compile-memory-rewards.mjs';
import {buildProgressionGates} from './compile-progression-gates.mjs';
import {buildUnlockContent} from './compile-unlock-content.mjs';
import {readVocationFixture} from './vocation-reference.mjs';
import {checkUnlockPackageBoundaries} from './check-unlock-package-boundaries.mjs';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/unlock-package-')),consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-unlocks-'));
const run=(cwd,args)=>execFileSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024});
const npm=(cwd,args)=>run(cwd,[npmCli(),...args,'--cache',path.join(root,'.artifacts/npm-cache')]);
const data=read('baseline/unlock-lifecycle/compiled-content.json'),folders=[root];
for(const [name,builder,file]of [['memories',buildMemoryRewards,'memories.json'],['gates',buildProgressionGates,'gates.json'],['unlocks',buildUnlockContent,'unlocks.json']]){
 const folder=path.join(directory,name),pack=builder(folder),bytes=fs.readFileSync(path.join(folder,file));
 assert.equal(pack.contentId,data.packs[name].contentId);assert.equal(sha256(bytes),data.packs[name].sha256);assert.equal(bytes.length,data.packs[name].bytes);folders.push(folder);
}
const archives=folders.map(folder=>{
 const row=JSON.parse(npm(folder,['pack','--json','--ignore-scripts','--pack-destination',directory]))[0];
 assert(row.files.every(file=>!/^(baseline|reference|scripts|test|src|\.reference|node_modules)\//.test(file.path)));
 return {filename:row.filename,sha256:sha256(fs.readFileSync(path.join(directory,row.filename))),size:row.size};
});
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
npm(consumer,['install',...archives.map(row=>path.join(directory,row.filename)),'--offline','--ignore-scripts','--no-audit','--no-fund']);
const entries={'memory-rewards':'progression/memories','memory-reward-content':'progression/memory-content','unlock-lifecycle':'progression/unlocks',
 'unlock-content':'progression/unlock-content','unlock-predicates':'progression/unlock-predicates','rune-script':'presentation/runes','progression-gate-content':'progression/gate-content'};
const contracts=[];
for(const file of ['memory-rewards.test.mjs','unlock-lifecycle.test.mjs','unlock-content.test.mjs','unlock-fixture.mjs']){
 let source=fs.readFileSync(path.join(root,'test',file),'utf8');
 for(const [module,name]of Object.entries(entries))source=source.replaceAll("'../dist/"+module+".js'",JSON.stringify('@hollow-wake/engine/'+name));
 if(file==='unlock-content.test.mjs'){
  for(const name of ['unlock-content','memory-rewards','progression-gates'])source=source.replace(new RegExp("import \\{[^\\n]+\\} from '../scripts/compile-"+name+".mjs';\\r?\\n"),'');
  source="import fs from 'node:fs';\nconst packRead=(name,file)=>JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/'+name+'/'+file))));\n"+source
   .replace('unlockContentPack()',"packRead('unlocks','unlocks.json')")
   .replace('progressionGatePack()',"packRead('progression-gates','gates.json')")
   .replace('memoryRewardPack()',"packRead('memory-rewards','memories.json')");
 }
 assert(!source.includes('../dist/')&&!source.includes('../scripts/'),file+' leaked development import');
 fs.writeFileSync(path.join(consumer,file),source,{flag:'wx'});if(file.endsWith('.test.mjs'))contracts.push(file);
}
const log=run(consumer,['--test',...contracts]);assert(/(?:#|ℹ) pass 39\b/.test(log));fs.writeFileSync(path.join(directory,'contracts.txt'),log);
const original=read('baseline/unlock-lifecycle/acceptance.json').fixtures,repaired=read('baseline/unlock-lifecycle/repairs/acceptance.json').fixtures;
for(const [name,fixtures,destination]of [['policy',original,'policy.json.gz'],['transactions',repaired,'transactions.json.gz'],['memory',repaired,'expected.json.gz']]){
 readVocationFixture(name,fixtures);fs.copyFileSync(path.join(root,fixtures[name].file),path.join(consumer,destination));
}
const observations={};
for(const name of ['unlock','memory']){
 const filename=name+'-consumer.mjs';fs.copyFileSync(path.join(root,'test/fixtures',filename),path.join(consumer,filename));
 const output=run(consumer,[filename]);fs.writeFileSync(path.join(directory,name+'.txt'),output);observations[name]=JSON.parse(output);assert(observations[name].passed);
}
const report={passed:false,directory,consumer,archives,contracts:39,observations,content:data.packs};
report.boundary=await checkUnlockPackageBoundaries(report);report.passed=true;
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/unlock-package-latest.json'),report);
console.log({passed:true,directory,consumer,contracts:39,observations});
