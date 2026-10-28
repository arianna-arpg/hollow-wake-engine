import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync, spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root, git, sha256, listFiles, writeJSON} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';
import {itemPack} from './compile-item-content.mjs';
import {passivePack} from './compile-passive-content.mjs';
import {build, version as bundlerVersion} from '../.reference/node_modules/esbuild/lib/main.js';
import * as session from '../experiments/embedded-js/session.mjs';
import {scenario} from '../experiments/embedded-js/session-scenario.mjs';

assert.equal(process.platform, 'win32', 'Current native session proof requires Windows x64');
assert.equal(process.arch, 'x64');
const args = process.argv.slice(2);
assert.equal(args.length, 2); assert.equal(args[0], '--amalgam-dir');
const upstream = fs.realpathSync(args[1]);
const lock = JSON.parse(fs.readFileSync(path.join(root, 'experiments/embedded-js/host-source-lock.json')));
for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha256(fs.readFileSync(path.join(upstream, file))), hash);
const sources = ['experiments/embedded-js/session.mjs', 'experiments/embedded-js/session-scenario.mjs',
  'experiments/embedded-js/session-host.c', 'experiments/embedded-js/host-support.h',
  'experiments/embedded-js/host-source-lock.json', 'scripts/test-embedded-session.mjs'];
