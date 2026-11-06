import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root} from '../scripts/reference-utils.mjs';

test('a surviving fault cleans its scratch directory and preserves the real runtime',t=>{
  const base=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(base,'hwe-teardown-'));
  const suite='teardown-'+randomUUID(),receipt=path.join(root,'.artifacts',suite+'-mutation-failure.json');
  t.after(()=>{
    if(fs.existsSync(receipt))fs.unlinkSync(receipt);
    assert.equal(path.dirname(fs.realpathSync(dir)),base);fs.rmSync(dir,{recursive:true});
  });
  const target='dist/ready-cooldown-bank.js',bytes=fs.readFileSync(path.join(root,target));
  const runner=pathToFileURL(path.join(root,'scripts/mutation-fixture.mjs')).href;
  const script=`import {readMutationSource,runMutationFixture} from ${JSON.stringify(runner)};
    runMutationFixture({suite:${JSON.stringify(suite)},testFile:'test/ready-cooldown-bank.test.mjs'},run=>{
      run('unchanged-behavior',${JSON.stringify(target)},readMutationSource(${JSON.stringify(target)})+'\\n// same behavior');
    });`;
  const failed=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:dir,encoding:'utf8',windowsHide:true,
    env:{...process.env,TEMP:dir,TMP:dir,TMPDIR:dir,NODE_DISABLE_COMPILE_CACHE:'1'}});
  assert(!failed.error);assert.equal(failed.status,1);assert.match(failed.stderr,/unchanged-behavior survived/);
  assert.equal(JSON.parse(fs.readFileSync(receipt)).passed,false);
  assert.deepEqual(fs.readdirSync(dir),[]);assert(fs.readFileSync(path.join(root,target)).equals(bytes));
});
