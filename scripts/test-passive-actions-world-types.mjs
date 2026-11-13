import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';import {patchPassiveActionsWorld} from './passive-actions-world-overlay.mjs';
const game=path.join(root,'.reference'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),key=f=>path.resolve(f).toLowerCase();
const configFile=path.join(game,'tsconfig.json'),loaded=ts.readConfigFile(configFile,ts.sys.readFile);assert.equal(loaded.error,undefined);
const config=ts.parseJsonConfigFileContent(loaded.config,ts.sys,game);assert.deepEqual(config.errors,[]);
const world=path.join(game,'src/engine/world.ts'),bridge=path.join(game,'src/engine/passivePolicyAdapter.ts');
let bridgeText=read('adapters/hollow-wake/passivePolicyAdapter.ts').replaceAll('\r\n','\n');
bridgeText=bridgeText.replace("import { refreshSdkPassiveGrants } from './passiveGrantAdapter';\n",'').replace(' refreshSdkPassiveGrants();','');
const virtual=new Map([[key(world),patchPassiveActionsWorld(read('.reference/src/engine/world.ts'))],[key(bridge),bridgeText]]);
const sources=['src/passive-actions.ts','scripts/passive-actions-world-overlay.mjs','scripts/test-passive-actions-world-types.mjs',
 '.reference/src/engine/world.ts','adapters/hollow-wake/passivePolicyAdapter.ts','.reference/tsconfig.json'];
const report={passed:false,typescript:ts.version,sources:Object.fromEntries(sources.map(f=>[f,sha256(read(f))])),virtualOverlay:true};
try{
 const host=ts.createCompilerHost(config.options),exists=host.fileExists.bind(host),get=host.getSourceFile.bind(host);
 host.fileExists=file=>virtual.has(key(file))||exists(file);
 host.getSourceFile=(file,...args)=>virtual.has(key(file))?ts.createSourceFile(file,virtual.get(key(file)),args[0],true):get(file,...args);
 host.resolveModuleNames=(names,containingFile)=>names.map(name=>{
  if(name==='candidate/passive-actions')return{resolvedFileName:path.join(root,'src/passive-actions.ts'),extension:ts.Extension.Ts};
  if(name==='@hollow-wake/engine/passives')return{resolvedFileName:path.join(root,'src/passive-policy.ts'),extension:ts.Extension.Ts};
  return ts.resolveModuleName(name,containingFile,config.options,host).resolvedModule;
 });
 const program=ts.createProgram([...config.fileNames,bridge],config.options,host),errors=ts.getPreEmitDiagnostics(program);
 const lock=JSON.parse(read('baseline/source-lock.json'));report.sources['baseline/source-lock.json']=sha256(read('baseline/source-lock.json'));
 for(const file of program.getSourceFiles()){
  const relative=path.relative(root,file.fileName).replaceAll('\\','/');
  if(relative.startsWith('../')||relative.includes('/node_modules/')||relative.startsWith('node_modules/')||key(file.fileName)===key(bridge))continue;
  if(!fs.existsSync(file.fileName))continue;
  const hash=sha256(fs.readFileSync(file.fileName));report.sources[relative]=hash;
  if(relative.startsWith('.reference/src/'))assert.equal(hash,lock.files[relative.slice(11)],relative);
 }
 report.diagnostics=errors.map(d=>({file:d.file?path.relative(root,d.file.fileName).replaceAll('\\','/'):null,
  line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}));
 report.productionFiles=config.fileNames.length;
 assert.deepEqual(report.diagnostics,[]);report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(read(f))===h);report.passed&&=report.inputsUnchanged;
 fs.writeFileSync(path.join(root,'.artifacts/maintained-passive-actions-world-types.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure);console.log({passed:true,virtualOverlay:true,productionFiles:report.productionFiles});
