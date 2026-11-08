import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
const directory=path.join(root,'evidence/grouped-saves');
const accepted=JSON.parse(fs.readFileSync(path.join(directory,'hosted.json')));
assert(accepted.passed&&!accepted.engineQualification&&!accepted.physicalDeviceQualification);
assert.equal(accepted.commit,'eb6a01647063aaebe72a19f63ca29fd876288f69');
for(const [file,hash]of Object.entries(accepted.files))
  assert.equal(sha256(fs.readFileSync(path.join(directory,file))),hash,file);
for(const [file,hash]of Object.entries(accepted.sources))
  assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
const raw=JSON.parse(gunzipSync(fs.readFileSync(path.join(directory,'hosted-raw.json.gz'))));
assert.equal(raw.run.headSha,accepted.commit);assert.equal(raw.run.conclusion,'success');
assert.equal(raw.run.jobs.length,2);assert(raw.run.jobs.every(job=>job.conclusion==='success'));
for(const platform of ['windows','linux']){
  const {build,contracts,worker}=raw[platform];
  for(const report of [build,contracts,worker]){
    assert(report.passed);
    for(const [file,hash]of Object.entries(report.sources))
      assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,platform+': '+file);
  }
  assert.equal(build.librarySha256,contracts.librarySha256);
  assert.equal(accepted.platforms[platform].librarySha256,build.librarySha256);
  assert.equal(build.version,'0.2.0-preview.1');
  assert.equal(contracts.mutations.length,12);assert(contracts.mutations.every(row=>row.detected));
  assert.equal(contracts.crashRecovery.length,6);assert(contracts.crashRecovery.every(row=>row.passed&&row.recovered));
  assert(contracts.cAbi.passed&&contracts.managed.passed&&contracts.legacyConsumer.passed&&contracts.legacyManaged.groupsRefused);
  assert(worker.mutations.length===9&&worker.mutations.every(row=>row.detected));
}
const sanitizers=raw.linux.contracts.sanitizers;
assert(sanitizers.passed&&sanitizers.address&&sanitizers.undefinedBehavior&&sanitizers.leakDetection);
assert(sanitizers.core.passed&&sanitizers.cAbi.passed);
console.log({passed:true,commit:accepted.commit,platforms:['Windows x64','Linux x64'],sanitizers:true,
  scope:'Native grouped storage and C/C# consumers; engine integrations and physical devices remain separate'});
