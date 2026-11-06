import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';

const [location,electron,output,...extra]=process.argv.slice(2);
assert(location&&electron&&output&&!extra.length&&!fs.existsSync(output),'PREPARED_LOCATION ELECTRON NEW_REPORT');
const loc=JSON.parse(fs.readFileSync(location));assert(loc.skillRackDecision);
const game=fs.realpathSync(loc.game),artifacts=fs.realpathSync(path.join(root,'.artifacts'));
assert.equal(path.dirname(game),artifacts,'UI test needs a disposable prepared game');
assert(!fs.existsSync(path.join(game,'.git')),'Use a disposable adapter, never a worktree');
assert(fs.readFileSync(path.join(game,'node_modules/@hollow-wake/engine/dist/skill-rack.js')).equals(fs.readFileSync(path.join(root,'dist/skill-rack.js'))));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'baseline/renderer-shell.json')));
const capsule=fs.readFileSync(path.join(root,manifest.capsule));assert.equal(sha256(capsule),manifest.sha256);
const shell=JSON.parse(gunzipSync(capsule)),files=Object.keys(shell).sort();
assert.deepEqual(files,['index.html','launcher.config.json','public/favicon.ico','showcase.html','vite.config.ts']);
const work=fs.mkdtempSync(path.join(os.tmpdir(),'hwe-rack-ui-'));
const wrote=[],made=[];
function create(relative,bytes){
  const target=path.join(game,relative),parent=path.dirname(target);
  assert(target.startsWith(game+path.sep));if(!fs.existsSync(parent)){fs.mkdirSync(parent);made.push(parent);}
  assert.equal(fs.realpathSync(parent),parent);
  fs.writeFileSync(target,bytes,{flag:'wx'});wrote.push([target,bytes]);return target;
}
try{
  for(const name of files){
    const bytes=Buffer.from(shell[name],'base64');assert.equal(sha256(bytes),manifest.files[name].sha256);
    create(name,bytes);
  }
  const harness=create('balance/'+path.basename(work)+'.cjs',fs.readFileSync(path.join(root,'adapters/hollow-wake/skill-rack-ui.cjs')));
  const env={...process.env,TEMP:work,TMP:work,HWE_RACK_UI:work,NODE_COMPILE_CACHE:path.join(work,'node-cache')};
  execFileSync(process.execPath,[path.join(game,'node_modules/vite/bin/vite.js'),'build','--outDir',path.join(work,'dist')],{cwd:game,env,stdio:'pipe',windowsHide:true,timeout:180000});
  execFileSync(path.resolve(electron),[harness],{cwd:game,env,stdio:'inherit',windowsHide:true,timeout:90000});
  const report=JSON.parse(fs.readFileSync(path.join(work,'result.json')));assert(report.passed);
  writeJSON(path.resolve(output),{...report,archiveSha256:sha256(fs.readFileSync(loc.archive)),harnessSha256:sha256(fs.readFileSync(harness)),
    scope:'Mounted Inventory controls with programmatic click events in a hidden desktop renderer.'});
  console.log({passed:true,level:report.upgrade.level,full:report.full,intents:report.retired.intents});
}finally{
  for(const [target,bytes] of wrote)if(fs.existsSync(target)&&fs.readFileSync(target).equals(bytes))fs.unlinkSync(target);
  for(const dir of made.reverse())if(fs.existsSync(dir)&&!fs.readdirSync(dir).length)fs.rmdirSync(dir);
  assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(os.tmpdir()));
  fs.rmSync(work,{recursive:true,maxRetries:4,retryDelay:250});
}
