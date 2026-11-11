import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {sha256} from './reference-utils.mjs';

/** Load immutable accepted observations; normal checks never recapture them. */
export function challengeReference(read) {
  const manifest = JSON.parse(read('baseline/challenges/acceptance.json'));
  assert(manifest.originalOnly && manifest.passed && manifest.restored);
  assert.equal(manifest.sourceLockSha256, sha256(read('baseline/source-lock.json')));
  const source = read(manifest.source).toString(), packed = read('baseline/challenges/observations.json.gz');
  const expected = gunzipSync(packed), logs = read('baseline/challenges/original.logs.json.gz');
  assert.equal(sha256(source), manifest.sourceSha256); assert.equal(sha256(packed), manifest.gzipSha256);
  assert.equal(sha256(expected), manifest.sha256); assert.equal(sha256(logs), manifest.logsSha256);
  assert.equal(manifest.observations, 61); assert.equal(JSON.parse(expected).observations.length, manifest.observations);
  return {manifest, source, expected, log: JSON.parse(gunzipSync(logs))['original-1']};
}
