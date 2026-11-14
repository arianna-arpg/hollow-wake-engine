import {runCharacterComposition} from './character-composition-runner.mjs';
await runCharacterComposition({extensions:['test/character-composition/build-reuse.mjs'],beforeFinish:'checkAccountBuildReuse',reportFields:{accountBuildReuseOutcomes:3}});
