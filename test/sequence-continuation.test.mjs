import test from 'node:test';
import {AttackSequences} from '../dist/attack-sequences.js';
import {copyAttackSequenceState} from '../dist/attack-sequence-continuation.js';
import {sequenceContinuationContracts} from './sequence-continuation-contracts.mjs';
sequenceContinuationContracts({AttackSequences,copyAttackSequenceState},test);
