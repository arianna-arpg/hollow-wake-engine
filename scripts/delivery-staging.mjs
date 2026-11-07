import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/** Build privately on the destination filesystem, then expose one complete directory. */
export async function publishDelivery(destination, build) {
  const target=path.resolve(destination);
  assert(!fs.existsSync(target),'Choose a new delivery folder');
  const owner=fs.mkdtempSync(path.join(path.dirname(target),'.hwe-delivery-'));
  const staging=path.join(owner,'delivery');
  try{
    await build(staging);
    assert(fs.statSync(staging).isDirectory(),'Completed delivery directory required');
    assert(!fs.existsSync(target),'Delivery destination appeared during verification');
    fs.renameSync(staging,target);
  }finally{
    fs.rmSync(owner,{recursive:true,force:true,maxRetries:8,retryDelay:250});
  }
}
