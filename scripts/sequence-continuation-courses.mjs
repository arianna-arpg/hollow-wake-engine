import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {sha256} from './reference-utils.mjs';

// Shared readers only: accepted observations are never regenerated here.
export function sequenceContinuationCourses(read) {
  const lockHash = sha256(read('baseline/source-lock.json'));
  const courses = [];
  for (const [name, count] of [['cast', 5], ['flight', 6], ['recovery', 9], ['deferred', 8]]) {
    const base = 'baseline/sequence-continuation-' + name;
    const manifest = JSON.parse(read(base + '/acceptance.json'));
    const source = read(manifest.source).toString();
    const packed = read(base + '/observations.json.gz');
    const logBytes = read(base + '/original.logs.json.gz');
    const expected = gunzipSync(packed);
    assert(manifest.originalOnly && manifest.passed && manifest.restored);
    assert.equal(manifest.sourceLockSha256, lockHash);
    assert.equal(manifest.sourceSha256, sha256(source));
    assert.equal(manifest.gzipSha256, sha256(packed));
    assert.equal(manifest.sha256, sha256(expected));
    assert.equal(manifest.logsSha256, sha256(logBytes));
    assert.equal(manifest.observations, count);
    courses.push({name: 'original-' + name, source, expected,
      log: JSON.parse(gunzipSync(logBytes))['original-1'], count});
  }
  for (const [name, label, contexts, stages] of [
    ['cast', 'component', 3, 21], ['flight', 'flight', 2, 14],
    ['recovery', 'recovery', 4, 20], ['deferred', 'deferred', 3, 15],
  ]) {
    courses.push({name: 'private-' + name,
      source: read('test/sequence-continuation-' + name + '-game.ts').toString(),
      log: {stdout: `Sequence private ${label} continuation: ${contexts} courses, ${stages} stages passed\n`,
        stderr: courses.find(c => c.name === 'original-' + name).log.stderr}, contexts, stages});
  }
  return courses;
}
