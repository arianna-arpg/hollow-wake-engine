import {packageRuntimeFiles} from './package-runtime-files.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';import {craftingCourse} from './content-table-course.mjs';
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
const args=process.argv.slice(2),options={};assert.equal(args.length,8,'--package JSON --baseline JSON --library-proof JSON --tools JSON');
for(let i=0;i<args.length;i+=2){assert(['--package','--baseline','--library-proof','--tools'].includes(args[i]));assert(!Object.hasOwn(options,args[i]));options[args[i]]=fs.realpathSync(args[i+1]);}
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const pkg=read(options['--package']),baseline=read(options['--baseline']),pointer=read(options['--library-proof']),library=read(pointer.receipt);
assert(pkg.passed&&baseline.passed&&library.passed&&library.inputsUnchanged);const dll=path.join(pointer.directory,'hwe_embedded.dll');assert.equal(hash(dll),library.librarySha256);
assert.equal(hash(pkg.archive),pkg.archiveSha256);assert.equal(hash(baseline.archive),baseline.archiveSha256);
assert.equal(hash(path.join(pkg.consumer,'content.json')),pkg.contentSha256);assert.equal(hash(path.join(pkg.consumer,'table.json')),pkg.tableSha256);
assert.equal(hash(path.join(baseline.consumer,'content.json')),baseline.contentSha256);
const accepted=read(path.join(root,'evidence/crafting-session/windows.json'));assert.equal(baseline.archiveSha256,accepted.package.archiveSha256);
for(const file of ['experiments/embedded-js/native/hwe_embedded.c','experiments/embedded-js/native/hwe_embedded.h','experiments/embedded-js/tracked-allocator.h','experiments/embedded-js/host-source-lock.json'])assert.equal(hash(path.join(root,file)),library.sourceHashes[file]);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/content-table-native-')),installed=path.join(pkg.consumer,'node_modules/@hollow-wake/engine/dist'),old=path.join(baseline.consumer,'node_modules/@hollow-wake/engine/dist');
assert.equal(sha256(JSON.stringify(Object.fromEntries(listFiles(old).map(f=>[f,hash(path.join(old,f))])))),accepted.runtimeMapSha256,'Accepted baseline installation changed');
assert.deepEqual(listFiles(installed),packageRuntimeFiles());for(const file of listFiles(installed))assert.equal(hash(path.join(installed,file)),hash(path.join(root,'dist',file)));
const load=async dir=>Object.assign({},...await Promise.all(['crafting-session','item-rules','crafting-content','skill-progression'].map(f=>import(pathToFileURL(path.join(dir,f+'.js')).href))));
const content=read(path.join(pkg.consumer,'content.json'));assert.equal(JSON.stringify(content),JSON.stringify(read(path.join(baseline.consumer,'content.json'))));
const course=craftingCourse(await load(old),content);writeJSON(path.join(directory,'course.json'),course);
const {decodeContentTable}=await import(pathToFileURL(path.join(installed,'content-table.js')).href);
const candidateCourse=craftingCourse(await load(installed),decodeContentTable(read(path.join(pkg.consumer,'table.json'))));assert.deepEqual(candidateCourse,course);
const currentEntry=path.join(directory,'candidate.mjs');
// Resolve public imports from the verified installation rather than the SDK checkout.
fs.writeFileSync(currentEntry,fs.readFileSync(path.join(root,'adapters/embedded/crafting-session.mjs'),'utf8'));
const imports=Object.fromEntries(Object.entries(read(path.join(pkg.consumer,'node_modules/@hollow-wake/engine/package.json')).exports).filter(([,v])=>v.import).map(([k,v])=>['@hollow-wake/engine'+k.slice(1),path.join(installed,'..',v.import)]));
await build({entryPoints:[currentEntry],bundle:true,format:'iife',globalName:'HollowWakeSession',platform:'neutral',target:'es2022',minify:true,alias:imports,outfile:path.join(directory,'candidate.js')});
const oldEntry=path.join(directory,'baseline.mjs');fs.writeFileSync(oldEntry,`import {CraftingSession} from ${JSON.stringify(path.join(old,'crafting-session.js'))};import {ItemContent} from ${JSON.stringify(path.join(old,'item-rules.js'))};import {CraftingContent} from ${JSON.stringify(path.join(old,'crafting-content.js'))};import {SkillProgression} from ${JSON.stringify(path.join(old,'skill-progression.js'))};export function create(c){const items=new ItemContent(c.items);return new CraftingSession({crafting:new CraftingContent(c.crafting,items),skills:new SkillProgression(c.skills),memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}},2)}export const dispatch=(s,r)=>s.command(r);`);
await build({entryPoints:[oldEntry],bundle:true,format:'iife',globalName:'HollowWakeSession',platform:'neutral',target:'es2022',minify:true,outfile:path.join(directory,'baseline.js')});
fs.copyFileSync(path.join(pkg.consumer,'content.json'),path.join(directory,'content.json'));fs.copyFileSync(path.join(pkg.consumer,'table.json'),path.join(directory,'table.json'));
const variants=[{name:'baseline',bundle:'baseline.js',content:'content.json',heaps:[32,64,128]},{name:'compiled',bundle:'candidate.js',content:'table.json',heaps:[32,64]}];
writeJSON(path.join(directory,'input.json'),{dll,directory,variants});const toolchain=read(read(options['--tools']).tools);
const result=spawnSync(toolchain.python,['-I',path.join(root,'scripts/content-table-native.py'),path.join(directory,'input.json')],{encoding:'utf8',windowsHide:true,timeout:240000});
fs.writeFileSync(path.join(directory,'native.txt'),result.stdout+'\n'+result.stderr);writeJSON(path.join(directory,'process.json'),{status:result.status,signal:result.signal,error:result.error?.message??null});
writeJSON(path.join(root,'.artifacts/content-table-native-latest.json'),{directory});assert(!result.error&&result.signal===null&&result.status===0,'Native driver failed; inspect native.txt');
const observed=read(path.join(directory,'native-result.json'));assert(observed.rows.every(r=>r.created?r.destroyStatus===0&&r.remainingBytes===0:!r.passed));
const passed=observed.rows.find(r=>r.variant==='baseline'&&r.heapMiB===128)?.passed&&observed.rows.find(r=>r.variant==='compiled'&&r.heapMiB===32)?.passed;
const report={passed:!!passed,directory,coverage:course.coverage,commands:course.rows.length,courseSha256:hash(path.join(directory,'course.json')),archiveSha256:pkg.archiveSha256,baselineArchiveSha256:baseline.archiveSha256,librarySha256:library.librarySha256,runtimeMap:pkg.runtimeMap,
  sources:Object.fromEntries(['scripts/test-content-table-native.mjs','scripts/content-table-native.py','scripts/content-table-course.mjs','adapters/embedded/crafting-session.mjs'].map(f=>[f,hash(path.join(root,f))])),
  inputs:Object.fromEntries(['candidate.js','baseline.js','content.json','table.json'].map(f=>[f,hash(path.join(directory,f))])),rows:observed.rows};
writeJSON(path.join(directory,'verification.json'),report);console.log({passed:report.passed,directory,commands:report.commands,rows:report.rows.map(({commandMs,...r})=>r)});
assert(passed,'Full native course did not fit the candidate 32 MiB cap');
