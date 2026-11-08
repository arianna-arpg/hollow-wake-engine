import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha256} from '../../../scripts/reference-utils.mjs';
import {verifyCStringReport} from './verify-cstring-report.mjs';
const args=process.argv.slice(2);
if(args.length){
  assert.equal(args.length,2);assert.equal(args[0],'--report');
  console.log(verifyCStringReport(JSON.parse(fs.readFileSync(args[1])),fs.readFileSync(args[1]+'.raw.json.gz')));
}else{
  const directory=path.join(root,'evidence/native-cstring-cleanup');
  const accepted=JSON.parse(fs.readFileSync(path.join(directory,'acceptance.json')));
  assert.equal(accepted.schemaVersion,1);assert.equal(accepted.productionAdopted,false);assert.equal(accepted.deviceQualified,false);
  for(const[file,digest]of Object.entries(accepted.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),digest,file);
  assert.deepEqual(Object.keys(accepted.files),['windows.json','windows.raw.json.gz']);
  for(const[file,digest]of Object.entries(accepted.files))assert.equal(sha256(fs.readFileSync(path.join(directory,file))),digest,file);
  console.log(verifyCStringReport(JSON.parse(fs.readFileSync(path.join(directory,'windows.json'))),fs.readFileSync(path.join(directory,'windows.raw.json.gz'))));
}
