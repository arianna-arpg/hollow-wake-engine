import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {installVocationPackages} from './vocation-package-tools.mjs';
import {readVocationFixture} from './vocation-reference.mjs';

const {directory,consumer,sdk,content}=installVocationPackages('vocation-package-');
fs.writeFileSync(path.join(consumer,'original.json'),readVocationFixture('survey'));
const tests=fs.readFileSync(path.join(root,'test/vocations.test.mjs'),'utf8');
fs.writeFileSync(path.join(consumer,'contracts.mjs'),tests.replace("'../dist/vocations.js'","'@hollow-wake/engine/progression/vocations'"));
const testLog=execFileSync(process.execPath,['--test','contracts.mjs'],{cwd:consumer,encoding:'utf8',windowsHide:true,env:{...process.env,HWE_VOCATIONS_MODULE:'@hollow-wake/engine/progression/vocations'}});
fs.writeFileSync(path.join(directory,'contracts.txt'),testLog);assert(/(?:#|ℹ) pass 10\b/.test(testLog));
fs.writeFileSync(path.join(consumer,'content.mjs'),`import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};
const {createVocationQuests,vocationStepKey,vocationUnlockKey,vocationDiscoveryKey}=await import('@hollow-wake/engine/progression/vocations');
const read=name=>fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/catalogue/'+name)),'utf8');
const manifest=JSON.parse(read('manifest.json')),table=read('tables/vocations.json');
assert.equal(createHash('sha256').update(table).digest('hex'),manifest.tables.vocations.sha256);
const byId=new Map(JSON.parse(table).map(row=>[row.id,row.value])),ids=JSON.parse(read('registry-order.json')).vocations;
const defs=ids.map(id=>byId.get(id)),config={giver:'townsfolk_questgiver',offerAtLevel:30,pointsPerStep:0,maxPerCharacter:1};
assert.equal(defs.length,31);
const quests=createVocationQuests(defs,config,ledger=>(ledger.odyssey_stage_1??0)>=1);
const expected=JSON.parse(fs.readFileSync('original.json'));
assert.deepEqual(JSON.parse(JSON.stringify(quests)),expected.generated);
let checks=0;
for(const [i,q]of quests.entries()){
  const v=byId.get(q.vocation),row=expected.gates[i];assert.equal(q.id,row.id);
  for(let mask=0;mask<256;mask++){
    const runLedger={},accountLedger={};
    if(mask&1)accountLedger.odyssey_stage_1=1;
    if(mask&4)accountLedger[vocationUnlockKey(v.id)]=1;
    if(mask&8)runLedger[vocationDiscoveryKey(v.id)]=1;
    if(mask&16)runLedger[vocationStepKey(v.id,row.step-1)]=1;
    if(mask&32)accountLedger[vocationStepKey(v.id,row.step-1)]=1;
    const vocations=mask&64?[v.id]:mask&128?['__other0']:[];
    assert.equal(q.gate({classId:mask&2?v.classId:'__other',vocations,runLedger,accountLedger}),row.bits[mask]==='1',q.id+' case '+mask);
    checks++;
  }
}
console.log(JSON.stringify({vocations:defs.length,steps:quests.length,gateDecisions:checks}));
`);
const result=JSON.parse(execFileSync(process.execPath,['content.mjs'],{cwd:consumer,encoding:'utf8',windowsHide:true}));
fs.writeFileSync(path.join(consumer,'types.ts'),`import {createVocationQuests,grantVocation,type VocationGrantPorts} from '@hollow-wake/engine/progression/vocations';
type Zone={prefab:string,position:[number,number,number]};
const zone:Zone={prefab:'shrine',position:[0,1,2]};
const [q]=createVocationQuests([{id:'v',name:'Vanguard',classId:'warden',quest:{steps:[{offerLabel:'go',zone}]}}],{giver:'town',offerAtLevel:0,pointsPerStep:0,maxPerCharacter:1},ledger=>!!ledger.unlock);
const location:Zone=q.zone;
declare const ports:VocationGrantPorts<number,0>;
const gained:boolean=grantVocation('v',0,ports);
q.gate({vocations:[],classId:'warden',runLedger:{},accountLedger:{unlock:1}});
// @ts-expect-error The host's zone type retains its three coordinates.
const missing:string=q.zone.surface;
// @ts-expect-error The grant preserves numeric seat handles.
grantVocation('v','other',ports);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['types.ts']});
const runTypes=execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(directory,'types.txt'),runTypes);
fs.writeFileSync(path.join(consumer,'browser.mjs'),"export {createVocationQuests,grantVocation} from '@hollow-wake/engine/progression/vocations';");
const bundle=path.join(directory,'browser.mjs');
const built=await build({absWorkingDir:consumer,entryPoints:['browser.mjs'],bundle:true,minify:true,platform:'browser',format:'esm',outfile:bundle,metafile:true});
assert.deepEqual(Object.keys(built.metafile.inputs).sort(),['browser.mjs','node_modules/@hollow-wake/engine/dist/vocation-grants.js','node_modules/@hollow-wake/engine/dist/vocation-keys.js','node_modules/@hollow-wake/engine/dist/vocations.js'].sort());
const bytes=fs.statSync(bundle).size;assert(bytes>0&&bytes<=4096);
const report={passed:true,directory,consumer,contracts:10,browserBytes:bytes,types:true,...result,archiveSha256:sha256(fs.readFileSync(path.join(directory,sdk.filename))),catalogueSha256:sha256(fs.readFileSync(path.join(directory,content.filename)))};
const archives=[sdk,content].map(p=>({name:p.name,version:p.version,file:p.filename,bytes:fs.statSync(path.join(directory,p.filename)).size,sha256:sha256(fs.readFileSync(path.join(directory,p.filename)))}));
writeJSON(path.join(directory,'archive-index.json'),{schemaVersion:1,archives});
writeJSON(path.join(directory,'verification.json'),report);console.log(report);
