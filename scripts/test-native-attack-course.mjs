import {compareAttackCourse as compare} from './native-attack-comparison.mjs';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {build, version as bundlerVersion} from '../.reference/node_modules/esbuild/lib/main.js';
import {root, git, sha256, listFiles, verifyReference, writeJSON} from './reference-utils.mjs';
import {buildEmbeddedExecutable, buildEmbeddedLibrary} from './embedded-native-tools.mjs';
import {installCourseServices} from '../experiments/embedded-js/course-services.mjs';
import {createNativeAttackCapturePack} from './native-attack-observer.mjs';

const args = process.argv.slice(2);
assert.equal(args.length, 4); assert.equal(args[0], '--location'); assert.equal(args[2], '--amalgam-dir');
const location = JSON.parse(fs.readFileSync(path.resolve(root, args[1]))), upstream = fs.realpathSync(args[3]);
const original = path.join(root, '.reference'), game = fs.realpathSync(location.game);
const installed = fs.realpathSync(path.join(game, 'node_modules/@hollow-wake/engine'));
assert.notEqual(game, original);
verifyReference(original, JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'))));
const snapshot = dir => Object.fromEntries(listFiles(dir).map(file => [file, sha256(fs.readFileSync(path.join(dir, file)))]));
const sources = [original, game].map(dir => snapshot(path.join(dir, 'src'))), pkg = snapshot(installed), runtime = snapshot(path.join(root, 'dist'));
assert.deepEqual(snapshot(path.join(installed, 'dist')), runtime);
assert.equal(fs.readFileSync(path.join(game, 'src/engine/procAdapter.ts'), 'utf8').replaceAll('\r\n', '\n'), fs.readFileSync(path.join(root, 'adapters/hollow-wake/procAdapter.ts'), 'utf8').replaceAll('\r\n', '\n'));
const accepted = JSON.parse(fs.readFileSync(path.join(root, 'baseline/attack-sequences/acceptance.json')));
const expectedBytes = gunzipSync(fs.readFileSync(path.join(root, accepted.observations)));
assert.equal(sha256(expectedBytes), accepted.observationsSha256);
const expected = JSON.parse(expectedBytes), helper = fs.readFileSync(path.join(root, accepted.helper), 'utf8');
assert.equal(sha256(helper), accepted.helperSha256);
const lock = JSON.parse(fs.readFileSync(path.join(root, 'experiments/embedded-js/host-source-lock.json')));
for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha256(fs.readFileSync(path.join(upstream, file))), hash);
const owned = ['scripts/native-attack-comparison.mjs', 'scripts/native-attack-observer.mjs', 'scripts/test-native-attack-course.mjs', 'experiments/embedded-js/course-services.mjs',
  'experiments/embedded-js/session-host.c', 'experiments/embedded-js/host-support.h', 'experiments/embedded-js/tracked-allocator.h',
  'scripts/embedded-native-tools.mjs', 'scripts/native-tools.mjs', 'baseline/attack-sequences/acceptance.json', accepted.helper, accepted.observations];
