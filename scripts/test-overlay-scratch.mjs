import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {withOverlayScratch} from './overlay-scratch.mjs';
for(const fail of [false,true]){
  let created;const marker=new Error('deliberate source check failure');
  const check=()=>withOverlayScratch('teardown-check',directory=>{
    created=directory;fs.mkdirSync(path.join(directory,'nested'));fs.writeFileSync(path.join(directory,'nested','source.ts'),'source');
    if(fail)throw marker;return 37;
  });
  if(fail)assert.throws(check,error=>error===marker);else assert.equal(check(),37);
  assert(created&&!fs.existsSync(created),'Owned source copies leaked');
}
assert.throws(()=>withOverlayScratch('../invalid',()=>{}));
console.log({passed:true,successAndFailureCleanup:true});
