import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSupportReader} from '@hollow-wake/workshop-support-fit';

const index=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/workshop-support-fit/index.json'))));
const file=fs.openSync(new URL(import.meta.resolve('@hollow-wake/workshop-support-fit/pages.txt')),'r');
let reads=0;
try{
  const query=createSupportReader(index,range=>{
    const bytes=Buffer.alloc(range.length);
    assert.equal(fs.readSync(file,bytes,0,bytes.length,range.offset),bytes.length);
    reads++;
    return {text:bytes.toString('utf8'),sha256:createHash('sha256').update(bytes).digest('hex')};
  });
  const cases=JSON.parse(fs.readFileSync(process.argv[2]));
  for(const row of cases){
    const before=JSON.stringify(row);
    assert.deepEqual(query(row.bar,row.support),row.expected);
    assert.equal(JSON.stringify(row),before);
  }
  assert(reads>0);
  console.log(JSON.stringify({queries:cases.length,reads}));
}finally{fs.closeSync(file);}
