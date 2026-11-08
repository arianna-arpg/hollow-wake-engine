import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {root,sha256} from '../../../scripts/reference-utils.mjs';

export const qualificationSources=[
  'cstring-cleanup.json','cstring-cleanup.mjs','cstring-contracts-v2.c','test-cstring-cleanup-v2.mjs','verify-cstring-v2.mjs',
].map(file=>'experiments/embedded-js/patches/'+file).concat([
  'experiments/embedded-js/tracked-allocator.h','experiments/embedded-js/host-source-lock.json',
  'scripts/embedded-native-tools.mjs','scripts/native-tools.mjs','scripts/reference-utils.mjs',
]);
const vectors={
  empty:'',ascii:'61'.repeat(4096),latin1:'c389'.repeat(4096),wide:'cea9'.repeat(4096),
  'astral-utf8':'f09f9982'.repeat(2048),'astral-cesu8':'eda0bdedb982'.repeat(2048),
  'lone-high':'eda0bd'.repeat(4096),'lone-low':'edb982'.repeat(4096),'embedded-nul':'4100cea9'.repeat(1024),
  'ascii-slice':'61'.repeat(6144),'wide-rope':'61'.repeat(8192)+'cea9'.repeat(8192),
  number:Buffer.from('123456789').toString('hex'),object:'cea9'.repeat(4096),'coercion-throws':'',
  'error-object':Buffer.from('Error: ').toString('hex')+'cea9'.repeat(4096),
};
const keys=Object.keys(vectors).flatMap(name=>Array.from({length:7},(_,after)=>[0,1].map(nullLength=>
  JSON.stringify([name,after,nullLength]))).flat()).sort();
