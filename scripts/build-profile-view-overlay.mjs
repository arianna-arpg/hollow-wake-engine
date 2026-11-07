import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workshopBundles,workspaceBridges} from './godot-crafting-bundle.mjs';
import {root,sha256,writeJSON} from './reference-utils.mjs';

// Build against the workspace package exports after npm run verify. The
// installed-package receipt binds the same dist files to the SDK archive.
const args=process.argv.slice(2);assert.equal(args.length,1,'Expected a fresh overlay output directory');
const output=path.resolve(args[0]);assert(!fs.existsSync(output));
const accepted=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/crafting-session-package-latest.json')));
assert(accepted.passed&&accepted.contracts===16);
assert.equal(sha256(fs.readFileSync(accepted.archive)),accepted.archiveSha256);
const directory=path.join(root,'adapters/godot/crafting');
const bundles=await workshopBundles(directory,workspaceBridges(root));
const sources={};
for(const input of bundles.vestiges.inputs){
  const file=path.resolve(directory,input),relative=path.relative(root,file).replaceAll('\\','/');
  assert(!relative.startsWith('../')&&!path.isAbsolute(relative));
  sources[relative]=sha256(fs.readFileSync(file));
  if(relative.startsWith('dist/'))assert.equal(sha256(fs.readFileSync(path.join(accepted.consumer,'node_modules/@hollow-wake/engine',relative))),sources[relative]);
}
for(const name of ['scripts/build-profile-view-overlay.mjs','scripts/godot-crafting-bundle.mjs','adapters/godot/crafting/crafting.gd','adapters/godot/crafting/README.md'])sources[name]=sha256(fs.readFileSync(path.join(root,name)));
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'bundle.txt'),bundles.vestiges.bytes);
fs.copyFileSync(path.join(root,'adapters/godot/crafting/crafting.gd'),path.join(output,'crafting.gd'));
fs.copyFileSync(path.join(root,'adapters/godot/crafting/README.md'),path.join(output,'README.md'));
const report={passed:true,capability:'crafting-view/v1',sdkArchiveSha256:accepted.archiveSha256,sources,
  bytes:Object.fromEntries(Object.entries(bundles).map(([key,value])=>[key,value.bytes.length])),
  files:Object.fromEntries(['bundle.txt','crafting.gd','README.md'].map(name=>[name,sha256(fs.readFileSync(path.join(output,name)))]))};
writeJSON(path.join(output,'overlay.json'),report);
console.log(report.bytes);
