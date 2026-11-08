import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import vm from 'node:vm';
import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';
import {liveEquipmentCourse} from '../test/live-equipment-course.mjs';
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
const [archive,python,output,...extra]=process.argv.slice(2);
assert(archive && python && output && !extra.length,'GAMEPLAY_ARCHIVE PYTHON FRESH_REPORT');
assert(!fs.existsSync(output) && !fs.existsSync(output+'.raw.json.gz'));
assert.equal(sha256(fs.readFileSync(archive)),'ea56ce53d14a5c0b669ba1dcc05e96e90ea768994ac682e6ec54c5fd38577c76');
const native=JSON.parse(fs.readFileSync(path.join(root,'evidence/pouch-recall/dotnet-windows.json')));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/live-equipment-native-'));
const report={passed:false,scope:'Native replay of new source against the unchanged qualified shipping DLL. No Unity or device acceptance.'};
let compiled,course;const raw={};
try{
 compiled=await build({entryPoints:[path.join(root,'adapters/unity/combat-entry.mjs')],bundle:true,
  format:'iife',globalName:'HollowWakeSession',target:'es2022',platform:'neutral',write:false,minify:true,metafile:true,tsconfigRaw:{},
  plugins:[{name:'workspace-package',setup(builder){
   const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
   builder.onResolve({filter:/^@hollow-wake\/engine/},args=>{
    const entry=manifest.exports[args.path.replace('@hollow-wake/engine','.')];assert(entry,args.path);
    return {path:path.resolve(root,typeof entry==='string'?entry:entry.import)};
   });
  }}]});
 assert(Object.values(compiled.metafile.outputs).every(output=>output.imports.length===0));
 report.sources=Object.fromEntries(['scripts/probe-live-equipment-native.mjs','test/live-equipment-course.mjs',
  'test/live-equipment-native.py','test/unity-gameplay/content-load.py',...Object.keys(compiled.metafile.inputs)]
  .map(file=>[file,sha256(fs.readFileSync(path.resolve(root,file)))]));
 const context=vm.createContext({});vm.runInContext(compiled.outputFiles[0].text,context);
 const parse=vm.runInContext('JSON.parse',context),api=context.HollowWakeSession;
 course=liveEquipmentCourse({create:input=>api.create(parse(JSON.stringify(input))),
  dispatch:(world,request)=>api.dispatch(world,parse(JSON.stringify(request)))});
 const files={'bundle.js':compiled.outputFiles[0].contents,'input.json':JSON.stringify(course.input),
  'requests.jsonl':course.requests.join('\n')+'\n','expected.jsonl':course.replies.join('\n')+'\n'};
 for(const[file,body]of Object.entries(files))fs.writeFileSync(path.join(directory,file),body,{flag:'wx'});
 const extract="import sys,tarfile;from pathlib import Path;t=tarfile.open(sys.argv[1]);Path(sys.argv[2]).write_bytes(t.extractfile('package/Runtime/Native/Windows/hwe_embedded.dll').read())";
 execFileSync(python,['-I','-B','-c',extract,path.resolve(archive),path.join(directory,'hwe_embedded.dll')],{cwd:root,windowsHide:true});
 report.nativeSha256=sha256(fs.readFileSync(path.join(directory,'hwe_embedded.dll')));
 assert.equal(report.nativeSha256,native.files['hwe_embedded.dll']);
 const text=execFileSync(python,['-I','-B',path.join(root,'test/live-equipment-native.py'),directory],
  {cwd:root,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 report.native=JSON.parse(text);assert(report.native.passed);
 report.requests=course.requests.length;
 report.files=Object.fromEntries([...Object.keys(files),'native-replies.jsonl'].map(file=>{
  const bytes=fs.readFileSync(path.join(directory,file));
  if(file!=='input.json')raw[file]=bytes.toString('utf8');
  return [file,sha256(bytes)];
 }));
 report.passed=true;
}finally{
 try{
  for(const[file,hash]of Object.entries(report.sources??{}))assert.equal(sha256(fs.readFileSync(path.resolve(root,file))),hash,file);
 }finally{
  const resolved=fs.realpathSync(directory);assert.equal(path.dirname(resolved),fs.realpathSync(path.join(root,'.artifacts')));
  fs.rmSync(resolved,{recursive:true});report.cleaned=!fs.existsSync(resolved);
 }
 const packed=gzipSync(JSON.stringify(raw));report.rawSha256=sha256(packed);
 fs.writeFileSync(output+'.raw.json.gz',packed,{flag:'wx'});
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
console.log(report);