const sourceHashes = Object.fromEntries(sources.map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
const runtimeSnapshot = () => Object.fromEntries(listFiles(path.join(root, 'dist')).map(file =>
  [file, sha256(fs.readFileSync(path.join(root, 'dist', file)))]));
const runtime = runtimeSnapshot();
const directory = fs.mkdtempSync(path.join(root, '.artifacts/embedded-session-'));
const receipt = path.join(directory, 'verification.json');
writeJSON(path.join(root, '.artifacts/embedded-session-latest.json'), {directory, receipt});
const input = {core: JSON.parse(fs.readFileSync(path.join(root, 'content/milestone-one.json'))), items: itemPack(), passives: passivePack()};
const inputFile = path.join(directory, 'input.json'); writeJSON(inputFile, input);
const effect = JSON.parse(fs.readFileSync(path.join(root, 'content/burning.json')));
const report = {schemaVersion: 1, passed: false, status: 'started', commit: git(root,['rev-parse','HEAD']).trim(),
  sourceHashes, runtimeOutputs: Object.keys(runtime).length, runtimeMapSha256: sha256(JSON.stringify(runtime)),
  runtime: lock.runtime, version: lock.version, node: process.version, bundlerVersion, platform: process.platform,
  arch: process.arch, inputSha256: sha256(fs.readFileSync(inputFile)), effectSha256: sha256(fs.readFileSync(path.join(root,'content/burning.json'))),
  scope: 'Persistent-session and batched-call development proof. No stable native ABI, frame wire format, engine package or device-performance claim.'};
try {
  const plan = scenario(session, input, effect);
  const requests = path.join(directory, 'requests.jsonl');
  fs.writeFileSync(requests, plan.requests.map(value => JSON.stringify(value)).join('\n') + '\n', {flag: 'wx'});
  fs.writeFileSync(path.join(directory, 'node-original.jsonl'), plan.responses.map(value => JSON.stringify(value)).join('\n') + '\n', {flag: 'wx'});
  Object.assign(report, {requests: plan.requests.length, contractChecks: plan.checks});
  const source = path.join(root, 'experiments/embedded-js/session.mjs');
  const relative = path.relative(directory, source).replaceAll('\\','/');
  const entry = path.join(directory, 'entry.mjs');
  fs.writeFileSync(entry, `import {create as inner,dispatch} from ${JSON.stringify(relative)};export {dispatch};
export function create(input){Math.random=()=>{throw new Error('Ambient randomness');};globalThis.fetch=()=>{throw new Error('Network use');};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});return inner(input);}\n`, {flag:'wx'});
  const bundle = path.join(directory, 'bundle.js');
  const buildResult = await build({entryPoints:[entry],bundle:true,platform:'neutral',format:'iife',globalName:'HollowWakeSession',
    target:'es2022',minify:false,metafile:true,outfile:bundle});
  for(const output of Object.values(buildResult.metafile.outputs))assert.equal(output.imports.length,0);
  report.bundleSha256=sha256(fs.readFileSync(bundle));report.bundleBytes=fs.statSync(bundle).size;
  const context=vm.createContext({raw:fs.readFileSync(inputFile,'utf8')});
  vm.runInContext(fs.readFileSync(bundle,'utf8'),context);
  vm.runInContext('const controller=HollowWakeSession.create(JSON.parse(raw));',context);
  const bundled=[];
  for(const request of plan.requests){context.request=JSON.stringify(request);bundled.push(JSON.parse(vm.runInContext('JSON.stringify(HollowWakeSession.dispatch(controller,JSON.parse(request)))',context)));}
  assert.deepEqual(bundled,plan.responses);
  fs.writeFileSync(path.join(directory,'node-bundled.jsonl'),bundled.map(value=>JSON.stringify(value)).join('\n')+'\n',{flag:'wx'});

  const env=nativeEnvironment(directory),descriptor=fs.openSync(path.join(directory,'build.txt'),'wx');
  const hostObject=path.join(directory,'session-host.obj'),upstreamObject=path.join(directory,'quickjs-amalgam.obj'),binary=path.join(directory,'session-host.exe');
  const flags=['/nologo','/O2','/std:c11','/fp:strict','/MT','/experimental:c11atomics','/I'+upstream];
  const compile=argv=>execFileSync('cl.exe',argv,{cwd:directory,env,windowsHide:true,stdio:['ignore',descriptor,descriptor]});
  try{
    compile([...flags,'/W4','/WX','/c',path.join(root,'experiments/embedded-js/session-host.c'),'/Fo:'+hostObject]);
    compile([...flags,'/c',path.join(upstream,'quickjs-amalgam.c'),'/Fo:'+upstreamObject]);
    compile(['/nologo','/MT',hostObject,upstreamObject,'/Fe:'+binary]);
  }finally{fs.closeSync(descriptor);}
  report.binarySha256=sha256(fs.readFileSync(binary));report.binaryBytes=fs.statSync(binary).size;
  const compiler=spawnSync('cl.exe',[],{cwd:directory,env,windowsHide:true,encoding:'utf8'});
  assert(!compiler.error);report.compilerBanner=(compiler.stdout+compiler.stderr).trim();
  const run=(label,requestFile,expectedCode,expectedCompleted,contentFile=inputFile)=>{
    const out=fs.openSync(path.join(directory,label+'.jsonl'),'wx'),err=fs.openSync(path.join(directory,label+'.txt'),'wx');let result;
    try{result=spawnSync(binary,[bundle,contentFile,requestFile],{cwd:directory,env,windowsHide:true,stdio:['ignore',out,err],timeout:60000});}
    finally{fs.closeSync(out);fs.closeSync(err);}
    assert(!result.error,result.error?.message);assert.equal(result.signal,null);assert.equal(result.status,expectedCode,label);
    const lines=fs.readFileSync(path.join(directory,label+'.txt'),'utf8').trim().split(/\r?\n/);
    const stats=JSON.parse(lines.at(-1));assert.equal(stats.code,expectedCode);assert.equal(stats.completedRequests,expectedCompleted);
    assert.equal(stats.liveRequestedBytesAfterDispose,0);assert.equal(stats.liveBlocksAfterDispose,0);
    const text=fs.readFileSync(path.join(directory,label+'.jsonl'),'utf8').trim();
    return {stats,responses:text?text.split(/\r?\n/).map(line=>JSON.parse(line)):[],errors:lines.slice(0,-1)};
  };
  const native=run('native',requests,0,plan.requests.length);assert.deepEqual(native.responses,plan.responses);
  let numbers=0;function count(value){if(typeof value==='number'){assert(Number.isFinite(value));numbers++;}else if(value&&typeof value==='object')Object.values(value).forEach(count);}count(plan.responses);
  const malformed=path.join(directory,'malformed-requests.jsonl');
  fs.writeFileSync(malformed,JSON.stringify(plan.requests[0])+'\n{\n'+JSON.stringify(plan.requests[1])+'\n',{flag:'wx'});
  const failed=run('malformed',malformed,2,1);assert.deepEqual(failed.responses,[plan.responses[0]]);assert.match(failed.errors.join('\n'),/SyntaxError:/);
  const oversized=path.join(directory,'oversized-requests.jsonl');fs.writeFileSync(oversized,JSON.stringify('x'.repeat(1024*1024))+'\n',{flag:'wx'});
  const bounded=run('oversized',oversized,5,0);assert.deepEqual(bounded.responses,[]);
  const badContent=path.join(directory,'invalid-content.json');
  writeJSON(badContent,{...input,passives:{...input.passives,capability:'unsupported-passive-capability'}});
  const initialization=run('initialization-failure',requests,2,0,badContent);
  assert.deepEqual(initialization.responses,[]);assert.match(initialization.errors.join('\n'),/passive/i);
  Object.assign(report,{passed:true,status:'completed',exactNumericComparisons:numbers,nodeSourceAndBundleEqual:true,
    native:native.stats,malformed:failed.stats,oversized:bounded.stats,initializationFailure:initialization.stats,
    raw:Object.fromEntries(fs.readdirSync(directory).filter(file=>/\.(jsonl|txt)$/.test(file)).map(file=>[file,sha256(fs.readFileSync(path.join(directory,file)))]))});
}catch(error){report.status='failed';throw error;}
finally{
  assert.deepEqual(runtimeSnapshot(),runtime);
  for(const[file,hash]of Object.entries(sourceHashes))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash);
  for(const[file,hash]of Object.entries(lock.files))assert.equal(sha256(fs.readFileSync(path.join(upstream,file))),hash);
  assert.equal(sha256(fs.readFileSync(inputFile)),report.inputSha256);
  report.inputsUnchanged=true;writeJSON(receipt,report);console.log({directory,passed:report.passed,requests:report.requests,exactNumericComparisons:report.exactNumericComparisons});
}
