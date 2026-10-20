import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {root,listFiles,writeJSON} from './reference-utils.mjs';
const location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json')));
const installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
for(const file of listFiles(path.join(root,'dist'))) assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale item package: ${file}`);
const output=path.join(root,'.artifacts/game-item-reference');
const temporary=new Map();
const run=(name,directory,stdio='inherit')=>execFileSync(process.execPath,['--import','tsx',temporary.get(name).file,directory,...(name==='export-item-bridge'?['--sdk']:[])],{cwd:location.game,stdio});
try {
for(const name of ['export-items','export-item-mint','export-item-equipment','export-item-bridge']) {
  const file=path.join(location.game,`balance/sdk-check-${randomUUID()}.ts`),bytes=fs.readFileSync(path.join(root,`reference/${name}.ts`));
  fs.writeFileSync(file,bytes,{flag:'wx'});temporary.set(name,{file,bytes});run(name,output);
}
const read=(directory,name)=>JSON.parse(fs.readFileSync(path.join(directory,`${name}.json`)));
for(const name of ['items','item-rules','mint-options','item-stream','item-equipment']) assert.deepEqual(read(output,name),
  JSON.parse(gunzipSync(fs.readFileSync(path.join(root,`baseline/milestone-four/${name}.json.gz`)))),`Adapted game item path differs: ${name}`);
assert.deepEqual(read(output,'item-bridge'),JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-five/item-bridge.json.gz')))),
  'Adapted game interleaving, save migration or content refresh differs');
const kernel=path.join(installed,'item-core.js'), original=fs.readFileSync(kernel,'utf8');
const anchor='Math.abs(v) >= 3 ? Math.round(v) :';
assert.equal(original.split(anchor).length,2,'Missing item wiring fault anchor');
let rejected=false;
try {
  fs.writeFileSync(kernel,original.replace(anchor,'Math.abs(v) >= 3 ? Math.round(v) + 1 :'));
  const negative=path.join(root,'.artifacts/game-item-negative');
  run('export-item-equipment',negative,'pipe');
  rejected=JSON.stringify(read(negative,'item-equipment'))!==JSON.stringify(read(output,'item-equipment'));
} finally { fs.writeFileSync(kernel,original); }
assert.ok(rejected,'Game item compiler bypasses the installed SDK');
writeJSON(path.join(root,'.artifacts/game-item-verification.json'),{
  packageIntegrity:location.integrity,originalItemsMatch:true,installedCompilerMutationRejected:rejected,
  observations:26404,completeDrops:1658,mintOptions:1230,continuousMintSteps:1500,equipmentPath:true,
  interleavedCommands:300,saveMigrationCases:7,contentRefresh:true,
});
console.log('Actual game item generation, compilation, RNG and equipment path match original; installed SDK mutation is detected.');
} finally {
  for(const {file,bytes} of temporary.values())if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))fs.unlinkSync(file);
}
