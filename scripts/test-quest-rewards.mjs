import assert from 'node:assert/strict';import {runQuestRewards} from './quest-reward-course-runner.mjs';
const modes=process.argv.slice(2);assert(modes.length>0,'Select an explicit quest course');for(const mode of modes)await runQuestRewards(mode);
