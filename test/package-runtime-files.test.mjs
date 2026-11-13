import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,sha256} from '../scripts/reference-utils.mjs';
import {packageRuntimeFiles,packageRuntimeSnapshot} from '../scripts/package-runtime-files.mjs';

test('installed integrity uses the source packaging contract and rejects leaked, missing or changed modules',()=>{
  const parent=fs.realpathSync(path.join(root,'.artifacts'));
  const work=fs.mkdtempSync(path.join(parent,'package-manifest-test-'));
  try{
    fs.mkdirSync(path.join(work,'dist'));
    const manifest={files:['dist','!dist/private-owner.*','content'],exports:{'.':{import:'./dist/index.js',types:'./dist/index.d.ts'}}};
    const save=()=>fs.writeFileSync(path.join(work,'package.json'),JSON.stringify(manifest));save();
    const data={'index.js':'export const value=1;','index.d.ts':'export declare const value=1;',
      'shared-core.js':'export const shared=true;','private-owner.js':'private owner','private-owner.d.ts':'private types'};
    for(const[file,body]of Object.entries(data))fs.writeFileSync(path.join(work,'dist',file),body);
    assert.deepEqual(packageRuntimeFiles(work),['index.d.ts','index.js','shared-core.js']);
    const expected=Object.fromEntries(['index.d.ts','index.js','shared-core.js'].map(file=>[file,sha256(data[file])]));
    assert.deepEqual(packageRuntimeSnapshot(work),expected);
    for(const fault of [{...expected,'private-owner.js':sha256(data['private-owner.js'])},
      Object.fromEntries(Object.entries(expected).filter(([file])=>file!=='shared-core.js')),
      {...expected,'index.js':sha256('stale build')}])assert.throws(()=>assert.deepEqual(fault,packageRuntimeSnapshot(work)),{code:'ERR_ASSERTION'});
    manifest.exports.internal='./dist/private-owner.js';save();
    assert.throws(()=>packageRuntimeFiles(work),/Public export excluded/);
    delete manifest.exports.internal;manifest.files.push('!dist/not-built.*');save();
    assert.throws(()=>packageRuntimeFiles(work),/Unbuilt internal module/);
    manifest.files.pop();manifest.files.push('!dist/nested/**');save();
    assert.throws(()=>packageRuntimeFiles(work),/Unsupported runtime packaging rule/);
  }finally{
    assert.equal(path.dirname(fs.realpathSync(work)),parent);
    fs.rmSync(work,{recursive:true,maxRetries:3});
  }
});
