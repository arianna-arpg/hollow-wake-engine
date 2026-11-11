import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {sha256} from './reference-utils.mjs';

export function challengeContinuationReference(read) {
  const base = 'baseline/challenge-continuation';
  const manifest = JSON.parse(read(base + '/acceptance.json'));
  assert(manifest.passed && manifest.originalOnly && manifest.restored);
  const source = read(manifest.source).toString(), packed = read(base + '/observations.json.gz');
  const logs = read(base + '/original.logs.json.gz'), expected = gunzipSync(packed);
  assert.equal(sha256(read('baseline/source-lock.json')), manifest.sourceLockSha256);
  assert.equal(sha256(source), manifest.sourceSha256); assert.equal(sha256(packed), manifest.gzipSha256);
  assert.equal(sha256(expected), manifest.sha256); assert.equal(sha256(logs), manifest.logsSha256);
  assert.equal(manifest.observations, 13); assert.equal(JSON.parse(expected).observations.length, 13);
  return {manifest, source, expected, log: JSON.parse(gunzipSync(logs))['original-1']};
}
