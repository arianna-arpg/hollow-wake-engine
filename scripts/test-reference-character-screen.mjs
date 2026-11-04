import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {root,materialize,sha256,verifyReference} from './reference-utils.mjs';
import {testRendererCourse} from './test-renderer-course.mjs';

const args=process.argv.slice(2);
assert(args.length===0 || (args.length===2 && args[0]==='--electron'));
const ref=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const electron=args.length?fs.realpathSync(args[1]):createRequire(path.join(ref,'package.json'))('electron');
const baseline=path.join(root,'baseline'),manifest=JSON.parse(fs.readFileSync(path.join(baseline,'renderer-shell.json')));
assert.equal(manifest.decision,'preserved-hollow-wake-renderer-shell/v1');
assert.equal(manifest.capsule,'baseline/renderer-shell.json.gz');
const compressed=fs.readFileSync(path.join(root,manifest.capsule));
assert.equal(sha256(compressed),manifest.sha256);
const files=JSON.parse(gunzipSync(compressed));
assert.deepEqual(Object.keys(files).sort(),['index.html','launcher.config.json','public/favicon.ico','showcase.html','vite.config.ts']);
assert.deepEqual(Object.keys(manifest.files).sort(),Object.keys(files).sort());
verifyReference(ref,lock);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const dir=fs.mkdtempSync(path.join(root,'.artifacts/original-character-screen-'));
const game=path.join(dir,'game'),dist=path.join(dir,'dist');
materialize(null,lock,game);
verifyReference(game,lock);
for(const [file,encoded] of Object.entries(files)){
  const bytes=Buffer.from(encoded,'base64'),target=path.join(game,file);
  assert.equal(bytes.toString('base64'),encoded);
  assert.equal(bytes.length,manifest.files[file].bytes);
  assert.equal(sha256(bytes),manifest.files[file].sha256,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});
}
fs.symlinkSync(fs.realpathSync(path.join(ref,'node_modules')),path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
try {
  execFileSync(process.execPath,[path.join(root,'scripts/build-game-item-ui.mjs'),'--game',game,'--output',dist],{cwd:root,stdio:'inherit',windowsHide:true});
  testRendererCourse({name:'character-rules-ui',course:'adapters/hollow-wake/character-rules-ui.cjs',expected:'baseline/character-rules/screen.json'},
    ['--game',game,'--dist',dist,'--electron',electron]);
} finally {
  verifyReference(game,lock);
  verifyReference(ref,lock);
}
