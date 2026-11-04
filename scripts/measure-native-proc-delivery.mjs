import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {build} from '../.reference/node_modules/esbuild/lib/main.js';
import {root, listFiles, sha256, writeJSON} from './reference-utils.mjs';
import {nativeProcDeliveryEntry} from './native-proc-delivery-entry.mjs';
import {installCourseServices} from '../experiments/embedded-js/course-services.mjs';

const [proofOption, proofFile, beforeOption, beforeLocation, afterOption, afterLocation] = process.argv.slice(2);
assert.deepEqual([proofOption, beforeOption, afterOption], ['--proof', '--predecessor', '--installed']);
const read = file => JSON.parse(fs.readFileSync(file));
const hash = file => sha256(fs.readFileSync(file));
const snapshot = dir => Object.fromEntries(listFiles(dir).map(f => [f, hash(path.join(dir, f))]));
const proof = read(proofFile);
assert(proof.passed && proof.originalAndInstalledNative.exact && proof.runs.length === 4);
const previous = read(beforeLocation), current = read(afterLocation);
assert(previous.procCastingDecision && !previous.procDeliveryDecision && current.procDeliveryDecision);
const before = snapshot(path.join(previous.game, 'src')), after = snapshot(path.join(current.game, 'src'));
assert.equal(sha256(JSON.stringify(after)), proof.gameSourceMapSha256);
assert.deepEqual(Object.keys(after).filter(f => after[f] !== before[f]).sort(), ['engine/procDelivery.ts', 'engine/world.ts']);
assert(Object.keys(before).every(f => f in after));
const runtime = game => snapshot(path.join(game, 'node_modules/@hollow-wake/engine/dist'));
const priorDist = runtime(previous.game), installedDist = runtime(current.game);
for (const [file, checksum] of Object.entries(priorDist)) assert.equal(installedDist[file], checksum, file);
assert.deepEqual(Object.keys(installedDist).filter(f => !(f in priorDist)).sort(), [
  'proc-delivery-types.d.ts','proc-delivery-types.js','proc-delivery-types.js.map',
  'proc-delivery.d.ts','proc-delivery.js','proc-delivery.js.map',
]);
const binary = path.join(proof.directory, 'native', process.platform === 'win32' ? 'course-host.exe' : 'course-host');
assert.equal(hash(binary), proof.driver.binarySha256);
for (const f of ['scripts/native-proc-delivery-entry.mjs', 'experiments/embedded-js/course-services.mjs',
  'experiments/embedded-js/session-host.c', 'experiments/embedded-js/tracked-allocator.h'])
  assert.equal(hash(path.join(root,f)), proof.sourceHashes[f], f);
const accepted = read(path.join(root, 'baseline/proc-delivery/acceptance.json'));
const helper = fs.readFileSync(path.join(root, accepted.helper), 'utf8');
assert.equal(sha256(helper), accepted.helperSha256);
const directory = fs.mkdtempSync(path.join(root, '.artifacts/native-proc-footprint-'));
const entry = path.join(directory,'entry.ts'), predecessor = path.join(directory,'predecessor.js');
fs.writeFileSync(entry, nativeProcDeliveryEntry(helper, previous.game));
const buildResult = await build({entryPoints:[entry], bundle:true, platform:'neutral', format:'iife',
  globalName:'HollowWakeSession', target:'es2022', keepNames:true, outfile:predecessor, metafile:true,
  banner:{js:`(${installCourseServices.toString()})();`}});
const inputs = Object.keys(buildResult.metafile.inputs).map(f => path.resolve(root,f));
assert(inputs.includes(path.join(fs.realpathSync(path.join(previous.game,'node_modules/@hollow-wake/engine')), 'dist/proc-casting.js')));
assert(!inputs.some(f => path.basename(f) === 'proc-delivery.js'));
const runs = [], bundles = {original:path.join(proof.directory,'original/bundle.js'), predecessor,
  installed:path.join(proof.directory,'installed/bundle.js')};
for(const label of ['original','installed'])assert.equal(hash(bundles[label]),proof.runs.find(r=>r.label===label).bundleSha256);
const fullOriginal = proof.runs[0].consumers.find(h => h.host === 'c').outputSha256;
assert.equal(fullOriginal,proof.runs[1].consumers.find(h => h.host === 'c').outputSha256);
for(const [name, requestCount] of [['startup',1], ['first-course',2], ['complete',accepted.courses+2]]){
  const requests = name === 'complete' ? path.join(proof.directory,'requests.jsonl') : path.join(directory,name+'-requests.jsonl');
  if(name !== 'complete') fs.writeFileSync(requests, (name==='first-course'?'{"op":"next"}\n':'')+'{"op":"services"}\n');
  let expected;
  for(const [label, bundle] of Object.entries(bundles)){
    const output=path.join(directory,name+'-'+label+'.jsonl'), log=path.join(directory,name+'-'+label+'.txt');
    const fd=fs.openSync(output,'wx'), err=fs.openSync(log,'wx');
    let result;
    try {
      result=spawnSync(binary,[bundle,path.join(proof.directory,'input.json'),requests],{cwd:directory,stdio:['ignore',fd,err],timeout:600000,windowsHide:true});
    } finally {fs.closeSync(fd);fs.closeSync(err);}
    assert(!result.error && !result.signal);assert.equal(result.status,0,log);
    const metrics=JSON.parse(fs.readFileSync(log,'utf8').trim().split(/\r?\n/).at(-1));
    assert.equal(metrics.code,0);assert.equal(metrics.completedRequests,requestCount);
    assert.equal(metrics.liveRequestedBytesAfterDispose,0);assert.equal(metrics.liveBlocksAfterDispose,0);
    const outputSha256=hash(output);expected??=outputSha256;assert.equal(outputSha256,expected,name+' '+label);
    if(name==='complete')assert.equal(outputSha256,fullOriginal);
    runs.push({scope:name,label,requestCount,outputSha256,metrics});
    console.log(name,label,metrics.peakRequestedBytes,metrics.allocationRequests);
  }
}
assert.deepEqual(snapshot(path.join(previous.game,'src')),before);assert.deepEqual(snapshot(path.join(current.game,'src')),after);
assert.deepEqual(runtime(previous.game),priorDist);assert.deepEqual(runtime(current.game),installedDist);
const report={passed:true,directory,proofSha256:hash(proofFile),driverSha256:hash(binary),runtime:proof.runtimeVersion,
  sourceSha256:hash(path.join(root,'scripts/measure-native-proc-delivery.mjs')),
  predecessorGameSha256:sha256(JSON.stringify(before)),installedGameSha256:proof.gameSourceMapSha256,
  bundles:Object.fromEntries(Object.entries(bundles).map(([name,file])=>[name,{bytes:fs.statSync(file).size,sha256:hash(file)}])),runs,
  scope:'Fresh processes on the same C driver. Peak requested bytes include parsing the full test bundle, initialization, gameplay, observer serialization and disposal. Allocation request counts include reallocations. Live gameplay memory and whole-process RSS require separate measurements.'};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/native-proc-footprint-verification.json'),report);
