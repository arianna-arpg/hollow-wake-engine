import {testRendererCourse} from './test-renderer-course.mjs';

testRendererCourse({
  name:'character-rules-ui',
  course:'adapters/hollow-wake/character-rules-ui.cjs',
  expected:'baseline/character-rules/screen.json'
});
