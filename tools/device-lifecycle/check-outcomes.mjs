import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha256} from '../../scripts/reference-utils.mjs';

const [htmlArg,nodeArg]=process.argv.slice(2);assert(htmlArg&&nodeArg);
const bytes=fs.readFileSync(path.resolve(htmlArg));
const metadata=/<script id="course-data" type="application\/json">([\s\S]*?)<\/script>/.exec(bytes.toString('utf8'));
assert(metadata,'Missing embedded course metadata');
const data=JSON.parse(metadata[1]);
const original=JSON.parse(fs.readFileSync(path.join(root,'evidence/milestone-two/lifecycle-performance.json')));
const current=JSON.parse(fs.readFileSync(path.resolve(nodeArg)));
assert.deepEqual(current.runs.map(r=>r.actors),[100,500,1000]);
for(const expected of original.runs){
  const row=current.runs.find(r=>r.actors===expected.actors),browser=data.expected.find(r=>r.actors===expected.actors);
  assert(row&&browser);
  for(const [key,browserKey]of [['completionsIncludingWarmup','completions'],['dotTicksIncludingWarmup','ticks'],['planBuilds','planBuilds']]){
    assert.equal(row[key],expected[key]);assert.equal(browser[browserKey],expected[key]);
  }
  assert(Math.abs(row.checksum-expected.checksum)<=Math.abs(expected.checksum)*1e-10);
  assert.equal(browser.checksum,expected.checksum);
}
const sealed=JSON.parse(fs.readFileSync(path.join(root,'evidence/device-lifecycle/acceptance.json')));
const archived=fs.readFileSync(path.join(root,sealed.file));
assert.equal(sha256(archived),sealed.htmlSha256);
if(data.sdk.version===sealed.sdkVersion){
  assert.equal(data.sdk.archiveSha256,sealed.sdkSha256,'Content of the published SDK version changed');
  assert(bytes.equals(archived),'Device benchmark no longer reproduces the archived standalone file');
}
console.log({passed:true,bytes:bytes.length,htmlSha256:sha256(bytes),sdk:data.sdk,actors:current.runs.map(r=>r.actors)});
