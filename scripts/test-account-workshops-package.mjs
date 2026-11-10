import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {packs,baseline} from '../test/shared-account/fixtures.mjs';

const args=process.argv.slice(2);
assert(args.length===0||args.length===2&&args[0]==='--output');
const output=path.resolve(args[1]??path.join(root,'.artifacts/account-workshops-package-latest.json'));
if(args.length)assert(!fs.existsSync(output)&&!fs.existsSync(output+'.logs.json.gz'));
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'account-workshops-package-'));
const consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const logs={},report={passed:false,contracts:33,sourceScenarios:10,sourceSteps:30,faults:[],sources:{}};
const sources=['src/account-workshop-session.ts','test/shared-account.test.mjs','test/shared-account/contracts.mjs',
  'test/shared-account-prepare.test.mjs','test/shared-account/prepared-contracts.mjs',
  'test/shared-account/fixtures.mjs','scripts/test-account-workshops-package.mjs','package.json',
  'baseline/shared-account/admitted-socket/acceptance.json'];
for(const file of sources)report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{
  const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:16*1024*1024,
    env:{...process.env,TEMP:work,TMP:work,TMPDIR:work}});
  logs[label]=(result.stdout??'')+'\n'+(result.stderr??'');
  assert(!result.error&&!result.signal,label+' process error: '+result.error);
  return {status:result.status,assertion:/ERR_ASSERTION|AssertionError/.test(logs[label]),logSha256:sha256(logs[label])};
};
const success=(label,args,cwd)=>{const result=run(label,args,cwd);assert.equal(result.status,0,logs[label]);return result;};
const npm=(label,args,cwd)=>success(label,[npmCli(),...args,'--cache',path.join(work,'npm-cache')],cwd);
const verify=(label,file='contracts.test.mjs')=>{
  const result=success(label,['--test',file]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[label]),logs[label]);return result;
};
try{
  npm('pack',['pack','--json','--ignore-scripts','--pack-destination',work],root);
  const packed=JSON.parse(logs.pack.trim())[0],archive=path.join(work,packed.filename);
  assert(packed.files.every(file=>!/^(baseline|reference|scripts|test|src|\.reference|node_modules)\//.test(file.path)));
  report.archiveSha256=sha256(fs.readFileSync(archive));
  fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
  npm('install',['install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund'],consumer);
  fs.writeFileSync(path.join(consumer,'content.json'),JSON.stringify(packs));
  fs.writeFileSync(path.join(consumer,'baseline.json'),JSON.stringify(baseline));
  const entries={'account-workshop-session':'account/workshops','item-rules':'items',
    'crafting-content':'crafting/content','skill-progression':'skills/progression','equipment-actions':'inventory/equipment'};
  let fixtures=fs.readFileSync(path.join(root,'test/shared-account/fixtures.mjs'),'utf8');
  fixtures=fixtures.slice(fixtures.indexOf('export function definitionsFrom'),fixtures.indexOf('const compressed='));
  const header="import fs from 'node:fs';\n"+
    "import {ItemContent} from '@hollow-wake/engine/items';\n"+
    "import {CraftingContent} from '@hollow-wake/engine/crafting/content';\n"+
    "import {SkillProgression} from '@hollow-wake/engine/skills/progression';\n"+
    "import {EquipmentSlots} from '@hollow-wake/engine/inventory/equipment';\n"+
    "const packs=JSON.parse(fs.readFileSync(new URL('./content.json',import.meta.url)));\n"+
    "export const baseline=JSON.parse(fs.readFileSync(new URL('./baseline.json',import.meta.url)));\n";
  fixtures=header+fixtures+'\nexport const definitions=definitionsFrom(packs);\n';
  fs.writeFileSync(path.join(consumer,'fixtures.mjs'),fixtures);
  fs.copyFileSync(path.join(root,'test/shared-account/contracts.mjs'),path.join(consumer,'contracts.mjs'));
  fs.copyFileSync(path.join(root,'test/shared-account/prepared-contracts.mjs'),path.join(consumer,'prepared-contracts.mjs'));
  const test="import test from 'node:test';\nimport {AccountWorkshopSession} from '@hollow-wake/engine/account/workshops';\n"+
    "import {baseline,definitions} from './fixtures.mjs';\nimport {contracts} from './contracts.mjs';\n"+
    "import {preparedContracts} from './prepared-contracts.mjs';\n"+
    "contracts(test,{AccountWorkshopSession,baseline,definitions});\npreparedContracts(test,{AccountWorkshopSession,baseline,definitions});\n";
  fs.writeFileSync(path.join(consumer,'contracts.test.mjs'),test);
  report.installed=verify('installed');
  fs.writeFileSync(path.join(consumer,'browser.mjs'),Object.values(entries).map(e=>"export * from '@hollow-wake/engine/"+e+"';").join('\n'));
  const bundled=await build({entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',
    minify:true,metafile:true,write:false});
  assert(Object.keys(bundled.metafile.inputs).every(file=>!/[\\/](?:\.reference|content)[\\/]/.test(file)));
  report.browserBytes=bundled.outputFiles[0].contents.length;assert(report.browserBytes<180*1024,'Browser code exceeds 180 KiB');
  fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundled.outputFiles[0].contents);
  const browserSource=text=>Object.values(entries).reduce((text,e)=>text.replaceAll("'@hollow-wake/engine/"+e+"'","'./browser-built.mjs'"),text);
  fs.writeFileSync(path.join(consumer,'browser-fixtures.mjs'),browserSource(fixtures));
  fs.writeFileSync(path.join(consumer,'browser-contracts.mjs'),browserSource(test).replace("'./fixtures.mjs'","'./browser-fixtures.mjs'"));
  fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw new Error('ambient random')};"+
    "globalThis.fetch=()=>{throw new Error('network')};for(const key of ['window','document','localStorage'])"+
    "Object.defineProperty(globalThis,key,{get(){throw new Error(key)}});await import('./browser-contracts.mjs');");
  report.browser=verify('browser','hostile.test.mjs');
  fs.writeFileSync(path.join(consumer,'types.ts'),"import {AccountWorkshopSession,type AccountWorkshopDefinitions,type AccountWorkshopLimits}"+
    " from '@hollow-wake/engine/account/workshops';declare const definitions:AccountWorkshopDefinitions;"+
    "const limits:AccountWorkshopLimits={accounts:2,workshops:4};const sdk=new AccountWorkshopSession(definitions,limits);"+
    "const reply:unknown=sdk.command({op:'open-account',account:1,key:'account',seed:17});void reply;");
  report.types=success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);
  const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/account-workshop-session.js'),original=fs.readFileSync(module,'utf8');
  const faults=[
    ['detached-lore','craftLore: shared.craftLore','craftLore: account.craftLore'],
    ['detached-ledger','ledger: shared.ledger','ledger: oldShared.ledger'],
    ['stale-feature','features: state.features','features: []'],
    ['ignore-sealed','progression };','progression: true };'],
    ['drop-key-check',"need(saved.accountKey === account.key, 'account-mismatch');",'void saved.accountKey;'],
    ['drop-duplicate-key',"need(!this.#keys.has(key), 'duplicate-account-key');",'void key;'],
    ['allow-close-bound',"need(![...this.#workshops.values()].some(row => row.account === request.account), 'account-in-use');",'void account;'],
    ['lose-opaque-extra','extra: account.extra','extra: {}'],
    ['drop-account-publication','this.#accounts.set(workshop.account, nextAccount);','void nextAccount;'],
    ['drop-inventory-publication','replacements.set(request.profile, nextWorkshop);','void nextWorkshop;'],
    ['skip-bound-inventory-admission','this.#checkBindings(request.account, next, replacements);','void next;'],
    ['default-null-context','request.progression === undefined ? true : request.progression','request.progression ?? true'],
    ['erase-null-host-data','request.extra === undefined ? {} : request.extra','request.extra ?? {}'],
    ['default-null-item-id','integer(request.nextUid, 1);','void request.nextUid;'],
    ['premature-publication','finally {\n            this.#state = committed;\n        }\n    }\n    #preparedCommand',
      'finally {\n            void committed;\n        }\n    }\n    #preparedCommand'],
    ['lost-publication',"if (request.op === 'commit-prepared')\n            this.#state = pending.state;",'void pending.state;'],
    ['abort-publishes',"if (request.op === 'commit-prepared')\n            this.#state = pending.state;",'this.#state = pending.state;'],
    ['stale-token',"need(request.token === pending.token, 'stale-prepared-change');",'void request.token;'],
    ['pending-edit',"if (this.#prepared && !['account-save', 'workshop-save', 'account-relic-items', 'active-workshop'].includes(request.op))",'if (false)'],
    ['excess-records',"need(writes.length <= 8, 'prepared-record-limit');","need(writes.length <= 9, 'prepared-record-limit');"],
    ['failed-batch-publishes','finally {\n            this.#state = committed;\n        }\n    }\n    #preparedCommand',
      'finally {\n            if(this.#prepared)this.#state = committed;\n        }\n    }\n    #preparedCommand'],
    ['committed-candidate','this.#state = pending.state;\n                return this.#command','void pending.state;\n                return this.#command'],
    ['borrowed-prepared-response','const reply = copySessionJSON({ ok: true, token, writes, replies });','const reply = { ok: true, token, writes, replies };'],
    ['equipment-early-view','let state = this.#state;','let state = this.#prepared?.state ?? this.#state;'],
    ['equipment-committed-candidate','\n                state = pending.state;','\n                state = this.#state;'],
    ['equipment-stale-token',"need(pending.token === request.token, 'stale-prepared-change');",'void request.token;'],
  ];
  for(const[name,needle,replacement]of faults){
    assert.equal(original.split(needle).length,2,name+' needs one target');
    fs.writeFileSync(module,original.replace(needle,replacement));
    try{
      const result=run('fault-'+name,['--test','contracts.test.mjs']);
      assert.equal(result.status,1,name+' escaped');assert(result.assertion,name+' failed outside behavior assertion: '+logs['fault-'+name]);
      report.faults.push({name,...result});
    }finally{fs.writeFileSync(module,original);}
  }
  assert.equal(fs.readFileSync(module,'utf8'),original);
  report.restored=verify('restored');
  report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
  for(const[file,hash]of Object.entries(report.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file+' changed during qualification');
  const compressed=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(output+'.logs.json.gz',compressed);
  report.logsSha256=sha256(compressed);
  assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));
  fs.rmSync(work,{recursive:true,force:true});report.cleaned=true;
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
}
console.log({passed:report.passed,contracts:report.contracts,faults:report.faults.length,browserBytes:report.browserBytes,cleaned:report.cleaned});
