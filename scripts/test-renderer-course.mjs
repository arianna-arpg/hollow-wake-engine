import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';

/** Replay a hidden renderer course against a fresh save profile. */
export function testRendererCourse({name,course,expected},args=process.argv.slice(2)) {
  const [gameFlag,gameArg,distFlag,distArg,electronFlag,electronArg,...extra]=args;
  assert.deepEqual([gameFlag,distFlag,electronFlag],['--game','--dist','--electron']);
  assert(extra.length===0||(extra.length===2&&extra[0]==='--compare'));
  const game=fs.realpathSync(gameArg),dist=fs.realpathSync(distArg),electron=fs.realpathSync(electronArg);
  assert(fs.existsSync(path.join(dist,'index.html')));
  fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
  const directory=fs.mkdtempSync(path.join(root,'.artifacts/'+name+'-'));
  fs.cpSync(path.join(game,'launcher'),path.join(directory,'launcher'),{recursive:true});
  course=path.resolve(root,course);
  const balance=path.join(directory,'balance'),script=path.join(balance,name+'.cjs');
  fs.mkdirSync(balance);fs.copyFileSync(course,script);
  const log=path.join(directory,'renderer.txt'),fd=fs.openSync(log,'wx');let passed=false;
  try{
    const result=spawnSync(electron,[script],{cwd:directory,stdio:['ignore',fd,fd],timeout:150000,windowsHide:true,
      env:{...process.env,HOLLOW_WAKE_QA_DIST:dist,HOLLOW_WAKE_QA_REPORTS:directory}});
    assert(!result.error&&!result.signal);assert.equal(result.status,0,name+' failed: '+log);
    const bytes=fs.readFileSync(path.join(directory,'observations.json'));
    if(expected)assert(bytes.equals(fs.readFileSync(path.join(root,expected))),'Renderer differs from the frozen original');
    if(extra.length)assert(bytes.equals(fs.readFileSync(path.resolve(extra[1]))),'Renderer changed the preceding observations');
    passed=true;
  }finally{
    fs.closeSync(fd);
    const observed=path.join(directory,'observations.json');
    writeJSON(path.join(directory,'verification.json'),{passed,directory,compared:Boolean(expected||extra.length),courseSha256:sha256(fs.readFileSync(course)),
      observationsSha256:fs.existsSync(observed)?sha256(fs.readFileSync(observed)):null,logSha256:sha256(fs.readFileSync(log))});
    console.log({passed,directory});
  }
}
