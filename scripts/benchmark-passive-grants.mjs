import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root,verifyReference,listFiles,writeJSON } from './reference-utils.mjs';
const location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json')));
const installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
for(const file of listFiles(path.join(root,'dist')))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale benchmark package: ${file}`);
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),reference=path.join(root,'.reference');
verifyReference(reference,lock);
const bytes=fs.readFileSync(path.join(root,'reference/benchmark-passive-grants.ts')),results={};
for(const [name,game] of [['original',reference],['adapter',location.game]]) {
  const target=path.join(game,`balance/sdk-grant-benchmark-${randomUUID()}.ts`),out=path.join(root,`.artifacts/grant-benchmark-${name}.json`);
  fs.writeFileSync(target,bytes,{flag:'wx'});
  try {execFileSync(process.execPath,['--import','tsx',target,root,out],{cwd:game,stdio:'inherit'});results[name]=JSON.parse(fs.readFileSync(out));}
  finally {if(fs.readFileSync(target).equals(bytes))fs.unlinkSync(target);}
}
assert.equal(results.original.derivedSha256,results.adapter.derivedSha256,'Timed inputs must have identical derived outputs');
assert.equal(results.original.checksum,results.adapter.checksum);
verifyReference(reference,lock);
writeJSON(path.join(root,'.artifacts/passive-grant-benchmark.json'),results);
console.log(`Original ${results.original.medianMs.toFixed(3)} ms; adapter ${results.adapter.medianMs.toFixed(3)} ms for ${results.original.rebuildsPerSample} complete character rebuilds.`);
