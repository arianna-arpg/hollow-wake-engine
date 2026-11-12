import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
import {build} from 'esbuild';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {itemPack} from './compile-item-content.mjs';
import {craftingPack} from './compile-crafting-content.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';
export const craftingImports={'crafting-session':'crafting/session','crafting-content':'crafting/content','item-rules':'items','skill-progression':'skills/progression','random':'random','workshop-skill-book':'skills/workshop-book'};
export function craftingConsumerSource(){
 let source=fs.readFileSync(path.join(root,'test/crafting-session.test.mjs'),'utf8');
 for(const[file,entry]of Object.entries(craftingImports))source=source.replaceAll("'../dist/"+file+".js'","'@hollow-wake/engine/"+entry+"'");
 return source.replaceAll(/'\.\.\/scripts\/compile-(item-content|crafting-content|skill-progression)\.mjs'/g,"'./fixtures.mjs'")
  .replace("import formatSaves from '../baseline/crafting-session-formats/saves.json' with {type:'json'};","import {formatSaves} from './fixtures.mjs';")
  .replaceAll("'@hollow-wake/engine/random'","'./random.mjs'");
}
export const craftingConsumerRandom=`export class Random{constructor(seed){this.s=seed||0x9e3779b9;this.draws=0}next(){this.s=(this.s+0x6d2b79f5)>>>0;let n=this.s;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);this.draws++;return((n^(n>>>14))>>>0)/4294967296}snapshot(){return{algorithm:'mulberry32/v1',state:this.s,draws:this.draws}}static restore(s){const r=new Random(1);r.s=s.state;r.draws=s.draws;return r}}`;
export async function verifyCraftingSessionPackage({withFaults=false}={}){
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/crafting-session-package-owned-')),consumer=path.join(directory,'consumer');
const logs={},report={passed:false,contracts:22,faults:[],sources:{}};
const owned=fs.realpathSync(path.join(root,'.artifacts'));
try{
fs.mkdirSync(consumer);
const run=(cwd,args)=>{const output=execFileSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024,env:{...process.env,TEMP:directory,TMP:directory,TMPDIR:directory,NODE_COMPILE_CACHE:path.join(directory,'compile-cache')}});logs['run-'+Object.keys(logs).length]={args,output};return output;};
for(const f of ['scripts/crafting-session-package-check.mjs','scripts/test-crafting-session-package.mjs','scripts/test-crafting-session-faults.mjs','src/crafting-session.ts','src/crafting-session-core.ts','src/crafting-session-data.ts','test/crafting-session.test.mjs','baseline/crafting-session-formats/saves.json','package.json','package-lock.json'])report.sources[f]=sha256(fs.readFileSync(path.join(root,f)));
const npm=(cwd,args)=>run(cwd,[npmCli(),...args,'--cache',path.join(directory,'npm-cache')]);
const packed=JSON.parse(npm(root,['pack','--json','--ignore-scripts','--pack-destination',directory]))[0];
assert(packed.files.every(file=>!/^(baseline|reference|scripts|test|src|\.reference|node_modules)\//.test(file.path)));
const archive=path.join(directory,packed.filename);
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
npm(consumer,['install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
const packs={items:itemPack(),crafting:craftingPack(),skills:skillProgressionPack()},formatSaves=JSON.parse(fs.readFileSync(path.join(root,'baseline/crafting-session-formats/saves.json')));
writeJSON(path.join(consumer,'content.json'),packs);
fs.writeFileSync(path.join(consumer,'fixtures.mjs'),`import fs from 'node:fs';const content=JSON.parse(fs.readFileSync(new URL('./content.json',import.meta.url)));
export const itemPack=()=>content.items,craftingPack=()=>content.crafting,skillProgressionPack=()=>content.skills;export const formatSaves=${JSON.stringify(formatSaves)};`);
const imports=craftingImports,source=fs.readFileSync(path.join(root,'test/crafting-session.test.mjs'),'utf8'),installed=craftingConsumerSource();
assert(!installed.includes('../dist/')&&!installed.includes('../scripts/')&&!installed.includes('../baseline/'));
fs.writeFileSync(path.join(consumer,'crafting-session.test.mjs'),installed);fs.writeFileSync(path.join(consumer,'random.mjs'),craftingConsumerRandom);
const contracts=run(consumer,['--test','crafting-session.test.mjs']);assert(/(?:#|ℹ) pass 22\b/.test(contracts));fs.writeFileSync(path.join(directory,'contracts.txt'),contracts);
const entry=path.join(consumer,'browser.mjs');
fs.writeFileSync(entry,Object.values(imports).filter(v=>v!=='random').map(v=>`export * from '@hollow-wake/engine/${v}';`).join('\n'));
const bundle=await build({entryPoints:[entry],bundle:true,platform:'browser',format:'esm',write:false,metafile:true,minify:true});
assert(!Object.keys(bundle.metafile.inputs).some(file=>/\.reference|\/content\//.test(file)));
assert(bundle.outputFiles[0].contents.length<=100*1024,'Crafting session browser bundle exceeded 100 KiB');
fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);
let browser=installed;for(const v of Object.values(imports).filter(v=>v!=='random'))browser=browser.replaceAll(`'@hollow-wake/engine/${v}'`,"'./browser-built.mjs'");
fs.writeFileSync(path.join(consumer,'browser-contracts.mjs'),browser);
fs.writeFileSync(path.join(consumer,'hostile.mjs'),`Math.random=()=>{throw new Error('ambient random')};globalThis.fetch=()=>{throw new Error('network')};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key)}});await import('./browser-contracts.mjs');`);
const hostile=run(consumer,['hostile.mjs']);assert(/(?:#|ℹ) pass 22\b/.test(hostile));fs.writeFileSync(path.join(directory,'hostile.txt'),hostile);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {CraftingSession,type CraftingSessionState,type CraftingSessionDefinitions} from '@hollow-wake/engine/crafting/session';
declare const definitions:CraftingSessionDefinitions,state:CraftingSessionState;
const sdk=new CraftingSession(definitions);const result:unknown=sdk.command({op:'open',profile:1,seed:17,state});void result;
// @ts-expect-error formats are internal, not a public constructor option
new CraftingSession(definitions,8,undefined,{});
// @ts-expect-error the core is not a public export
import {CraftingSessionCore} from '@hollow-wake/engine/crafting/session';
void CraftingSessionCore;`);
fs.writeFileSync(path.join(directory,'types.txt'),run(consumer,[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']));
Object.assign(report,{archiveSha256:sha256(fs.readFileSync(archive)),contracts:22,browserContracts:22,browserBytes:bundle.outputFiles[0].contents.length,
  inputSha256:sha256(Buffer.from(source)),contentSha256:sha256(fs.readFileSync(path.join(consumer,'content.json'))),types:true,hostileGlobals:true,runtimeMap:Object.fromEntries(listFiles(path.join(consumer,'node_modules/@hollow-wake/engine/dist')).map(f=>[f,sha256(fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist',f)))]))});
const faults=[
 ['wrong-public-envelope','crafting-session',"capability: (version) => 'crafting-session/v' + version","capability: () => 'crafting-session/complete-diagnostic'"],
 ['flatten-public-version','crafting-session','version: craftingSaveVersion','version: () => 1'],
  ['draw-during-station-quote','crafting-session-core',"if (request.op === 'options')\n                return options;","if (request.op === 'options') return options; this.#random(profile);"],
  ['wrong-station-socket-cost','crafting-session-core','cost: rules.ports.craft.socketCost','cost: { ...rules.ports.craft.socketCost, count: 0 }'],
  ['borrow-view-state','crafting-session-core','view: cloneOwnedJSON(view)','view'],
  ['reuse-account-token','crafting-session-core','accountVersion = this.#nextAccountView++;','accountVersion = 1;'],
  ['trust-foreign-account-token','crafting-session-core','accountVersion === knownAccountVersion ? null','knownAccountVersion !== 0 ? null'],
  ['move-account-field','crafting-session-core','const state = { ...profile.state, account: accountVersion === knownAccountVersion ? null : profile.state.account };',
    'const {account,...state}=profile.state; state.account=accountVersion===knownAccountVersion?null:account;'],
  ['commit-before-admission','crafting-session-core','this.#validate(draft);','profile.state = draft.state; this.#validate(draft);'],
  ['reset-restored-rng','crafting-session-core',"Random.restore({ algorithm: 'mulberry32/v1', state: random.state, draws: random.draws })",'new Random(1)'],
  ['reuse-identity','crafting-session-core','return profile.nextUid++;','return profile.nextUid;'],
  ['lose-overflow','crafting-session-core',"state.overflow.push(item);\n        events.push({ kind: 'recovered', uid: item.uid, destination: placed",
    "void item;\n        events.push({ kind: 'recovered', uid: item.uid, destination: placed"],
  ['ignore-content-identity','crafting-session-core',"need(JSON.stringify(save.content) === JSON.stringify(this.#identity), 'content-mismatch');",'void save.content;'],
  ['ignore-identity-floor','crafting-session-core',"need(item.uid < profile.nextUid, 'uid-floor');",'void item.uid;'],
  ['duplicate-transfer','crafting-session-core','draft.state.overflow.splice(index, 1);','void index;'],
  ['accept-hidden','session-json',"requireSession('value' in d && d.enumerable, 'invalid-property');",'void d;'],
];
if(withFaults){
 const invoke=name=>{const child=spawnSync(process.execPath,['--test','--test-reporter=tap','crafting-session.test.mjs'],{cwd:consumer,encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:8*1024*1024,env:{...process.env,TEMP:directory,TMP:directory,TMPDIR:directory,NODE_COMPILE_CACHE:path.join(directory,'compile-cache')}});logs[name]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal,String(child.error));return{status:child.status,assertion:/ERR_ASSERTION|AssertionError/.test(child.stdout+child.stderr)};};
 for(const[name,module,needle,replacement]of faults){
  const file=path.join(consumer,'node_modules/@hollow-wake/engine/dist',module+'.js'),original=fs.readFileSync(file,'utf8');assert.equal(original.split(needle).length,2,name+' needs one target');const changed=original.replace(needle,replacement);
  assert.equal(ts.createSourceFile(file,changed,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);fs.writeFileSync(file,changed);
  try{const result=invoke(name);assert(result.status===1&&result.assertion,name+' escaped or failed outside an assertion');report.faults.push({name,module,...result});}finally{fs.writeFileSync(file,original);}
 }
 assert.equal(invoke('restored').status,0);report.restored=true;
}
for(const[f,h]of Object.entries(report.runtimeMap))assert.equal(sha256(fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist',f))),h);report.installedRestored=true;report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(fs.readFileSync(path.join(root,f)))===h);report.passed=report.passed&&report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(directory)),owned);assert(!fs.existsSync(path.join(directory,'.git')));fs.rmSync(directory,{recursive:true,maxRetries:3});report.cleaned=true;
 const output=withFaults?'crafting-session-faults-latest':'crafting-session-package-latest',zipped=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(zipped);
 fs.writeFileSync(path.join(owned,output+'.logs.json.gz'),zipped);writeJSON(path.join(owned,output+'.json'),report);
}
assert(report.passed);console.log({passed:true,contracts:22,faults:report.faults.length,browserBytes:report.browserBytes,cleaned:report.cleaned});return report;
}
