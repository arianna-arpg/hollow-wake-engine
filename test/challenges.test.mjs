import test from 'node:test';
import assert from 'node:assert/strict';
import {Challenges} from '../dist/challenges.js';
import {ChallengeContent} from '../dist/challenge-content.js';
import {challengeContracts} from './challenge-contracts.mjs';

test('independent challenge controller and content contracts', () => {
  assert.equal(challengeContracts({Challenges, ChallengeContent}).contracts, 20);
});
