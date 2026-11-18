import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {withPrototypeRevision,revisionDirectory} from './prototype-revision-tools.mjs';
import {prototypeBuildPack} from './prototype-content.mjs';import {characterBuildPack} from './compile-character-builds.mjs';import {inspectionCases} from './item-inspection-corpus.mjs';
const capture=process.argv.includes('--capture'),observer='reference/export-item-inspection.ts';
await withPrototypeRevision(async profile=>{
 const cases=inspectionCases(),pack=prototypeBuildPack(characterBuildPack(),profile),source=fs.readFileSync(path.join(root,observer)),helper=path.join(profile.directory,'balance/__sdk_revision_items.ts');
 fs.writeFileSync(helper,source,{flag:'wx'});const outputs=[];
 for(const name of ['one','two']){
  const output=path.join(profile.directory,'__sdk_items_'+name);fs.mkdirSync(output);writeJSON(path.join(output,'inputs.json'),cases);
  execFileSync(process.execPath,['--import','tsx',helper,output,pack.items.id],{cwd:profile.directory,windowsHide:true,env:{...process.env,TSX_DISABLE_CACHE:'1',TEMP:profile.directory,TMP:profile.directory,TMPDIR:profile.directory},maxBuffer:4*1024*1024});
  const original=fs.readFileSync(path.join(output,'original.jsonl'),'utf8').trim().split('\n').map(row=>JSON.parse(row));
  assert.equal(original.length,cases.length);for(let n=0;n<cases.length;n++)assert.equal(original[n].label,cases[n].label);
  outputs.push(Buffer.from(JSON.stringify({originalOnly:true,itemsId:pack.items.id,cases:cases.map((row,n)=>({...row,expected:original[n]}))})+'\n'));
 }
 assert(outputs[0].equals(outputs[1]),'Non-deterministic original item inspection');
 const file=path.join(revisionDirectory,'items.json.gz'),accepted=path.join(revisionDirectory,'items-acceptance.json');
 const compressed=capture?gzipSync(outputs[0],{level:9}):fs.readFileSync(file);assert(outputs[0].equals(gunzipSync(compressed)));
 const manifest={sourceCommit:profile.lock.commit,sourceLockSha256:sha256(profile.lockBytes),freshProcesses:2,observer,observerSha256:sha256(source),
  inputsSha256:sha256(JSON.stringify(cases)),sha256:sha256(outputs[0]),compressedSha256:sha256(compressed),cases:cases.length};
 if(capture){assert(!fs.existsSync(file)&&!fs.existsSync(accepted),'Accepted item observations are immutable');fs.writeFileSync(file,compressed,{flag:'wx'});writeJSON(accepted,manifest);}
 else assert.deepEqual(manifest,JSON.parse(fs.readFileSync(accepted)));
 console.log(JSON.stringify({passed:true,source:profile.lock.commit,cases:cases.length,compressedBytes:compressed.length}));
});
