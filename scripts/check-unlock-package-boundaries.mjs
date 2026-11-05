
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';
export async function checkUnlockPackageBoundaries(accepted){
assert(accepted.consumer&&accepted.archives[0].sha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/unlock-content-boundary-')),consumer=accepted.consumer;
const forbidden=new Set(['window','document','localStorage','fetch','requestAnimationFrame','performance','process','Date','eval','Function']);
for(const file of ['unlock-content','unlock-predicates','rune-script']){
 const source=fs.readFileSync(path.join(root,'src',file+'.ts'),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 function visit(node){
  if(ts.isIdentifier(node)&&forbidden.has(node.text))throw new Error('Host API '+node.text);
  if(ts.isPropertyAccessExpression(node)&&node.expression.getText(ast)==='Math'&&node.name.text==='random')throw new Error('Ambient randomness');
  if(ts.isImportDeclaration(node))assert(node.moduleSpecifier.text.startsWith('./'),'External production dependency');
  ts.forEachChild(node,visit);
 }visit(ast);
}
const typeSource=`import {UnlockContent,type UnlockPack} from '@hollow-wake/engine/progression/unlock-content';
import {ProgressionGateContent} from '@hollow-wake/engine/progression/gate-content';
import {MemoryRewardContent} from '@hollow-wake/engine/progression/memory-content';
import {RuneScript} from '@hollow-wake/engine/presentation/runes';
import {testUnlockPredicate,type UnlockPredicate} from '@hollow-wake/engine/progression/unlock-predicates';
declare const data:UnlockPack;
declare const gates:ProgressionGateContent;
declare const memories:MemoryRewardContent;
const content=new UnlockContent(data,{gates,memories});
const rune:string|undefined=content.runes.runeOf('th');void rune;
const id:string=content.pack.catalog[0].id;void id;
// @ts-expect-error Content is deeply read-only.
content.pack.catalog[0].cost=1;
// @ts-expect-error Catalogue membership is immutable.
content.pack.catalog.push(content.pack.catalog[0]);
// @ts-expect-error Nested bundle definitions are immutable.
content.pack.classBundles[0].skillIds.push('changed');
// @ts-expect-error Alphabet rows are immutable.
new RuneScript(content.pack.alphabet).alphabet[0].letter='changed';
// @ts-expect-error Content requires both validated dependency packs.
new UnlockContent(data,{gates});
const rule:UnlockPredicate={kind:'counter',source:'ledger',key:'x',fallback:0,comparison:'>',threshold:0};
const result:boolean=testUnlockPredicate(rule,{account:{level:0},ledger:{}});void result;
`;
fs.writeFileSync(path.join(consumer,'unlock-content-types.ts'),typeSource,{flag:'wx'});
const config=path.join(consumer,'tsconfig.unlock-content.json');
writeJSON(config,{compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',types:[],strict:true,noEmit:true},include:['unlock-content-types.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:consumer,windowsHide:true,stdio:'pipe',timeout:120000});
const entry=path.join(consumer,'unlock-content-browser.mjs');
fs.writeFileSync(entry,`export {UnlockContent} from '@hollow-wake/engine/progression/unlock-content';
export {UnlockLifecycle} from '@hollow-wake/engine/progression/unlocks';
export {ProgressionGateContent} from '@hollow-wake/engine/progression/gate-content';
export {MemoryRewardContent} from '@hollow-wake/engine/progression/memory-content';
export {RelicCustody} from '@hollow-wake/engine/inventory/relics';
export {StashPolicy} from '@hollow-wake/engine/inventory/stash';
`,{flag:'wx'});
const result=await build({absWorkingDir:consumer,entryPoints:[entry],tsconfigRaw:{},bundle:true,platform:'browser',format:'iife',globalName:'UnlockSDK',target:'es2022',minify:true,metafile:true,write:false});
const inputs=Object.keys(result.metafile.inputs);
assert(inputs.every(file=>file.endsWith('unlock-content-browser.mjs')||file.startsWith('node_modules/@hollow-wake/engine/dist/')));
assert(!inputs.some(file=>/\.reference|game\/src|world\.js/.test(file)));
const context=vm.createContext({}),code=result.outputFiles[0].text;vm.runInContext(code,context);
const dataFile=(name,file)=>path.join(consumer,'node_modules/@hollow-wake',name,file);
context.packs={unlocks:JSON.parse(fs.readFileSync(dataFile('unlocks','unlocks.json'))),gates:JSON.parse(fs.readFileSync(dataFile('progression-gates','gates.json'))),memories:JSON.parse(fs.readFileSync(dataFile('memory-rewards','memories.json')))};
const policy=JSON.parse(gunzipSync(fs.readFileSync(path.join(consumer,'policy.json.gz')))),fresh=policy.observations.find(r=>r.name==='fresh');
context.saved=fresh.before;
const output=JSON.parse(vm.runInContext(`(()=>{
 Math.random=()=>{throw new Error('Unexpected ambient randomness');};
 const packs=JSON.parse(JSON.stringify(globalThis.packs));
 const memories=new UnlockSDK.MemoryRewardContent(packs.memories),gates=new UnlockSDK.ProgressionGateContent(packs.gates);
 const content=new UnlockSDK.UnlockContent(packs.unlocks,{gates,memories});
 const unsupported=()=>{throw new Error('Unexpected item-host request');};
 const stash={...packs.unlocks.relicStash,accepts:unsupported};
 const relics=new UnlockSDK.RelicCustody({isRelic:unsupported,footprint:unsupported,nextUid:unsupported,bumpUidFloor:unsupported,cloneItems:unsupported,
  stash:()=>stash,bagBoard:unsupported,progression:()=>packs.unlocks.reliquaryConfig});
 const storage=new UnlockSDK.StashPolicy(unsupported);
 const sdk=new UnlockSDK.UnlockLifecycle(content.context({
  reliquaryCost:state=>relics.cost(state),reliquaryPower:state=>relics.power(state),stashPageCost:state=>storage.pageCost(stash,state),
  investReliquary:(a,n)=>relics.investPower(a.reliquary,a,!!a.ledger[packs.unlocks.reliquaryConfig.attunement],n),
  investRelicStash:(a,n)=>relics.investStorage(a.reliquary,a,a.features.has(packs.unlocks.reliquaryFeature),n),
 }));
 const a=JSON.parse(JSON.stringify(saved));
 for(const key of ['unlockedClasses','pendingClassUnlocks','unlockedClassTiers','unlockedSkills','explicitSkillUnlocks','unlockedSupports','memorySecondary','features','unlockedSlots','packageUnlocks'])a[key]=new Set(a[key]);
 const available=sdk.availableUnlocks(a).map(row=>row.id),rumor=sdk.shroudedClassUnlocks(a).map(row=>sdk.classRumorRead(a,row));
 a.credits=1000;const offer=sdk.allUnlockables(a).find(row=>row.kind==='memory');let draws=0;
 const granted=sdk.applyUnlock(a,offer,()=>{draws++;return 0;});
 return JSON.stringify({available,rumor,granted,draws,credits:a.credits,price:offer.cost,receipt:a.memoryReceipts[offer.payload.memoryUnlockId]});
})()`,context));
assert.deepEqual(output.available,fresh.available);assert(output.granted&&output.draws===1&&output.receipt.sequence===1);
assert.equal(output.credits,1000-output.price);
fs.writeFileSync(path.join(directory,'unlocks.min.js'),code,{flag:'wx'});
const report={passed:true,directory,archiveSha256:accepted.archives[0].sha256,typeContractSha256:sha256(typeSource),browserBytes:Buffer.byteLength(code),inputs,observation:output,
 scope:'Strict installed TypeScript contracts and a standalone browser-targeted bundle evaluated in a VM with explicit randomness. Does not establish physical device or editor support.'};
writeJSON(path.join(directory,'verification.json'),report);console.log({passed:true,directory,browserBytes:report.browserBytes,inputs:inputs.length,granted:output.granted});

return report;
}
