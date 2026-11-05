import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {root,sha256,writeJSON} from './reference-utils.mjs';

const [flag,file,...args]=process.argv.slice(2);assert.equal(flag,'--location');assert(file);
assert(args.length===0||(args.length===2&&args[0]==='--electron'));
const location=path.resolve(file),installed=JSON.parse(fs.readFileSync(location));assert(installed.unlockDecision);
const electron=args.length?fs.realpathSync(args[1]):createRequire(path.join(root,'.reference/package.json'))('electron');
const directory=fs.mkdtempSync(path.join(root,'.artifacts/installed-unlock-screen-'));
const game=path.join(directory,'game'),dist=path.join(directory,'dist');
const report={passed:false,directory,game,dist,archiveSha256:sha256(fs.readFileSync(installed.archive)),steps:[]};
try{
 for(const [name,script,args]of [
  ['prepare','prepare-game-renderer.mjs',['--location',location,'--output',game]],
  ['build','build-game-item-ui.mjs',['--game',game,'--output',dist]],
  ['vault','test-unlock-ui.mjs',['--game',game,'--dist',dist,'--electron',electron]],
  ['classes','test-character-rules-ui.mjs',['--game',game,'--dist',dist,'--electron',electron]],
 ]){
  const log=path.join(directory,name+'.txt'),fd=fs.openSync(log,'wx');
  try{execFileSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,stdio:['ignore',fd,fd],windowsHide:true,timeout:600000});}
  finally{fs.closeSync(fd);}
  report.steps.push({name,passed:true,logSha256:sha256(fs.readFileSync(log))});writeJSON(path.join(directory,'progress.json'),report);console.log({passed:name});
 }
 report.passed=true;
}finally{
 writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/installed-unlock-screen-latest.json'),report);console.log({passed:report.passed,directory});
}
