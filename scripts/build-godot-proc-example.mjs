import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {buildProcContent} from './compile-proc-content.mjs';
import {npmCli} from './npm-cli.mjs';

const [baseOption, baseDirectory, toolsOption, toolsFile] = process.argv.slice(2);
assert.deepEqual([baseOption,toolsOption],['--base','--tools'],'Supply the verified Godot addon directory and its tools JSON');
const read = file => JSON.parse(fs.readFileSync(file));
const hash = file => sha256(fs.readFileSync(file));
const base = read(path.join(baseDirectory,'verification.json')), tools = read(toolsFile);
assert(base.passed && base.platform === process.platform && base.arch === 'x64' && base.release?.passed && base.editor?.passed);
assert(['win32','linux'].includes(process.platform));
const source = path.join(root,'adapters/godot/ward-example');
const baseArchive = path.join(baseDirectory,'hollow-wake-godot-experimental.zip');
assert.equal(hash(baseArchive),base.addon.archiveSha256);
for(const file of ['experiments/godot-native/host.cpp','experiments/godot-native/hollow_wake.gdextension',
  'experiments/embedded-js/native/hwe_embedded.h','LICENSE.md','NOTICE.md'])assert.equal(hash(path.join(root,file)),base.sources[file],file);

const directory = fs.mkdtempSync(path.join(root,'.artifacts/godot-proc-addon-'));
const consumer = path.join(directory,'consumer'), extra = path.join(directory,'extra');
fs.mkdirSync(consumer);fs.mkdirSync(extra);
const npm = npmCli();
function runNpm(cwd,...args) {
  return execFileSync(process.execPath,[npm,...args,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd,encoding:'utf8',windowsHide:true});
}
function pack(cwd) {
  return JSON.parse(runNpm(cwd,'pack','--json','--ignore-scripts','--pack-destination',directory))[0];
}
const contentDir=path.join(directory,'content');buildProcContent(contentDir);
const sdkArchive=pack(root),contentArchive=pack(contentDir);
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
runNpm(consumer,'install',path.join(directory,sdkArchive.filename),path.join(directory,contentArchive.filename),
  '--offline','--ignore-scripts','--no-audit','--no-fund');
const dataDir=path.join(consumer,'node_modules/@hollow-wake/proc-content');
const manifest=read(path.join(dataDir,'manifest.json'));
for(const [file,entry] of Object.entries(manifest.files))assert.equal(hash(path.join(dataDir,file)),entry.sha256,file);
const original=read(path.join(dataDir,'procs.json')), stats=read(path.join(dataDir,'stats.json'));
assert.equal(original.contentId,manifest.contentId);
const chosen=original.procs.filter(p=>p.id==='desperate_ward');
assert.equal(chosen.length,1);assert.equal(chosen[0].effect.type,'ward');
const riders=original.riders.filter(r=>(Array.isArray(r.proc)?r.proc:[r.proc]).includes(chosen[0].id));
assert.equal(riders.length,0,'The sample needs a cast service if this talent gains riders');
const selection={schemaVersion:original.schemaVersion,capability:original.capability,rules:original.rules,procs:chosen,riders};
const selectedStats=Object.fromEntries(['proc_desperate_ward','procPower_desperate_ward','procDepth','luck'].map(id=>{
  assert(stats[id],id);return [id,stats[id]];
}));
const contentId='hollow-wake-ward:sha256:'+sha256(JSON.stringify(selection));
writeJSON(path.join(extra,'content.json'),{procs:{...selection,contentId},stats:selectedStats});
const example=path.join(consumer,'node_modules/@hollow-wake/engine/examples/proc-delivery.mjs');
fs.copyFileSync(example,path.join(consumer,'proc-delivery.mjs'));
fs.copyFileSync(path.join(source,'session.mjs'),path.join(consumer,'session.mjs'));
const bundle=path.join(extra,'bundle.txt');
const result=await build({absWorkingDir:consumer, entryPoints:['session.mjs'], bundle:true, format:'iife', platform:'neutral',
  globalName:'HollowWakeSession', target:'es2022', minify:true, outfile:bundle, metafile:true});
assert(Object.values(result.metafile.outputs).every(o=>o.imports.length===0));
const inputs=Object.keys(result.metafile.inputs);
assert(inputs.includes('node_modules/@hollow-wake/engine/dist/proc-delivery.js'));
assert(inputs.every(file=>file==='session.mjs'||file==='proc-delivery.mjs'||file.startsWith('node_modules/@hollow-wake/engine/dist/')));
const bundleBytes=fs.statSync(bundle).size,contentBytes=fs.statSync(path.join(extra,'content.json')).size;
assert(bundleBytes<=32*1024&&contentBytes<=2*1024,'Ward example exceeds its asset budget');
for(const file of ['ward.gd','README.md'])fs.copyFileSync(path.join(source,file),path.join(extra,file));
const files=Object.fromEntries(['bundle.txt','content.json','ward.gd','README.md'].map(file=>[file,hash(path.join(extra,file))]));
writeJSON(path.join(extra,'manifest.json'),{schemaVersion:1,capability:'hollow-wake/desperate-ward-example-v1',baseSha256:base.addon.archiveSha256,
  procPack:original.contentId,selection:contentId,runtimeArchive:sdkArchive.integrity,contentArchive:contentArchive.integrity,files});
const archive=path.join(directory,'hollow-wake-godot-procs-'+(process.platform==='win32'?'windows':'linux')+'-x64.zip');
writeJSON(path.join(directory,'base-files.json'),base.addon);
execFileSync(tools.python,['-I',path.join(root,'scripts/godot-proc-example-archive.py'),'assemble',baseArchive,path.join(directory,'base-files.json'),extra,archive],{windowsHide:true});
const report={passed:true,directory,platform:process.platform,arch:process.arch,archive,archiveSha256:hash(archive),archiveBytes:fs.statSync(archive).size,
  baseProofSha256:hash(path.join(baseDirectory,'verification.json')),sourceContentId:original.contentId,contentId,bundleBytes,contentBytes,
  files,inputs,sdkArchive:sdkArchive.integrity,contentArchive:contentArchive.integrity};
writeJSON(path.join(directory,'package.json'),report);
writeJSON(path.join(root,'.artifacts/godot-proc-addon-latest.json'),{directory,receipt:path.join(directory,'package.json')});
console.log({archive,bytes:report.archiveBytes,bundleBytes,contentBytes});
