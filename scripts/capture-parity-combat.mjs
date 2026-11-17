import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {prepareParityReference,parityDirectory} from './prototype-parity-tools.mjs';
const capture=process.argv.includes('--capture'),{directory,lock}=prepareParityReference();
const suiteIndex=process.argv.indexOf('--suite'),name=suiteIndex>=0?process.argv[suiteIndex+1]:process.argv.includes('--host')?'host':process.argv.includes('--interactions')?'interactions':'combat';
assert(['combat','host','interactions','rules','rules-v2','character','character-v2','layers','layers-v2','relics','summons','summons-v2','summons-v3','summons-v4','summons-v5','terminal','corpse-rites','relocation'].includes(name),'Unknown parity suite');
const observer='reference/prototype-parity-'+name+'.ts',bytes=fs.readFileSync(path.join(root,observer));
const parent=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(parent,'parity-combat-owned-'));
const helper=path.join(directory,'balance/__sdk_parity_combat.ts');let written=false;
try {
  fs.writeFileSync(helper,bytes,{flag:'wx'});written=true;
  const runs=[];
  for(const name of ['one','two']){const output=path.join(work,name+'.json');
    execFileSync(process.execPath,['--import','tsx',helper,output],{cwd:directory,env:{...process.env,TSX_DISABLE_CACHE:'1'},stdio:'pipe',maxBuffer:4*1024*1024});runs.push(fs.readFileSync(output));}
  assert(runs[0].equals(runs[1]),'Prototype combat observations must reproduce in fresh processes');
  const data=JSON.parse(runs[0]),file=path.join(parityDirectory,name+'.json.gz'),archive=gzipSync(runs[0],{level:9});
  const acceptance={schemaVersion:1,sourceCommit:lock.commit,sourceLockSha256:sha256(fs.readFileSync(path.join(parityDirectory,'source-lock.json'))),
    observer,observerSha256:sha256(bytes),sha256:sha256(runs[0]),compressedSha256:sha256(archive),freshProcesses:2,courses:data.courses.length};
  if(capture){assert(!fs.existsSync(file));assert(!fs.existsSync(path.join(parityDirectory,name+'-acceptance.json')));fs.writeFileSync(file,archive,{flag:'wx'});writeJSON(path.join(parityDirectory,name+'-acceptance.json'),acceptance);}
  else {assert(runs[0].equals(gunzipSync(fs.readFileSync(file))));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(parityDirectory,name+'-acceptance.json'))),acceptance);}
  console.log(JSON.stringify({passed:true,source:lock.commit,courses:data.courses.length,observations:data.courses.reduce((n,c)=>n+c.steps.length,0)}));
} finally {if(written)fs.unlinkSync(helper);assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});}
