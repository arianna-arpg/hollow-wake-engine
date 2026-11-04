import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {root} from './reference-utils.mjs';
import {testRendererCourse} from './test-renderer-course.mjs';

const [locationFlag,locationArg,...args]=process.argv.slice(2);
assert(locationFlag==='--location'&&locationArg);
assert(args.length===0 || (args.length===2 && args[0]==='--electron'));
const location=path.resolve(locationArg),receipt=JSON.parse(fs.readFileSync(location));
assert(receipt.characterRulesDecision,'Use the prepared character rules adapter');
const electron=args.length?fs.realpathSync(args[1]):createRequire(path.join(root,'.reference/package.json'))('electron');
const dir=fs.mkdtempSync(path.join(root,'.artifacts/character-game-renderer-'));
const game=path.join(dir,'game'),dist=path.join(dir,'dist');
function run(script,args){execFileSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,stdio:'inherit',windowsHide:true});}
run('prepare-game-renderer.mjs',['--location',location,'--output',game]);
run('build-game-item-ui.mjs',['--game',game,'--output',dist]);
testRendererCourse({name:'character-rules-ui',course:'adapters/hollow-wake/character-rules-ui.cjs',expected:'baseline/character-rules/screen.json'},
  ['--game',game,'--dist',dist,'--electron',electron]);
