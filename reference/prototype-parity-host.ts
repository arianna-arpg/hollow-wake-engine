// Host-supplied view bounds for the headless courses. Kept independently from
// combat outcomes: view-edge rebounds depend on the same host geometry.
import fs from 'node:fs';
import {fallbackRect} from '../src/engine/fourthwall';
const courses=[{id:'stationary-hero',position:{x:400,y:400},view:fallbackRect(400,400),steps:[]}];
fs.writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses})+'\n',{flag:'wx'});
