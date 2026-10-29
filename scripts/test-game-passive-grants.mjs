import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { root,listFiles,writeJSON } from './reference-utils.mjs';
const args=process.argv.slice(2);assert(args.length===0||(args.length===2&&args[0]==='--location'));
const location=JSON.parse(fs.readFileSync(path.resolve(root,args[1]??'.artifacts/adapter-location.json')));
const installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
for(const file of listFiles(path.join(root,'dist')))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale grant package: ${file}`);
const file=path.join(location.game,`balance/sdk-grants-${randomUUID()}.ts`),bytes=fs.readFileSync(path.join(root,'reference/export-passive-grants.ts'));
const output=path.join(root,'.artifacts/game-passive-grants');
fs.writeFileSync(file,bytes,{flag:'wx'});
const run=(out,stdio='inherit')=>execFileSync(process.execPath,['--import','tsx',file,out],{cwd:location.game,stdio});
try {
  run(output);
  const expected=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-nine/passive-grants.json.gz'))));
  const actual=JSON.parse(fs.readFileSync(path.join(output,'passive-grants.json')));
  assert.deepEqual(actual,expected,'Actual game grant rebuild differs from original');
  const kernel=path.join(installed,'passive-grants.js'),original=fs.readFileSync(kernel,'utf8');
  const anchor='Math.round(finite(this.#values[i] * (1 + this.#pct[i])';
  assert.equal(original.split(anchor).length,2,'Grant mutation anchor changed');
  let detected=false;
  try {
    fs.writeFileSync(kernel,original.replace(anchor,'Math.round(finite(this.#values[i] * (1 + 2 * this.#pct[i])'));
    const negative=path.join(root,'.artifacts/game-passive-grants-negative');run(negative,'pipe');
    detected=JSON.stringify(JSON.parse(fs.readFileSync(path.join(negative,'passive-grants.json'))))!==JSON.stringify(expected);
  } finally {fs.writeFileSync(kernel,original);}
  assert.ok(detected,'Game bypassed the installed grant implementation');
  const refreshFile=path.join(location.game,`balance/sdk-refresh-${randomUUID()}.ts`),refreshBytes=fs.readFileSync(path.join(root,'reference/export-passive-grant-refresh.ts'));
  fs.writeFileSync(refreshFile,refreshBytes,{flag:'wx'});
  try {
    execFileSync(process.execPath,['--import','tsx',refreshFile,output,'--sdk'],{cwd:location.game,stdio:'inherit'});
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'passive-grant-refresh.json'))),JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-nine/passive-grant-refresh.json.gz')))));
  } finally {if(fs.existsSync(refreshFile)&&fs.readFileSync(refreshFile).equals(refreshBytes))fs.unlinkSync(refreshFile);}
  writeJSON(path.join(root,'.artifacts/game-passive-grant-verification.json'),{originalRebuilds:actual.rows.length,allNodes:true,allChoiceOptions:true,contentRefreshPhases:8,installedMutationRejected:detected,packageIntegrity:location.integrity});
  console.log('Actual game rebuilds match all grant observations; installed SDK fault is detected.');
} finally {if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))fs.unlinkSync(file);}
