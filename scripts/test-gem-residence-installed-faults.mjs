import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';
import {prepareVocationObserver,checkVocationObserverTypes,captureVocationObserver,readVocationFixture} from './vocation-reference.mjs';
import {gemResidenceRuntimeFaults} from './gem-residence-runtime-faults.mjs';
const [flag,file,...extra]=process.argv.slice(2);assert.equal(flag,'--location');assert(file&&extra.length===0);
const location=JSON.parse(fs.readFileSync(path.resolve(file)));assert(location.gemResidenceDecision);
const fixtures=JSON.parse(fs.readFileSync(path.join(root,'baseline/gem-residence/acceptance.json'))).fixtures;
const directory=fs.mkdtempSync(path.join(root,'.artifacts/gem-residence-installed-faults-')),game=path.join(directory,'game'),source=fs.realpathSync(location.game);
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(file=>[file,sha256(fs.readFileSync(path.join(dir,file)))]));
const sourceBefore=snapshot(path.join(source,'src')),packageSource=fs.realpathSync(path.join(source,'node_modules/@hollow-wake/engine')),packageBefore=snapshot(packageSource);
fs.cpSync(source,game,{recursive:true,filter:file=>!path.relative(source,file).split(path.sep).some(part=>['node_modules','.git','dist','saves','release','.cache'].includes(part))});
const modules=path.join(game,'node_modules');fs.mkdirSync(modules);
for(const name of fs.readdirSync(path.join(source,'node_modules'))){if(name==='@hollow-wake'||name==='.package-lock.json')continue;
 const target=fs.realpathSync(path.join(source,'node_modules',name));if(fs.statSync(target).isDirectory())fs.symlinkSync(target,path.join(modules,name),process.platform==='win32'?'junction':'dir');}
fs.mkdirSync(path.join(modules,'@hollow-wake'));const installed=path.join(modules,'@hollow-wake/engine');fs.cpSync(packageSource,installed,{recursive:true});
const entries=Object.fromEntries(['residence'].map(name=>[name,prepareVocationObserver(name,game,directory,fixtures)]));
checkVocationObserverTypes(directory,Object.values(entries));const results=[];let passed=false;
function capture(name,label){try{const result=captureVocationObserver(entries[name],directory,label);return {matches:result.bytes.equals(readVocationFixture(name,fixtures)),sha256:result.sha256};}
 catch(error){const text=fs.readFileSync(path.join(directory,label+'.txt'),'utf8');if(error.status===1&&/ERR_ASSERTION|AssertionError/.test(text))return {matches:false,assertion:true,logSha256:sha256(text)};throw error;}}
try{
 for(const name of ['residence'])assert(capture(name,'clean-'+name).matches);
 const selected=new Set(['socket-cut-copy','grant-capacity','zero-sockets','loose-budget','unlock-property','invalid-rank-property','uid-floor','tier-clamp']);
 for(const [name,module,needle,replacement]of gemResidenceRuntimeFaults.filter(row=>selected.has(row[0]))){
  const target=path.join(installed,'dist',module+'.js'),bytes=fs.readFileSync(target),text=bytes.toString();assert(text.includes(needle));
  const changed=text.replace(needle,replacement);assert.equal(ts.createSourceFile(target,changed,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
  fs.writeFileSync(target,changed);try{const result=capture('residence',name);assert(!result.matches,name+' did not change the installed game');results.push({name,module,...result});}finally{fs.writeFileSync(target,bytes);}
  writeJSON(path.join(directory,'progress.json'),{results});
 }
 for(const name of ['residence'])assert(capture(name,'restored-'+name).matches);passed=true;
}finally{
 assert.deepEqual(snapshot(installed),packageBefore);assert.deepEqual(snapshot(packageSource),packageBefore);assert.deepEqual(snapshot(path.join(source,'src')),sourceBefore);assert.deepEqual(snapshot(path.join(game,'src')),sourceBefore);
 const report={passed,directory,game,predecessor:source,archiveSha256:sha256(fs.readFileSync(location.archive)),results,installedRestored:true,predecessorPreserved:true};
 writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/gem-residence-installed-faults-latest.json'),report);console.log({passed,directory,detected:results.length});
}
