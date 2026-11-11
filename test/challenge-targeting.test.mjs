import test from 'node:test';
import assert from 'node:assert/strict';
import {Challenges} from '../dist/challenges.js';
import {challengeTargetingContracts} from './challenge-targeting-contracts.mjs';

test('nearest challenge target preserves stable and exceptional coordinate behavior', () => {
  assert.equal(challengeTargetingContracts({Challenges}).contracts, 18);
});
