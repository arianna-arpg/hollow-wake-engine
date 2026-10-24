import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
import {conditionPaths,renderConditionActor} from '../adapters/hollow-wake/integrate-actor-conditions.mjs';

const argument=name=>{const at=process.argv.indexOf(name);assert(at<0||process.argv[at+1],'Missing value for '+name);return at<0?undefined:path.resolve(process.argv[at+1]);};
const previous=argument('--previous-adapter');assert(previous,'Pass retained v0.31 game as --previous-adapter');
const artifacts=path.join(root,'.artifacts'),location=JSON.parse(fs.readFileSync(path.join(artifacts,'adapter-location.json'))),current=location.game,comparison=argument('--comparison-adapter');
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),validationOnly=process.argv.includes('--validate-only');
const oldEngine=path.join(previous,'node_modules/@hollow-wake/engine'),newEngine=path.join(current,'node_modules/@hollow-wake/engine');
assert.equal(fs.realpathSync(newEngine),fs.realpathSync(path.join(location.tooling,'node_modules/@hollow-wake/engine')));assert.notEqual(fs.realpathSync(oldEngine),fs.realpathSync(newEngine));
assert.equal(JSON.parse(fs.readFileSync(path.join(oldEngine,'package.json'))).version,'0.31.0');assert.equal(JSON.parse(fs.readFileSync(path.join(newEngine,'package.json'))).version,'0.32.0');
const hashFiles=dir=>Object.fromEntries(listFiles(dir).map(file=>[file,sha256(fs.readFileSync(path.join(dir,file)))]));
const snapshot=game=>game?{source:hashFiles(path.join(game,'src')),runtime:hashFiles(path.join(game,'node_modules/@hollow-wake/engine/dist'))}:undefined;
const before={previous:snapshot(previous),current:snapshot(current),comparison:snapshot(comparison)};
if(comparison){assert.notEqual(fs.realpathSync(path.join(comparison,'node_modules/@hollow-wake/engine')),fs.realpathSync(newEngine));assert.notEqual(fs.realpathSync(path.join(comparison,'node_modules/@hollow-wake/engine')),fs.realpathSync(oldEngine));}
const priorFiles=Object.keys(before.previous.runtime),files=Object.keys(before.current.runtime);
assert.deepEqual(files.filter(file=>!file.startsWith('actor-conditions.')),priorFiles);
for(const file of priorFiles)assert.equal(before.current.runtime[file],before.previous.runtime[file],'Changed predecessor runtime: '+file);
const previousSource=Object.keys(before.previous.source);assert.deepEqual(Object.keys(before.current.source).filter(file=>'src/'+file!==conditionPaths.binding),previousSource);
for(const file of previousSource){
  const prior=fs.readFileSync(path.join(previous,'src',file),'utf8'),expected='src/'+file===conditionPaths.actor?renderConditionActor(prior):prior;
  assert.equal(fs.readFileSync(path.join(current,'src',file),'utf8').replaceAll('\r\n','\n'),expected.replaceAll('\r\n','\n'),'Changed host outside condition overlay: '+file);
}
assert.equal(fs.readFileSync(path.join(current,conditionPaths.binding),'utf8'),fs.readFileSync(path.join(root,'adapters/hollow-wake/actorConditionAdapter.ts'),'utf8'));
function verify(){
  verifyReference(reference,lock);assert.deepEqual(hashFiles(path.join(root,'dist')),before.current.runtime,'Candidate differs from built runtime');
  assert.deepEqual(snapshot(previous),before.previous);assert.deepEqual(snapshot(current),before.current);assert.deepEqual(snapshot(comparison),before.comparison);
}
verify();
const directory=fs.mkdtempSync(path.join(artifacts,'condition-benchmark-')),output=path.join(directory,validationOnly?'validation.json':'benchmark.json');
const source=fs.readFileSync(path.join(root,'reference/benchmark-actor-conditions.ts'),'utf8'),imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
const helper=path.join(directory,'capture.ts'),typed=path.join(directory,'typed.ts');
fs.writeFileSync(helper,source.replace(imports,(_all,_quote,p)=>JSON.stringify(pathToFileURL(path.join(reference,'src',p+'.ts')).href)));
fs.writeFileSync(typed,source.replace(imports,(_all,_quote,p)=>JSON.stringify(path.relative(directory,path.join(reference,'src',p)).replaceAll('\\','/'))));
const config=path.join(directory,'tsconfig.json');writeJSON(config,{extends:path.join(reference,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(reference,'node_modules/@types')]},include:[path.join(reference,'src'),typed],exclude:[]});
const fd=fs.openSync(path.join(directory,'types.txt'),'wx');try{execFileSync(process.execPath,[path.join(reference,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:directory,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);verify();}
try{execFileSync(process.execPath,['--expose-gc','--import','tsx',helper,previous,current,output,...(comparison?['--comparison-adapter',comparison]:[]),...(validationOnly?['--validate-only']:[])],{cwd:reference,stdio:'inherit'});}finally{verify();}
const result=JSON.parse(fs.readFileSync(output));assert.equal(result.validationOnly,validationOnly);
Object.assign(result,{helperTypesPassed:true,helperSha256:sha256(source),installedRuntimeFilesMatchBuild:files.length,unchangedPredecessorRuntimeFiles:priorFiles.length,installedArchive:location.integrity,sourceCapsuleUnchanged:true,controlsUnchanged:true,comparisonIncluded:!!comparison});
writeJSON(output,result);writeJSON(path.join(artifacts,'actor-condition-benchmark'+(validationOnly?'-validation':'')+'-location.json'),{output});
