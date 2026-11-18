import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {readParitySource,readCommittedSource,sourceGit,sourceDifference} from './prototype-parity-tools.mjs';
import {readRevisionSource,revisionDirectory} from './prototype-revision-tools.mjs';
import {auditRevisionContent} from './prototype-revision-audit.mjs';
import {readPrototypeContent} from './prototype-content.mjs';
const args=process.argv.slice(2),capture=args[0]==='--capture';
assert(capture?args.length===3:args.length===0,'Use [--capture PROTOTYPE FULL_COMMIT]');
const before=readParitySource();let source,deltaBytes;
if(capture){
 assert(!fs.existsSync(revisionDirectory),'A revision capture is immutable; choose a new version');
 const[,game,commit]=args,files=readCommittedSource(game,commit,before.lock.paths),changes=sourceDifference(before.lock.files,files);
 const delta={schemaVersion:1,commit,previous:before.lock.commit,files:Object.fromEntries(changes.map(r=>[r.file,files.has(r.file)?files.get(r.file).toString('base64'):null]))};
 deltaBytes=gzipSync(JSON.stringify(delta),{level:9});
 const lock={schemaVersion:1,upstream:before.lock.upstream,commit,sourceDate:sourceGit(game,['show','-s','--format=%cI',commit]).toString().trim(),
  previous:{commit:before.lock.commit,lock:'baseline/prototype-parity/source-lock.json',sha256:sha256(fs.readFileSync(path.join(root,'baseline/prototype-parity/source-lock.json')))},
  paths:before.lock.paths,deltaSha256:sha256(deltaBytes),files:Object.fromEntries([...files].map(([name,bytes])=>[name,sha256(bytes)]))};
 source={lock,lockBytes:Buffer.from(JSON.stringify(lock,null,2)+'\n'),files};
}else source=readRevisionSource();
const parent=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(parent,'revision-capture-owned-')),game=path.join(work,'game'),link=path.join(game,'node_modules');
try{
 for(const[name,bytes]of source.files){const file=path.join(game,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
 fs.symlinkSync(fs.realpathSync(path.join(root,'.reference/node_modules')),link,process.platform==='win32'?'junction':'dir');
 const sources={},helpers={'reference/export-catalogue.ts':'__sdk_parity_catalogue.ts','reference/prototype-parity-content.ts':'__sdk_parity_content.ts','reference/prototype-revision.ts':'__sdk_revision.ts'};
 for(const[from,to]of Object.entries(helpers)){const bytes=fs.readFileSync(path.join(root,from));sources[from]=sha256(bytes);fs.writeFileSync(path.join(game,'balance',to),bytes,{flag:'wx'});}
 const outputs=[];
 for(const name of ['one','two']){
  const output=path.join(work,name);
  for(const observer of ['__sdk_parity_content.ts','__sdk_revision.ts'])execFileSync(process.execPath,['--import','tsx','balance/'+observer,output],{cwd:game,windowsHide:true,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,TSX_DISABLE_CACHE:'1'},maxBuffer:4*1024*1024});
  outputs.push(Object.fromEntries(['catalogue','runtime','inspection','observations'].map(n=>[n,fs.readFileSync(path.join(output,n+'.json'))])));
 }
 const audit=auditRevisionContent(readPrototypeContent(),JSON.parse(outputs[0].catalogue),JSON.parse(outputs[0].runtime));
 const files=sourceDifference(before.lock.files,source.files).map(row=>({...row,classification:
  row.file.startsWith('src/packages/')||['src/data/tilesets.ts','src/data/menu.ts','src/data/vendors.ts','src/data/hollows.ts'].includes(row.file)?'host-presentation':
  row.file==='src/meta/unlocks.ts'?'optional-progression-presentation':row.file.startsWith('balance/')||row.file.startsWith('scripts/')?'authoring-or-verification':
  row.file==='src/ui/panels.ts'?'host-ui-binding; structured inspection ported':'combat-inventory-content-or-inspection'}));
 const acceptance={schemaVersion:1,sourceCommit:source.lock.commit,sourceLockSha256:sha256(source.lockBytes),freshProcesses:4,sources,fixtures:{}};
 const archives={};
 for(const[name,bytes]of Object.entries(outputs[0])){
  assert(bytes.equals(outputs[1][name]),'Nondeterministic original revision: '+name);
  const compressed=capture?gzipSync(bytes,{level:9}):fs.readFileSync(path.join(revisionDirectory,name+'.json.gz'));
  assert(bytes.equals(gunzipSync(compressed)),'Original revision changed: '+name);archives[name]=compressed;
  acceptance.fixtures[name]={sha256:sha256(bytes),compressedSha256:sha256(compressed),bytes:bytes.length};
 }
 const report={schemaVersion:1,source:source.lock.commit,previous:before.lock.commit,files,...audit};
 if(capture){
  fs.mkdirSync(revisionDirectory);fs.writeFileSync(path.join(revisionDirectory,'source-lock.json'),source.lockBytes,{flag:'wx'});
  fs.writeFileSync(path.join(revisionDirectory,'source-delta.json.gz'),deltaBytes,{flag:'wx'});
  for(const[name,bytes]of Object.entries(archives))fs.writeFileSync(path.join(revisionDirectory,name+'.json.gz'),bytes,{flag:'wx'});
  writeJSON(path.join(revisionDirectory,'acceptance.json'),acceptance);writeJSON(path.join(revisionDirectory,'audit.json'),report);
 }else{assert.deepEqual(acceptance,JSON.parse(fs.readFileSync(path.join(revisionDirectory,'acceptance.json'))));assert.deepEqual(report,JSON.parse(fs.readFileSync(path.join(revisionDirectory,'audit.json'))));}
 console.log(JSON.stringify({passed:true,source:source.lock.commit,files:files.length,freshProcesses:4,changes:audit.counts}));
}finally{
 if(fs.existsSync(link))fs.unlinkSync(link);assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:4});
}
