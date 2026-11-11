import {test} from 'node:test';
import {Challenges} from '../dist/challenges.js';
import {copyChallengeState} from '../dist/challenge-continuation.js';
import {challengeContinuationContracts} from './challenge-continuation-contracts.mjs';

challengeContinuationContracts({Challenges, copyChallengeState}, test);
