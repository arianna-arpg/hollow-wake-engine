// Materialize the retained render shell in a fresh copy of a prepared adapter.
// The original game, supplied adapter and installed SDK are read-only inputs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert(['--location','--output'].includes(args[i])&&args[i+1]);assert(!options[args[i]]);options[args[i]]=args[i+1];}
const location=JSON.parse(fs.readFileSync(path.resolve(root,options['--location']??'.artifacts/adapter-location.json')));
assert(location.game&&location.tooling&&location.readyBankDecision,'Use a prepared SDK game adapter location');
const sourceGame=fs.realpathSync(location.game),requested=path.resolve(root,options['--output']??'.artifacts/game-renderer');
const game=path.join(fs.realpathSync(path.dirname(requested)),path.basename(requested));
assert(!fs.lstatSync(game,{throwIfNoEntry:false}),'Refusing to replace an existing renderer project');
const relative=path.relative(sourceGame,game);assert(relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Output must be outside the input game');
const manifestBytes=fs.readFileSync(path.join(root,'baseline/renderer-shell.json')),manifest=JSON.parse(manifestBytes);
assert.equal(manifest.schemaVersion,1);assert.equal(manifest.decision,'preserved-hollow-wake-renderer-shell/v1');assert.equal(manifest.capsule,'baseline/renderer-shell.json.gz');
const compressed=fs.readFileSync(path.join(root,manifest.capsule));assert.equal(sha256(compressed),manifest.sha256);
const shell=JSON.parse(gunzipSync(compressed)),names=['index.html','launcher.config.json','public/favicon.ico','showcase.html','vite.config.ts'];assert.deepEqual(Object.keys(shell).sort(),names);assert.deepEqual(Object.keys(manifest.files).sort(),names);
const decoded={};for(const name of names){const bytes=Buffer.from(shell[name],'base64');assert.equal(bytes.toString('base64'),shell[name]);assert.equal(sha256(bytes),manifest.files[name].sha256);assert.equal(bytes.length,manifest.files[name].bytes);assert(!fs.existsSync(path.join(sourceGame,name)),'Input already contains a renderer shell: '+name);decoded[name]=bytes;}
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(f=>[f,sha256(fs.readFileSync(path.join(dir,f)))]));
const dependencies=fs.realpathSync(path.join(sourceGame,'node_modules')),packageDir=fs.realpathSync(path.join(dependencies,'@hollow-wake/engine')),source=snapshot(path.join(sourceGame,'src')),pkg=snapshot(packageDir),runtime=snapshot(path.join(packageDir,'dist'));
assert.equal(fs.realpathSync(path.join(location.tooling,'node_modules')),dependencies);assert.deepEqual(runtime,snapshot(path.join(root,'dist')),'Installed SDK runtime is stale');
const excluded=['node_modules','balance/reports','.git','saves','dist','release','.artifacts'];
const files={};
function inventory(directory,prefix=''){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const name=prefix+entry.name;if(excluded.some(p=>name===p||name.startsWith(p+'/')))continue;
    assert(!entry.isSymbolicLink(),'Source links other than dependencies are unsupported: '+name);
    if(entry.isDirectory())inventory(path.join(directory,entry.name),name+'/');
    else{assert(entry.isFile(),'Expected a regular source file: '+name);files[name]=sha256(fs.readFileSync(path.join(directory,entry.name)));}
  }
}
inventory(sourceGame);fs.mkdirSync(game);
for(const name of Object.keys(files)){const target=path.join(game,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(sourceGame,name),target,fs.constants.COPYFILE_EXCL);}
for(const[name,bytes]of Object.entries(decoded)){const target=path.join(game,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});}
fs.symlinkSync(dependencies,path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
assert.deepEqual(snapshot(path.join(sourceGame,'src')),source);assert.deepEqual(snapshot(path.join(game,'src')),source);assert.deepEqual(snapshot(packageDir),pkg);assert(fs.readFileSync(path.join(root,'baseline/renderer-shell.json')).equals(manifestBytes));assert(fs.readFileSync(path.join(root,manifest.capsule)).equals(compressed));
for(const[name,expected]of Object.entries(manifest.files))assert.equal(sha256(fs.readFileSync(path.join(game,name))),expected.sha256);
for(const[name,hash]of Object.entries(files)){assert.equal(sha256(fs.readFileSync(path.join(sourceGame,name))),hash);assert.equal(sha256(fs.readFileSync(path.join(game,name))),hash);}
const result={passed:true,sourceGame,game,packageDir,copiedFiles:Object.keys(files).length,shellManifestSha256:sha256(manifestBytes),sourceMapSha256:sha256(JSON.stringify(source)),runtimeMapSha256:sha256(JSON.stringify(runtime)),sourceAndPackageUnchanged:true};
writeJSON(path.join(root,'.artifacts/game-renderer-location.json'),result);console.log(result);
