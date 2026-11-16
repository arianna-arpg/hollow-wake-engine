import {writeFileSync} from 'node:fs';
import {bootSimEngine} from '../src/sim/arena';
import {WORN_THRONGS} from '../src/engine/throng';
bootSimEngine();
writeFileSync(process.argv[2], JSON.stringify({originalOnly: true, wornThrongs: WORN_THRONGS,
  courses: [{name: 'worn-throng-registrations', ids: Object.keys(WORN_THRONGS)}]}));
