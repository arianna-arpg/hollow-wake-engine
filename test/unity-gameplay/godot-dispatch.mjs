import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from '../../scripts/reference-utils.mjs';
import {workshopBundles,workspaceBridges} from '../../scripts/godot-crafting-bundle.mjs';

// Supply a disposable directory with the accepted crafting content.json,
// inspection.json and manifest.json. Only its bundle.txt is replaced.
const [assets,output,...rest]=process.argv.slice(2);
assert(assets&&output&&!rest.length&&!fs.existsSync(output));
const dir=fs.realpathSync(assets);
const bundles=await workshopBundles(path.join(root,'adapters/godot/crafting'),workspaceBridges(root));
fs.writeFileSync(path.join(dir,'bundle.txt'),bundles.vestiges.bytes);
const checked=spawnSync(process.execPath,[path.join(root,'test/godot-crafting/bundle-contract.mjs'),dir],{encoding:'utf8',windowsHide:true});
assert.equal(checked.status,0,checked.stdout+checked.stderr);
const proof=JSON.parse(fs.readFileSync(path.join(root,'evidence/content-tables/windows.json')));
const bytes=fs.readFileSync(path.join(root,proof.raw.file));
assert.equal(sha256(bytes),proof.raw.sha256);
const {course}=JSON.parse(gunzipSync(bytes));
const context=vm.createContext({input:fs.readFileSync(path.join(dir,'content.json'),'utf8')});
vm.runInContext('Math.random=()=>{throw new Error("ambient random")}',context);
vm.runInContext(Buffer.from(bundles.vestiges.bytes).toString('utf8'),context);
vm.runInContext('var host=HollowWakeSession.create(JSON.parse(input))',context);
for(const {request,expected}of course.rows){
  context.input=JSON.stringify(request);
  const text=vm.runInContext('(()=>{const r=HollowWakeSession.dispatch(host,["parse",input]);if(!r.ok)throw Error("parse");const reply=HollowWakeSession.dispatch(host,["command",r.value]);return HollowWakeSession.dispatch(host,["format",reply]).text;})()',context);
  assert.deepEqual(JSON.parse(text),expected);
}
writeJSON(output,{passed:true,originalCommands:course.rows.length,capabilities:JSON.parse(checked.stdout),
  bundleBytes:bundles.vestiges.bytes.length,bundleSha256:sha256(bundles.vestiges.bytes),
  scope:'Packaged-content replay of current Godot numeric wire and shared dispatch; not a new editor/native run.'});
console.log({passed:true,originalCommands:course.rows.length,bundleBytes:bundles.vestiges.bytes.length});
