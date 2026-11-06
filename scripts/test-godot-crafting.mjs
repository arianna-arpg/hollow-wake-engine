import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {replayGodotSession} from './godot-session-replay.mjs';
// Compare the wire values with the original observations outside Godot. Parsing
// both sides inside the same engine could otherwise hide numeric conversion loss.
let reference;
function sameValue(actual,expected,key) {
  if(Object.is(actual,expected))return;
  if(!actual||!expected||typeof actual!=='object'||typeof expected!=='object')assert.fail(key+': '+JSON.stringify(actual)?.slice(0,100)+' != '+JSON.stringify(expected)?.slice(0,100));
  assert.equal(Array.isArray(actual),Array.isArray(expected),key+' container');
  assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),key+' fields');
  for(const k of Object.keys(expected))sameValue(actual[k],expected[k],key+'.'+k);
}
replayGodotSession({capability:'crafting',probe:'test/godot-crafting/probe.gd',runner:'scripts/test-godot-crafting.mjs',additionalSources:['evidence/content-tables/windows.json'],
  scope:'Both capabilities in the same Godot install. All 56 immutable crafting replies, two loaded profiles, disk continuation across native hosts, lossy Variant refusals, UID exhaustion, recovery and default salvage lanes. Allocator caps apply per native host only.',
  prepareProject(project,pkg){
    const proof=JSON.parse(fs.readFileSync(path.join(root,'evidence/content-tables/windows.json'))),raw=fs.readFileSync(path.join(root,proof.raw.file));assert.equal(sha256(raw),proof.raw.sha256);
    const {course}=JSON.parse(gunzipSync(raw));reference=course.rows;
    assert.equal(sha256(JSON.stringify(course,null,2)+'\n'),proof.native.courseSha256);assert.equal(pkg.immutableCourseSha256,proof.native.courseSha256);
    // Let the SDK read the original decimal tokens; the engine's generic
    // project JSON loader must not round them before the adapter sees them.
    writeJSON(path.join(project,'requests.json'),reference.map(row=>JSON.stringify(row.request)));
    writeJSON(path.join(project,'numbers.json'),[0.011704753153026104,Number.MIN_VALUE,Number.MAX_VALUE,0.1,-1e-200,Number.MAX_SAFE_INTEGER,2**31,-(2**31)-1].map(n=>{const b=Buffer.alloc(8);b.writeDoubleLE(n);return {json:JSON.stringify(n),bits:b.toString('hex')};}));
    return {sha256:proof.native.courseSha256,commands:course.rows.length,coverage:course.coverage};
  },compareObservations(file){
    const bytes=fs.readFileSync(file),rows=bytes.toString('utf8').trimEnd().split('\n').map(line=>JSON.parse(line));assert.equal(rows.length,reference.length);
    rows.forEach((row,i)=>sameValue(row,reference[i].expected,'command '+i+' '+reference[i].request.op));
    return {commands:rows.length,sha256:sha256(bytes),bytes:bytes.length};
  },validate(result){
    assert(result.assertions>=180);
    assert.equal(result.commands,56);assert.equal(result.operations,14);
    assert.equal(result.lore,3929);assert.equal(result.items,128);
    assert.equal(result.exact_uid,'9007199254740991');assert(result.combined&&result.disk);
    assert.deepEqual(result.continued_ids,[130,131,132]);
    for(const m of [result.metrics,result.resumed_metrics,result.progression_metrics]){
      assert(m.closed&&!m.poisoned&&!m.delivery_failed&&!m.response_pending);
      assert(m.live_bytes===0&&m.live_blocks===0&&m.peak_bytes>0&&m.peak_bytes<=32*1024*1024);
    }
  }});
