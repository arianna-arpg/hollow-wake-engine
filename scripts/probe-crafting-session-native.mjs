import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
const args=process.argv.slice(2),options={};assert.equal(args.length,6,'--package JSON --library-proof JSON --tools JSON');
for(let i=0;i<args.length;i+=2){assert(['--package','--library-proof','--tools'].includes(args[i]));assert(!Object.hasOwn(options,args[i]));options[args[i]]=fs.realpathSync(args[i+1]);}
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const pkg=read(options['--package']),pointer=read(options['--library-proof']),library=read(pointer.receipt);
assert(pkg.passed&&library.passed&&library.inputsUnchanged);const dll=path.join(pointer.directory,'hwe_embedded.dll');assert.equal(hash(dll),library.librarySha256);
assert.equal(hash(pkg.archive),pkg.archiveSha256);assert.equal(hash(path.join(pkg.consumer,'content.json')),pkg.contentSha256);
for(const file of ['experiments/embedded-js/native/hwe_embedded.c','experiments/embedded-js/native/hwe_embedded.h','experiments/embedded-js/tracked-allocator.h','experiments/embedded-js/host-source-lock.json'])assert.equal(hash(path.join(root,file)),library.sourceHashes[file]);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/crafting-session-native-spike-'));
const installed=path.join(pkg.consumer,'node_modules/@hollow-wake/engine/dist');
const outputs=listFiles(path.join(root,'dist'));assert.deepEqual(listFiles(installed),outputs);
for(const file of outputs)assert.equal(hash(path.join(installed,file)),hash(path.join(root,'dist',file)),'Installed runtime changed: '+file);
const entry=path.join(directory,'entry.mjs');
const source=`import {CraftingSession} from ${JSON.stringify(path.join(installed,'crafting-session.js'))};
import {ItemContent} from ${JSON.stringify(path.join(installed,'item-rules.js'))};
import {CraftingContent} from ${JSON.stringify(path.join(installed,'crafting-content.js'))};
import {SkillProgression} from ${JSON.stringify(path.join(installed,'skill-progression.js'))};
export function create(c){const items=new ItemContent(c.items);return new CraftingSession({crafting:new CraftingContent(c.crafting,items),skills:new SkillProgression(c.skills),memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}},2)}
export const dispatch=(session,request)=>session.command(request);`;
fs.writeFileSync(entry,source);
await build({entryPoints:[entry],bundle:true,format:'iife',globalName:'HollowWakeSession',platform:'neutral',target:'es2022',minify:true,outfile:path.join(directory,'bundle.js')});
fs.writeFileSync(path.join(directory,'content.json'),JSON.stringify(read(path.join(pkg.consumer,'content.json'))));
writeJSON(path.join(directory,'input.json'),{dll,directory,archiveSha256:pkg.archiveSha256,librarySha256:library.librarySha256});
const tools=read(read(options['--tools']).tools);
const result=spawnSync(tools.python,['-I',path.join(root,'scripts/crafting-session-native-probe.py'),path.join(directory,'input.json')],{encoding:'utf8',windowsHide:true,timeout:180000});
fs.writeFileSync(path.join(directory,'probe.txt'),result.stdout+'\n'+result.stderr);
writeJSON(path.join(directory,'process.json'),{status:result.status,signal:result.signal,error:result.error?.message??null,archiveSha256:pkg.archiveSha256,librarySha256:library.librarySha256});
writeJSON(path.join(root,'.artifacts/crafting-session-native-spike-latest.json'),{directory});
assert(!result.error&&result.signal===null&&result.status===0,'Native diagnostic process did not complete; inspect probe.txt');
const observed=read(path.join(directory,'result.json'));
assert(observed.rows.length>0&&observed.rows.every(row=>row.created ? row.destroyStatus===0&&row.remainingBytes===0 : row.createStatus!==0));
writeJSON(path.join(directory,'provenance.json'),{sdkArchiveSha256:pkg.archiveSha256,libraryProofSha256:hash(pointer.receipt),librarySha256:library.librarySha256,
  runtimeMapSha256:sha256(JSON.stringify(Object.fromEntries(outputs.map(file=>[file,hash(path.join(installed,file))])))),
  sources:Object.fromEntries(['scripts/probe-crafting-session-native.mjs','scripts/crafting-session-native-probe.py'].map(file=>[file,hash(path.join(root,file))])),
  inputs:Object.fromEntries(['entry.mjs','bundle.js','content.json'].map(file=>[file,hash(path.join(directory,file))])),scope:'Exploratory Windows x64 native initialization and short continuation course; not engine/device acceptance or a timing benchmark.'});
console.log({directory,status:result.status,output:result.stdout,error:result.stderr});
