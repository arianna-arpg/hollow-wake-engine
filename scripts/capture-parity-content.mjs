import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gzipSync, gunzipSync} from 'node:zlib';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {prepareParityReference, parityDirectory} from './prototype-parity-tools.mjs';

const capture = process.argv.includes('--capture');
const {directory,lock}=prepareParityReference(), parent=fs.realpathSync(path.join(root,'.artifacts'));
const work=fs.mkdtempSync(path.join(parent,'parity-content-owned-')), helpers=[];
try {
  const observerFiles={'reference/export-catalogue.ts':'__sdk_parity_catalogue.ts','reference/prototype-parity-content.ts':'__sdk_parity_content.ts'};
  const sources={};
  for(const[from,to]of Object.entries(observerFiles)){
    const file=path.join(directory,'balance',to),bytes=fs.readFileSync(path.join(root,from));
    assert(!fs.existsSync(file),'Refusing to overwrite source observer');fs.writeFileSync(file,bytes,{flag:'wx'});helpers.push(file);sources[from]=sha256(bytes);
  }
  const outputs=[];
  for(const run of ['one','two']){
    const output=path.join(work,run);
    execFileSync(process.execPath,['--import','tsx',helpers[1],output],{cwd:directory,env:{...process.env,TSX_DISABLE_CACHE:'1'},stdio:'pipe',maxBuffer:4*1024*1024});
    outputs.push(Object.fromEntries(['catalogue','runtime'].map(name=>[name,fs.readFileSync(path.join(output,name+'.json'))])));
  }
  const fixtures={};
  for(const name of ['catalogue','runtime']){
    const bytes=outputs[0][name];assert(bytes.equals(outputs[1][name]),'Nondeterministic prototype content: '+name);
    const file=path.join(parityDirectory,name+'.json.gz'),compressed=gzipSync(bytes,{level:9});
    if(capture){assert(!fs.existsSync(file),'Accepted content already exists');fs.writeFileSync(file,compressed,{flag:'wx'});}
    else assert(bytes.equals(gunzipSync(fs.readFileSync(file))),'Prototype content changed: '+name);
    fixtures[name]={file:'baseline/prototype-parity/'+name+'.json.gz',sha256:sha256(bytes),compressedSha256:sha256(compressed),bytes:bytes.length};
  }
  const manifest={schemaVersion:1,sourceCommit:lock.commit,sourceLockSha256:sha256(fs.readFileSync(path.join(parityDirectory,'source-lock.json'))),freshProcesses:2,sources,fixtures};
  const acceptance=path.join(parityDirectory,'content-acceptance.json');
  if(capture){assert(!fs.existsSync(acceptance));writeJSON(acceptance,manifest);}else assert.deepEqual(JSON.parse(fs.readFileSync(acceptance)),manifest);
  console.log(JSON.stringify({passed:true,source:lock.commit,freshProcesses:2,fixtures:Object.keys(fixtures)}));
} finally {
  for(const file of helpers)fs.unlinkSync(file);
  assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});
}
