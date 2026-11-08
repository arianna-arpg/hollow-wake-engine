import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';

export function verifyCStringReport(report,packed) {
  assert.equal(report.schemaVersion,1);
  for(const field of ['passed','cleaned','inputsUnchanged','preparedUnchanged'])assert.equal(report[field],true,field);
  assert(['win32','linux'].includes(report.platform));assert.equal(report.arch,'x64');
  assert.equal(sha256(packed),report.rawSha256);const raw=JSON.parse(gunzipSync(packed));
  assert(Object.keys(report.sources).length>=9);
  for(const[file,digest]of Object.entries(report.sources)){
    assert(!path.isAbsolute(file)&&!file.includes('..'));
    assert.equal(sha256(fs.readFileSync(path.join(root,file))),digest,file);
  }
  const lockBytes=fs.readFileSync(path.join(root,'experiments/embedded-js/host-source-lock.json'));
  const patchBytes=fs.readFileSync(path.join(root,'experiments/embedded-js/patches/cstring-cleanup.json'));
  const lock=JSON.parse(lockBytes),patch=JSON.parse(patchBytes);
  assert.deepEqual(report.upstream,lock);assert.equal(report.patch.id,patch.id);
  assert.equal(report.patch.sourceLockSha256,sha256(lockBytes));assert.equal(report.patch.manifestSha256,sha256(patchBytes));
  assert.deepEqual(report.patch.original,lock.files);
  assert.deepEqual(report.patch.files,{...lock.files,[patch.file]:patch.patchedSha256});
  assert.deepEqual(report.controls,['existing-destination','inside-original','already-patched','drift-quickjs-amalgam.c','drift-quickjs.h','missing-parent']);
  const names=['empty','ascii','latin1','wide','astral-utf8','astral-cesu8','lone-high','lone-low','embedded-nul',
    'ascii-slice','wide-rope','number','object','coercion-throws','error-object'];
  const expected=names.flatMap(name=>Array.from({length:7},(_,after)=>[0,1].map(nullLength=>JSON.stringify([name,after,nullLength]))).flat()).sort();
  const variants=['original','patched',...(report.platform==='linux'?['patched-sanitized']:[])];
  assert.deepEqual(report.rows.map(row=>row.variant),variants);assert.deepEqual(Object.keys(raw),variants);
  for(const row of report.rows){
    assert.equal(row.error,null);assert.equal(row.signal,null);assert.equal(row.cases.length,210);
    assert.equal(row.sanitized,row.variant==='patched-sanitized');
    assert.deepEqual(row.cases.map(test=>JSON.stringify([test.case,test.after,test.nullLength])).sort(),expected);
    const observations=raw[row.variant].stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
    assert.deepEqual(observations,row.cases);assert.equal(raw[row.variant].stderr,'');
    assert(row.cases.every(test=>test.contentPassed===1));
    if(row.variant==='original'){
      assert.equal(row.status,1);assert(row.cases.some(test=>test.case==='wide'&&test.conversionFailed&&test.liveBytes>0&&!test.passed));
      assert(row.cases.filter(test=>!test.passed).every(test=>test.liveBytes>0&&test.liveBlocks>0));
    }else{
      assert.equal(row.status,0);assert(row.cases.every(test=>test.passed===1&&test.liveBytes===0&&test.liveBlocks===0));
      assert(row.cases.some(test=>test.case==='wide'&&test.conversionFailed&&test.refused>0));
      assert(row.cases.some(test=>test.case==='ascii'&&!test.conversionFailed&&!test.refused));
    }
    if(row.sanitized)assert(row.commands.some(command=>command.args.includes('-fsanitize=address,undefined')&&command.args.includes('-fno-sanitize-recover=all')));
  }
  return {passed:true,platform:report.platform,casesPerBuild:210,preparationControls:6,sanitized:report.platform==='linux'};
}
