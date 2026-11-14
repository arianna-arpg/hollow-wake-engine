import assert from 'node:assert/strict';import {runQuestRewardTypes} from './quest-reward-type-tools.mjs';
assert.equal(process.argv.length,3);runQuestRewardTypes(process.argv[2]);
