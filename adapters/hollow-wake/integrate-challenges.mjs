import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root, sha256} from '../../scripts/reference-utils.mjs';

const boundary = JSON.parse(fs.readFileSync(path.join(root, 'adapters/hollow-wake/challenge-boundary.json')));
export const challengeFiles = Object.keys(boundary.files);
export const challengesDecision = 'Delegate challenge state, timed devices, effects and content assembly; host retains time, randomness, bodies, geometry, delivery and presentation.';
export function renderChallengeFile(file, input) {
  const expected = boundary.files[file]; assert(expected, 'Unknown challenge boundary');
  assert.equal(sha256(input.replaceAll('\r\n', '\n')), expected.inputSha256, 'Unreviewed challenge source: ' + file);
  const output = fs.readFileSync(path.join(root, expected.adapter), 'utf8').replaceAll('\r\n', '\n');
  return input.includes('\r\n') ? output.replaceAll('\n', '\r\n') : output;
}
export function integrateChallenges(game, write = true) {
  const edits = challengeFiles.map(file => ({file, output: renderChallengeFile(file, fs.readFileSync(path.join(game, file), 'utf8'))}));
  if (write) for (const {file, output} of edits) fs.writeFileSync(path.join(game, file), output);
  return {files: [...challengeFiles], decision: challengesDecision};
}