owned.push(...listFiles(path.join(root,'experiments/embedded-js/native')).map(file=>'experiments/embedded-js/native/'+file));
const hashes = Object.fromEntries(owned.map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
const directory = fs.mkdtempSync(path.join(root, '.artifacts/native-attack-course-'));
writeJSON(path.join(root, '.artifacts/native-attack-course-latest.json'), {directory});
const report = {schemaVersion: 1, passed: false, directory, commit: git(root, ['rev-parse', 'HEAD']).trim(),
  node: process.version, bundlerVersion, platform: process.platform, arch: process.arch, sourceHashes: hashes,
  originalSourceMapSha256: sha256(JSON.stringify(sources[0])), gameSourceMapSha256: sha256(JSON.stringify(sources[1])),
  installedPackageMapSha256: sha256(JSON.stringify(pkg)), runtimeMapSha256: sha256(JSON.stringify(runtime)),
  referenceSha256: accepted.observationsSha256, runtimeVersion: lock.version,
  scope: 'Full original/installed-game Cleave course in a development native driver. Includes original World, content, headless shims and test observation storage. No new engine API, stable package, performance or device acceptance.', runs: []};

// Preserve every calculation and observation in the accepted helper. Only the
// file/assert boundary, yields between groups, and diagnostic traversal strategy
// are replaced. The iterative observer must match every frozen observation.
function entry(sourceRoot) {
  const imports = [];
  let body = helper.replace(/^import .*?;\r?\n/gm, line => {if (!line.includes("'node:")) imports.push(line); return '';});
  assert(!body.includes("from 'node:"));
  const packStart=body.indexOf('function capturePack('),packEnd=body.indexOf('function captureActor(');
  assert(packStart>=0&&packEnd>packStart);
  body=body.slice(0,packStart)+`const capturePack=(${createNativeAttackCapturePack.toString()})(CaptureActor,captureActorRef,captureId);\n`+body.slice(packEnd);
  const groups = [...body.matchAll(/captureBeginGroup\((\d+)\);/g)].map(match => Number(match[1]));
  assert.deepEqual(groups, Array.from({length: 31}, (_, i) => i + 1));
  body = body.replace(/captureBeginGroup\((\d+)\);/g, (_all, n) => `if(captureGroup)yield captureDrain();captureBeginGroup(${n});`);
  return imports.join('').replace(/(['"])\.\.\/src\/([^'"]+)\1/g, (_a, _q, file) => JSON.stringify(path.join(sourceRoot, 'src', file + '.ts').replaceAll('\\', '/'))) + `
const process={argv:['','','capture'],exitCode:0};
const captureAssert={equal(a,b){if(!Object.is(a,b))throw new Error('Capture assertion: '+a+' != '+b);}};
let finalCapture;
const captureFs={writeFileSync(_path,text){finalCapture=JSON.parse(text);}};
function* course(){
 let rowCursor=0,eventCursor=0,randomCursor=0;
 function captureDrain(){const out={group:captureGroup,rows:captureRows.slice(rowCursor),trace:captureEvents.slice(eventCursor),random:captureRandom.slice(randomCursor)};rowCursor=captureRows.length;eventCursor=captureEvents.length;randomCursor=captureRandom.length;return out;}
 ${body}
 yield captureDrain();
 return {checks:finalCapture.checks,events:finalCapture.events,randomDraws:finalCapture.randomDraws};
}
export function create(){return course();}
export function dispatch(controller,request){
 if(request.op==='services')return globalThis.courseServiceReport();
 if(request.op!=='next')throw new Error('Unsupported course request');
 try{return controller.next();}catch(error){throw new Error(String(error)+'\\n'+error.stack);}
}
`;
}
const projected = output => ({rows: output.slice(0,31).flatMap(x=>x.value.rows), trace: output.slice(0,31).flatMap(x=>x.value.trace), random: output.slice(0,31).flatMap(x=>x.value.random)});
try {
  const nativeDir = path.join(directory, 'native'); fs.mkdirSync(nativeDir);
  const built = buildEmbeddedExecutable(nativeDir, upstream, path.join(root, 'experiments/embedded-js/session-host.c'), 'course-host');
  Object.assign(report, {compilerBanner: built.compilerBanner, buildCommands: built.commands, binarySha256: sha256(fs.readFileSync(built.binary))});
  const libraryDir=path.join(directory,'library');fs.mkdirSync(libraryDir);
  const library=buildEmbeddedLibrary(libraryDir,upstream);
  report.library={compilerBanner:library.compilerBanner,buildCommands:library.commands,librarySha256:sha256(fs.readFileSync(library.library)),consumerSha256:sha256(fs.readFileSync(library.native))};
  const content = path.join(directory, 'input.json'), requests = path.join(directory, 'requests.jsonl');
  fs.writeFileSync(content, '{}', {flag:'wx'});
  fs.writeFileSync(requests, [...Array(32).fill({op:'next'}), {op:'services'}].map(v=>JSON.stringify(v)).join('\n')+'\n', {flag:'wx'});
  const nativeResults = [];
  for (const [label, sourceRoot, fault] of [['original', original, false], ['installed', game, false], ['early-freeze-fault', game, true]]) {
    const out = path.join(directory, label); fs.mkdirSync(out);
    const source = path.join(out, 'entry.ts'), bundle = path.join(out, 'bundle.js');
    fs.writeFileSync(source, entry(sourceRoot), {flag:'wx'});
    let mutations = 0;
    const plugins = fault ? [{name:'restore-early-freeze', setup(api) {api.onLoad({filter:/[\\/]dist[\\/]proc-runtime\.js$/}, input => {
      assert.equal(fs.realpathSync(input.path), path.join(installed, 'dist/proc-runtime.js'));
      const text = fs.readFileSync(input.path, 'utf8'), before = 'if (new.target === ProcRuntime)'; assert.equal(text.split(before).length, 2); mutations++;
      return {contents:text.replace(before, 'if (true)'), loader:'js'};
    });}}] : [];
    const compiled = await build({entryPoints:[source], bundle:true, platform:'neutral', format:'iife', globalName:'HollowWakeSession',
      target:'es2022', keepNames:true, metafile:true, outfile:bundle, plugins,
      banner:{js:`(${installCourseServices.toString()})();`}});
    assert.equal(mutations, fault ? 1 : 0);
    assert(Object.values(compiled.metafile.outputs).every(output => output.imports.length === 0));
    const inputs = Object.keys(compiled.metafile.inputs).map(file=>path.resolve(root,file));
    if(sourceRoot===game)assert(inputs.includes(path.join(installed,'dist/proc-runtime.js')));
    else assert(!inputs.some(file=>file.includes('@hollow-wake')));
    writeJSON(path.join(out,'metafile.json'),compiled.metafile);
    fs.writeFileSync(bundle, 'try {\n'+fs.readFileSync(bundle,'utf8')+'\n}catch(error){throw new Error(String(error)+"\\n"+error.stack);}\n');
    let cloneChecks = 0;
    const context = vm.createContext({courseCloneOracle(a,b){assert.deepEqual(structuredClone(a),structuredClone(b));cloneChecks++;}});
    vm.runInContext(fs.readFileSync(bundle,'utf8'),context);
    vm.runInContext('const controller=HollowWakeSession.create({});',context);
    const node=[];for(let i=0;i<32;i++)node.push(JSON.parse(vm.runInContext("JSON.stringify(HollowWakeSession.dispatch(controller,{op:'next'}))",context)));
    compare(projected(node),{rows:expected.rows,trace:expected.trace,random:expected.random});
    assert.deepEqual(node[31],{value:{checks:114,events:7264,randomDraws:2733},done:true});
    const services=JSON.parse(vm.runInContext('JSON.stringify(globalThis.courseServiceReport())',context));assert.equal(cloneChecks,services.clones);assert(cloneChecks>0);
    fs.writeFileSync(path.join(out,'node.jsonl'),node.map(v=>JSON.stringify(v)).join('\n')+'\n',{flag:'wx'});writeJSON(path.join(out,'node-services.json'),services);
    const output=fs.openSync(path.join(out,'native.jsonl'),'wx'),errors=fs.openSync(path.join(out,'native.txt'),'wx');let result;
    try {result=spawnSync(built.binary,[bundle,content,requests],{cwd:out,env:built.env,windowsHide:true,stdio:['ignore',output,errors],timeout:180000});}
    finally {fs.closeSync(output);fs.closeSync(errors);}
    assert(!result.error,result.error?.message);assert.equal(result.signal,null);
    const log=fs.readFileSync(path.join(out,'native.txt'),'utf8').trim().split(/\r?\n/),metrics=JSON.parse(log.at(-1));
    assert.equal(metrics.liveRequestedBytesAfterDispose,0);assert.equal(metrics.liveBlocksAfterDispose,0);
    const raw=fs.readFileSync(path.join(out,'native.jsonl'),'utf8').trim(),native=raw?raw.split(/\r?\n/).map(JSON.parse):[];
    const run={label,passed:false,bundleBytes:fs.statSync(bundle).size,bundleSha256:sha256(fs.readFileSync(bundle)),cloneChecks,metrics,nodeExact:true};report.runs.push(run);
    if(fault){assert.equal(result.status,2);assert.equal(metrics.completedRequests,0);assert.equal(native.length,0);assert.match(log.join('\n'),/object is not extensible/);assert.match(log.join('\n'),/WorldProcs/);run.detected=true;}
    else {
      assert.equal(result.status,0);assert.equal(metrics.completedRequests,33);assert.equal(native.length,33);
      run.comparison=compare(native.slice(0,32),node,true);
      assert.equal(native[32].clones,cloneChecks);
      assert.deepEqual(native[32].logs,services.logs);
      const consumerOutput=path.join(out,'library.jsonl'),consumerLog=fs.openSync(path.join(out,'library.txt'),'wx');let replay;
      try{replay=spawnSync(library.native,[library.library,bundle,content,requests,consumerOutput],{cwd:out,env:library.env,windowsHide:true,stdio:['ignore',consumerLog,consumerLog],timeout:180000});}finally{fs.closeSync(consumerLog);}
      assert(!replay.error,replay.error?.message);assert.equal(replay.signal,null);assert.equal(replay.status,0,'Native library replay: '+label);
      const libraryMetrics=JSON.parse(fs.readFileSync(path.join(out,'library.txt'),'utf8').trim().split(/\r?\n/).at(-1));
      assert(libraryMetrics.passed);assert.equal(libraryMetrics.requests,33);assert.equal(libraryMetrics.liveBytesAfterDispose,0);assert.equal(libraryMetrics.liveBlocksAfterDispose,0);
      const libraryValues=fs.readFileSync(consumerOutput,'utf8').trim().split(/\r?\n/).map(JSON.parse);
      assert.equal(libraryValues.length,33);run.libraryComparison=compare(libraryValues.slice(0,32),native.slice(0,32));
      assert.equal(libraryValues[32].clones,cloneChecks);assert.deepEqual(libraryValues[32].logs,services.logs);run.libraryMetrics=libraryMetrics;
      nativeResults.push(native.slice(0,32));
    }
    run.passed=true;writeJSON(path.join(out,'verification.json'),run);
  }
  report.originalAndInstalledNative=compare(nativeResults[1],nativeResults[0]);
  report.passed=true;
}catch(error){report.error={message:error.message,stack:error.stack};throw error;}
finally {
  assert.deepEqual(snapshot(path.join(original,'src')),sources[0]);assert.deepEqual(snapshot(path.join(game,'src')),sources[1]);
  assert.deepEqual(snapshot(installed),pkg);assert.deepEqual(snapshot(path.join(root,'dist')),runtime);
  for(const[file,hash]of Object.entries(hashes))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash);
  for(const[file,hash]of Object.entries(lock.files))assert.equal(sha256(fs.readFileSync(path.join(upstream,file))),hash);
  report.inputsUnchanged=true;writeJSON(path.join(directory,'verification.json'),report);
  console.log({directory,passed:report.passed,runs:report.runs.map(r=>({label:r.label,passed:r.passed,metrics:r.metrics,differences:r.comparison?.differences})),error:report.error?.message});
}
