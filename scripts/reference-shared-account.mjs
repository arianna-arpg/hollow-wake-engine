import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import ts from 'typescript';
import {root,sha256,verifyReference} from './reference-utils.mjs';
import {prepareVocationObserver,checkVocationObserverTypes} from './vocation-reference.mjs';

const args=process.argv.slice(2);
const revision=args[0]==='--revision'?Number(args.splice(0,2)[1]):2;
assert([1,2].includes(revision),'Revision must be 1 or 2');
const capture=args[0]==='--capture';
if(capture)args.shift();
assert(args.length===0||args.length===2 && args[0]==='--output','Use [--revision 1|2] [--capture] [--output fresh-report.json]');
const output=path.resolve(args[1]??path.join(root,'.artifacts/shared-account-reference-v'+revision+'-latest.json'));
const relative=revision===1?'baseline/shared-account':'baseline/shared-account/admitted-socket',baseline=path.join(root,relative);
if(args.length)assert(!fs.existsSync(output) && !fs.existsSync(output+'.logs.json.gz'));
const acceptanceFile=path.join(baseline,'acceptance.json');
assert(capture?!fs.existsSync(acceptanceFile):fs.existsSync(acceptanceFile));
const helper=revision===1?'reference/export-shared-account.ts':'reference/export-shared-account-admitted.ts',helperSha256=sha256(fs.readFileSync(path.join(root,helper)));
const sourceLock=fs.readFileSync(path.join(root,'baseline/source-lock.json')),lock=JSON.parse(sourceLock),game=path.join(root,'.reference');
verifyReference(game,lock);
const methods={
 'engine/world.ts':['breakOneItem','salvageItem','salvageLane','craftSlots','craftAffix'],
 'meta/unlocks.ts':['applyUnlock','investUnlock','grantUnlock','isUnlockVisible','isUnlockOwned','remainingCost'],
 'meta/account.ts':['makeAccount','serializeAccount'],
 'engine/crafting.ts':['studySalvage','craftableAffixesFor','CRAFT_CFG']
};
const methodHashes={};
for(const[file,names]of Object.entries(methods)){
 const ast=ts.createSourceFile(file,fs.readFileSync(path.join(game,'src',file),'utf8'),ts.ScriptTarget.Latest,true);
 const world=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='World');
 for(const name of names){
  const node=world?world.members.find(node=>ts.isMethodDeclaration(node)&&node.name.getText(ast)===name):
   ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name ||
     ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)===name));
  assert(node,file+'#'+name);methodHashes[file+'#'+name]=sha256(node.getText(ast).replaceAll('\r\n','\n'));
 }
}
if(!capture){
 const accepted=JSON.parse(fs.readFileSync(acceptanceFile));
 assert.equal(accepted.sourceLockSha256,sha256(sourceLock));assert.equal(accepted.helperSha256,helperSha256);
 assert.deepEqual(accepted.methods,methodHashes);
}
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const work=fs.mkdtempSync(path.join(root,'.artifacts/shared-account-reference-'));
const logs={},report={passed:false,captured:capture,sourceLockSha256:sha256(sourceLock),helperSha256,methods:methodHashes,
 sources:Object.fromEntries([helper,'scripts/reference-shared-account.mjs','scripts/vocation-reference.mjs','scripts/reference-utils.mjs']
   .map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))])),runs:[],faults:[]};