function observation(value) {
  assert.deepEqual(Object.keys(value).sort(),['errorTag','failed','hex','length','messageHex','messageString','terminated']);
  for(const key of ['failed','messageString','terminated'])assert([0,1].includes(value[key]),key);
  assert(Number.isSafeInteger(value.length)&&value.length>=0&&value.length<=128*1024);
  assert(Number.isSafeInteger(value.errorTag));
  for(const key of ['hex','messageHex'])assert(typeof value[key]==='string'&&/^(?:[0-9a-f]{2})*$/.test(value[key])&&value[key].length<=256*1024);
  if(value.failed){assert.equal(value.hex,'');assert.equal(value.terminated,0);assert.equal(value.length,0);}
  else{assert.equal(value.errorTag,0);assert.equal(value.messageString,0);assert.equal(value.messageHex,'');assert.equal(value.terminated,1);}
}
function matches(value,expected,nullLength) {
  if(value.failed)return false;
  if(nullLength){const bytes=Buffer.from(expected,'hex'),index=bytes.indexOf(0);if(index>=0)expected=bytes.subarray(0,index).toString('hex');}
  return value.hex===expected&&value.length===(nullLength?0:expected.length/2);
}
export function verifyCStringRowsV2(report,raw) {
  assert.equal(report.contractRevision,2);
  assert(['win32','linux'].includes(report.platform));assert.equal(report.arch,'x64');
  const builds=['original','patched',...(report.platform==='linux'?['original-sanitized','patched-sanitized']:[])];
  const variants=builds.flatMap(build=>['cold','warm'].map(mode=>build+'-'+mode));
  assert.deepEqual(report.rows.map(row=>row.variant),variants);assert.deepEqual(Object.keys(raw),variants);
  for(const row of report.rows){
    const sanitized=row.variant.includes('-sanitized-'),warm=row.variant.endsWith('-warm'),original=row.variant.startsWith('original-');
    assert.equal(row.sanitized,sanitized);assert.equal(row.warm,warm);
    assert.equal(row.signal,null);assert.equal(row.error,null);assert.equal(row.status,original?1:0);
    assert.deepEqual(row.cases.map(test=>JSON.stringify([test.case,test.after,test.nullLength])).sort(),keys);
    assert.deepEqual(raw[row.variant].stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line)),row.cases);
    assert.deepEqual(raw[row.variant].process,{status:row.status,signal:null,error:null});
    assert.equal(typeof raw[row.variant].build,'string');
    for(const test of row.cases){
      assert.equal(test.warm,Number(warm));
      for(const field of ['refused','liveBytes','liveBlocks','prefixBytes'])assert(Number.isSafeInteger(test[field])&&test[field]>=0);
      assert(test.prefixBytes>0);
      observation(test.first);observation(test.retry);
      const expected=vectors[test.case],throws=test.case==='coercion-throws';
      const firstValid=test.first.failed?(throws||test.refused>0):!throws&&matches(test.first,expected,test.nullLength);
      const retryValid=throws?test.retry.failed===1:matches(test.retry,expected,false);
      assert.equal(test.firstValid,Number(firstValid));assert(firstValid,'Initial encoding or refusal: '+test.case);
      assert.equal(test.retryValid,Number(retryValid));
      if(warm)assert(retryValid,'Initialized retry: '+test.case);
      if(throws){assert.equal(test.retry.messageString,1);assert.equal(test.retry.messageHex,Buffer.from('refused').toString('hex'));}
      const passed=firstValid&&(!warm||retryValid)&&test.liveBytes===0&&test.liveBlocks===0;
      assert.equal(test.passed,Number(passed));
      if(!original)assert(passed&&test.liveBytes===0&&test.liveBlocks===0,'Candidate ownership: '+test.case);
    }
    assert(row.cases.some(test=>test.case==='wide'&&test.first.failed&&test.refused>0));
    assert(row.cases.some(test=>test.case==='ascii'&&!test.first.failed&&!test.refused));
    if(original)assert(row.cases.some(test=>test.case==='wide'&&test.liveBytes>0&&test.liveBlocks>0&&!test.passed),'Original leak control');
    if(sanitized){
      assert(row.commands.some(command=>command.args.includes('-fsanitize=address,undefined')&&command.args.includes('-fno-sanitize-recover=all')));
      assert.deepEqual(row.sanitizers,{ASAN_OPTIONS:'detect_leaks=1:halt_on_error=1',UBSAN_OPTIONS:'halt_on_error=1:print_stacktrace=1'});
    }
    const stderr=raw[row.variant].stderr;
    if(original&&sanitized){
      assert.match(stderr,/ERROR: LeakSanitizer: detected memory leaks/);
      assert(!/runtime error:|ERROR: AddressSanitizer:|DEADLYSIGNAL|SUMMARY: UndefinedBehaviorSanitizer/.test(stderr));
      const summaries=[...stderr.matchAll(/SUMMARY: AddressSanitizer: (\d+) byte\(s\) leaked in (\d+) allocation\(s\)\./g)];
      assert.equal(summaries.length,1);
      const bytes=row.cases.reduce((sum,test)=>sum+test.liveBytes+test.liveBlocks*test.prefixBytes,0);
      const blocks=row.cases.reduce((sum,test)=>sum+test.liveBlocks,0);
      assert.equal(Number(summaries[0][1]),bytes,'Only the tracked original leaks may appear');
      assert.equal(Number(summaries[0][2]),blocks);
    }else assert.equal(stderr,'');
  }
  for(const sanitized of report.platform==='linux'?[false,true]:[false]){
    for(const mode of ['cold','warm']){
      const suffix=(sanitized?'-sanitized':'')+'-'+mode;
      const original=report.rows.find(row=>row.variant==='original'+suffix),patched=report.rows.find(row=>row.variant==='patched'+suffix);
      const observed=test=>({case:test.case,after:test.after,nullLength:test.nullLength,refused:test.refused,
        first:test.first,retry:test.retry,firstValid:test.firstValid,retryValid:test.retryValid});
      assert.deepEqual(patched.cases.map(observed),original.cases.map(observed),'Full original/candidate conversion behavior '+suffix);
    }
  }
  return {passed:true,contractRevision:2,platform:report.platform,casesPerMode:210,modes:variants.length,
    coldBehaviorMatched:true,initializedRetriesPassed:true,patchedLeaks:0,productionAdopted:false};
}
export function verifyCStringReportV2(report,packed) {
  assert.equal(report.schemaVersion,1);
  for(const field of ['passed','cleaned','inputsUnchanged','preparedUnchanged'])assert.equal(report[field],true,field);
  assert.deepEqual(Object.keys(report.sources),qualificationSources);
  for(const[file,digest]of Object.entries(report.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),digest,file);
  assert.equal(sha256(packed),report.rawSha256);
  const lockBytes=fs.readFileSync(path.join(root,'experiments/embedded-js/host-source-lock.json'));
  const patchBytes=fs.readFileSync(path.join(root,'experiments/embedded-js/patches/cstring-cleanup.json'));
  const lock=JSON.parse(lockBytes),patch=JSON.parse(patchBytes);
  assert.deepEqual(report.upstream,lock);assert.equal(report.patch.id,patch.id);
  assert.equal(report.patch.sourceLockSha256,sha256(lockBytes));assert.equal(report.patch.manifestSha256,sha256(patchBytes));
  assert.deepEqual(report.patch.original,lock.files);assert.deepEqual(report.patch.files,{...lock.files,[patch.file]:patch.patchedSha256});
  assert.deepEqual(report.controls,['existing-destination','inside-original','already-patched','drift-quickjs-amalgam.c','drift-quickjs.h','missing-parent']);
  return verifyCStringRowsV2(report,JSON.parse(gunzipSync(packed)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);assert.equal(args.length,2);assert.equal(args[0],'--report');
  console.log(verifyCStringReportV2(JSON.parse(fs.readFileSync(args[1])),fs.readFileSync(args[1]+'.raw.json.gz')));
}
