import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {root,listFiles,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {readLifeRecoveryExpectations} from './check-life-recovery-contract.mjs';

const at=process.argv.indexOf('--location');assert(at<0||process.argv[at+1],'Missing recovery adapter location');
const location=JSON.parse(fs.readFileSync(at<0?path.join(root,'.artifacts/adapter-location.json'):path.resolve(process.argv[at+1])));
const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-forty-two/adapter-contract.json')));
assert.equal(location.lifeRecoveryAdapterDecision,contract.decision,'Requires the guarded recovery adapter');
const {acceptance,fixtures,helpers:captureHelpers,rows,courses}=readLifeRecoveryExpectations(),game=location.game;
const installed=fs.realpathSync(path.join(location.tooling,'node_modules/@hollow-wake/engine'));
const lock=JSON.parse(fs.readFileSync(path.join(root,acceptance.sourceLock))),reference=path.join(root,'.reference');verifyReference(reference,lock);
const archive=fs.readFileSync(location.archive);assert.equal('sha512-'+createHash('sha512').update(archive).digest('base64'),location.integrity,'Changed recovery archive');
const consumer=path.dirname(path.dirname(path.dirname(installed))),packageLock=JSON.parse(fs.readFileSync(path.join(consumer,'package-lock.json')));
assert.equal(packageLock.packages['node_modules/@hollow-wake/engine'].integrity,location.integrity,'Wrong installed recovery archive');
assert.equal(fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine')),installed,'Game resolves a different SDK');
const snapshot=directory=>Object.fromEntries(listFiles(directory).map(file=>[file,sha256(fs.readFileSync(path.join(directory,file)))]));
const hostBefore=snapshot(path.join(game,'src')),packageBefore=snapshot(installed),runnerSha256=sha256(fs.readFileSync(new URL(import.meta.url)));
const unchanged=()=>{assert.deepEqual(snapshot(path.join(game,'src')),hostBefore);assert.deepEqual(snapshot(installed),packageBefore);verifyReference(reference,lock);readLifeRecoveryExpectations();};
const output=fs.mkdtempSync(path.join(root,'.artifacts/game-life-recovery-')),typed=[],helpers=new Map();
for(const row of captureHelpers){
  const source=fs.readFileSync(path.join(root,row.file),'utf8'),name=path.basename(row.file),runtime=path.join(output,name),type=path.join(output,name.replace('.ts','.typed.ts'));
  const imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
  fs.writeFileSync(runtime,source.replace(imports,(_all,_q,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)),{flag:'wx'});
  fs.writeFileSync(type,source.replace(imports,(_all,_q,p)=>JSON.stringify(path.relative(output,path.join(game,'src',p)).replaceAll('\\','/'))),{flag:'wx'});
  helpers.set(row.file,runtime);typed.push(type);
}
const config=path.join(output,'tsconfig.json');writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[path.join(game,'src'),...typed],exclude:[]});
function run(name,args){const fd=fs.openSync(path.join(output,name+'.txt'),'wx');try{
  execFileSync(process.execPath,args,{cwd:game,stdio:['ignore',fd,fd],windowsHide:true,timeout:180000});
}catch(error){console.error('Recovery comparison failed; retained logs in '+output);throw error;}finally{fs.closeSync(fd);unchanged();}}
run('types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config]);
const results=[];
for(const row of rows){
  const destination=path.join(output,row.name+'.json');
  run(row.name,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,helpers.get(row.helper),destination]);
  const bytes=fs.readFileSync(destination);assert(bytes.equals(fixtures.get(row.name).bytes),'Installed recovery differs from native: '+row.name);
  results.push({name:row.name,courses:row.courses,sha256:sha256(bytes),byteEqual:true});console.log('PASS installed '+row.name+' ('+row.courses+')');
}
unchanged();assert.equal(sha256(fs.readFileSync(new URL(import.meta.url))),runnerSha256);
const receipt={output,game,tooling:location.tooling,packageIntegrity:location.integrity,archiveSha256:sha256(archive),runnerSha256,
  courses,results,typesPassed:true,readOnly:true,hostSourceSha256:sha256(JSON.stringify(hostBefore)),packageFilesSha256:sha256(JSON.stringify(packageBefore)),
  allSourceAndPackageFilesUnchanged:true,scope:'Original observations reproduced through the installed SDK. Installed-fault, renderer, performance and hardware acceptance remain separate gates.'};
writeJSON(path.join(output,'verification.json'),receipt);writeJSON(path.join(root,'.artifacts/game-life-recovery-verification.json'),receipt);