const run=(file,label,tsx=false)=>{
 const target=path.join(work,label+'.json');
 const result=spawnSync(process.execPath,[...(tsx?['--import','tsx']:[]),file,target],{
  cwd:game,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,
  env:{...process.env,TEMP:work,TMP:work,TMPDIR:work}});
 assert(!result.error && !result.signal,label+' process failure');
 logs[label]=result.stdout+'\n'+result.stderr;
 return {status:result.status,bytes:fs.existsSync(target)?fs.readFileSync(target):null,logSha256:sha256(logs[label])};
};
const faults=[
 {name:'missing-ledger',file:'engine/world.ts',
  before:'this.account.ledger[LEDGER_CRAFTS_UNLOCKED] = (this.account.ledger[LEDGER_CRAFTS_UNLOCKED] ?? 0) + 1;',
  after:'this.account.ledger[LEDGER_CRAFTS_UNLOCKED] = (this.account.ledger[LEDGER_CRAFTS_UNLOCKED] ?? 0);'},
 {name:'double-ledger',file:'engine/world.ts',
  before:'this.account.ledger[LEDGER_CRAFTS_UNLOCKED] = (this.account.ledger[LEDGER_CRAFTS_UNLOCKED] ?? 0) + 1;',
  after:'this.account.ledger[LEDGER_CRAFTS_UNLOCKED] = (this.account.ledger[LEDGER_CRAFTS_UNLOCKED] ?? 0) + 2;'},
 {name:'detached-lore',file:'engine/world.ts',before:'studySalvage(this.account.craftLore, item)',after:'studySalvage({}, item)'},
 {name:'stale-feature',file:'engine/world.ts',before:'featureEnabled(this.account, CRAFT_CFG.extraSlotFeature)',after:'false'},
 {name:'ignore-sealed-progression',file:'engine/world.ts',
  before:"if (mode !== 'break' || !this.metaProgressionActive()) return [];",after:"if (mode !== 'break') return [];"},
 {name:'teach-on-sale',file:'engine/world.ts',
  before:"if (mode !== 'break' || !this.metaProgressionActive()) return [];",after:'if (!this.metaProgressionActive()) return [];'},
 {name:'missing-feature-grant',file:'meta/unlocks.ts',before:'a.features.add(u.payload.flag);',after:'new Set(a.features).add(u.payload.flag);'},
 {name:'insufficient-purchase-spends',file:'meta/unlocks.ts',before:'if (a.credits < rem) return false;',after:'void a.credits;'},
 {name:'drop-saved-lore',file:'meta/account.ts',before:'craftLore: a.craftLore,',after:'craftLore: {},'}
];
try{
 const entry=prepareVocationObserver('shared-account',game,work,{'shared-account':{helper,helperSha256}});
 try{checkVocationObserverTypes(work,[entry]);}finally{if(fs.existsSync(path.join(work,'types.txt')))logs.types=fs.readFileSync(path.join(work,'types.txt'),'utf8');}
 const first=run(entry,'original-one',true),second=run(entry,'original-two',true);
 for(const row of [first,second])assert.equal(row.status,0,logs[row===first?'original-one':'original-two']);
 assert(first.bytes.equals(second.bytes),'Original captures differ');
 const expected=first.bytes,trace=JSON.parse(expected);
 assert.equal(trace.scenarios.length,10);assert.equal(trace.rows.length,30);
 report.runs=[first,second].map(({status,bytes,logSha256})=>({status,sha256:sha256(bytes),logSha256}));
 if(!capture){
  const accepted=JSON.parse(fs.readFileSync(acceptanceFile)),packed=fs.readFileSync(path.join(root,accepted.fixture));
  assert.equal(sha256(packed),accepted.compressedSha256);
  assert(expected.equals(gunzipSync(packed)),'Original outcome differs from accepted shared-account baseline');
 }
 const bundle=async fault=>{
  const result=await build({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',target:'node22',write:false,logLevel:'silent',
   plugins:fault?[{name:'original-account-fault',setup(builder){
    builder.onLoad({filter:/\.[cm]?tsx?$/},args=>{
     if(path.resolve(args.path)!==path.join(game,'src',fault.file))return;
     const source=fs.readFileSync(args.path,'utf8');
     assert.equal(source.split(fault.before).length,2,fault.name+' requires one source target');
     return {contents:source.replace(fault.before,fault.after),loader:'ts'};
    });
   }}]:[]});
  const file=path.join(work,'observer.cjs');fs.writeFileSync(file,result.outputFiles[0].contents);return file;
 };
 const control=run(await bundle(),'bundled-control');
 assert.equal(control.status,0,logs['bundled-control']);assert(control.bytes.equals(expected),'Bundling changed original behavior');
 report.bundledControl={status:control.status,sha256:sha256(control.bytes),logSha256:control.logSha256};
 for(const fault of faults){
  const result=run(await bundle(fault),'fault-'+fault.name);
  const assertion=result.status===1 && /ERR_ASSERTION|AssertionError/.test(logs['fault-'+fault.name]);
  const changed=result.status===0 && result.bytes!==null && !result.bytes.equals(expected);
  assert(assertion || changed,'Fault escaped or failed outside a behavior assertion: '+fault.name+'\n'+logs['fault-'+fault.name]);
  report.faults.push({name:fault.name,file:fault.file,detected:true,status:result.status,assertion,traceChanged:changed,logSha256:result.logSha256});
 }
 const restored=run(await bundle(),'restored-control');
 assert.equal(restored.status,0,logs['restored-control']);assert(restored.bytes.equals(expected));
 report.restoredControl={status:restored.status,sha256:sha256(restored.bytes),logSha256:restored.logSha256};
 report.scenarios=10;report.steps=30;report.passed=true;
 if(capture){
  fs.mkdirSync(baseline,{recursive:true});
  const compressed=gzipSync(expected,{level:9}),fixture=relative+'/observations.json.gz';
  fs.writeFileSync(path.join(root,fixture),compressed,{flag:'wx'});
  fs.writeFileSync(acceptanceFile,JSON.stringify({schemaVersion:1,revision,capturedBeforeImplementation:revision===1,
   ...(revision===2?{supersedes:'baseline/shared-account/acceptance.json',
    reason:'Revision 1 seeded a crafted socket on a Lapis Ring, whose source socket capacity is zero. Revision 2 uses a socket-capable helmet for the craft target; source rules and accepted revision 1 are unchanged.'}:{}),
   sourceLockSha256:sha256(sourceLock),predecessor:'86b75485c3497f2f0b854c8cdfeed07c8802806f',
   helper,helperSha256,methods:methodHashes,fixture,sha256:sha256(expected),compressedSha256:sha256(compressed),
   bytes:expected.length,compressedBytes:compressed.length,scenarios:10,steps:30,faults:report.faults},null,2)+'\n',{flag:'wx'});
 }
}catch(error){report.passed=false;report.failure=String(error);throw error;}
finally{
 for(const[file,sha]of Object.entries(report.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),sha,file);
 verifyReference(game,lock);
 const packed=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(output+'.logs.json.gz',packed,{flag:args.length?'wx':'w'});
 report.logsSha256=sha256(packed);
 assert.equal(path.dirname(fs.realpathSync(work)),path.join(root,'.artifacts'));
 fs.rmSync(work,{recursive:true,force:true});report.cleaned=true;
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:args.length?'wx':'w'});
}
console.log({passed:true,scenarios:report.scenarios,steps:report.steps,faults:report.faults.length,cleaned:report.cleaned});
