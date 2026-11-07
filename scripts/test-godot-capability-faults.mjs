import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {craftingBundle} from './godot-crafting-bundle.mjs';
import {root,sha256,writeJSON} from './reference-utils.mjs';

const [assetFlag,assets,consumerFlag,consumer,outFlag,output,...rest]=process.argv.slice(2);
assert.deepEqual([assetFlag,consumerFlag,outFlag,rest.length],['--assets','--consumer','--out',0]);
assert(!fs.existsSync(output),'Choose a new proof file');
const file=path.join(assets,'bundle.txt'),original=fs.readFileSync(file);
const manifest=path.join(assets,'manifest.json'),manifestBefore=fs.readFileSync(manifest);
const temp=fs.mkdtempSync(path.join(path.dirname(path.resolve(output)),'capability-faults-'));
const runs=[];
function check(name,variant,expected){
  const result=spawnSync(process.execPath,[path.join(root,'test/godot-crafting/bundle-contract.mjs'),assets,...(variant?[variant]:[])],
    {windowsHide:true,encoding:'utf8',timeout:60000});
  assert(!result.error&&!result.signal,name+': '+String(result.error??result.signal));
  const text=result.stdout+result.stderr;
  assert.equal(result.status,expected?1:0,name+': '+text);
  if(expected)assert(text.includes('AssertionError')&&text.includes(expected),name+': '+text);
  else assert(JSON.parse(result.stdout.trim()).passed);
  runs.push({name,status:result.status,assertion:expected??null,output:text,sha256:sha256(text)});
}
try {
  check('control-before');
  const support=await craftingBundle(path.resolve(consumer),'supports');
  const prior=path.join(temp,'support-only.txt');fs.writeFileSync(prior,support.bytes);
  check('support-only-factory',prior,'vestige grant available');
  const needle='"view-inlay"',text=original.toString('utf8');
  assert.equal(text.split(needle).length,2,'unique inlay dispatch');
  const missing=path.join(temp,'missing-preview.txt');fs.writeFileSync(missing,text.replace(needle,'"disabled-inlay-preview"'));
  check('missing-inlay-preview',missing,'inlay preview available');
  assert(fs.readFileSync(file).equals(original)&&fs.readFileSync(manifest).equals(manifestBefore),'build assets preserved');
  check('control-after');
  writeJSON(output,{passed:true,bundleSha256:sha256(original),manifestSha256:sha256(manifestBefore),runs,sourcePreserved:true});
  console.log({passed:true,faults:2,bundleSha256:sha256(original)});
} finally {
  // This private directory holds only the two fault bundles created above.
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:250});
}
