import {runCharacterCourse} from './run-character-course-runner.mjs';
await runCharacterCourse(process.argv[2]??'owner');
