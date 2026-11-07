import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {publishDelivery} from '../scripts/delivery-staging.mjs';

test('a delivery is invisible until accepted; failed and conflicting builds are cleaned',async()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'hwe-delivery-staging-'));
  try{
    const target=path.join(work,'accepted');
    await assert.rejects(publishDelivery(target,async staging=>{
      assert(!fs.existsSync(target));
      fs.mkdirSync(staging);fs.writeFileSync(path.join(staging,'package.txt'),'unfinished');
      await Promise.resolve();throw new Error('verification failed');
    }),/verification failed/);
    assert.deepEqual(fs.readdirSync(work),[]);
    await publishDelivery(target,async staging=>{
      fs.mkdirSync(staging);fs.writeFileSync(path.join(staging,'package.txt'),'verified');
      await Promise.resolve();assert(!fs.existsSync(target));
    });
    assert.deepEqual(fs.readdirSync(work),['accepted']);
    assert.equal(fs.readFileSync(path.join(target,'package.txt'),'utf8'),'verified');
    await assert.rejects(publishDelivery(target,()=>assert.fail('existing delivery touched')),/Choose a new delivery folder/);
    const conflict=path.join(work,'conflict');
    await assert.rejects(publishDelivery(conflict,staging=>{
      fs.mkdirSync(staging);fs.mkdirSync(conflict);
      fs.writeFileSync(path.join(conflict,'owner.txt'),'keep');
    }),/Delivery destination appeared/);
    assert.equal(fs.readFileSync(path.join(conflict,'owner.txt'),'utf8'),'keep');
    assert.deepEqual(fs.readdirSync(work).sort(),['accepted','conflict']);
  }finally{fs.rmSync(work,{recursive:true,force:true,maxRetries:8,retryDelay:250});}
});
