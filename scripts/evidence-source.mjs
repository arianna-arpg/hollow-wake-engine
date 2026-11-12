import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,sha256} from './reference-utils.mjs';
import {historicalSourceBytes,historicalTypeScript} from './historical-typescript.mjs';

const immutableHashes=new Map();

/** Retained observations refer to actual immutable Git blobs, never substituted
 * recorded hashes. Ignored compiled outputs are rebuilt from that same source
 * and must still match their original accepted bytes. */
export function sourceHasher(sourceRef=null){
  assert(sourceRef===null||/^[a-f0-9]{40}$/.test(sourceRef),'Expected a complete immutable source commit');
  if(sourceRef&&!immutableHashes.has(sourceRef))immutableHashes.set(sourceRef,new Map());
  const cache=sourceRef?immutableHashes.get(sourceRef):new Map();
  return file=>{
    const name=file.replaceAll('\\','/');
    assert(name.length>0&&!name.startsWith('/')&&!name.includes(':')&&!name.includes('\0')&&!name.split('/').includes('..'));
    if(!cache.has(name)){
      const bytes=sourceRef?(name.startsWith('dist/')?historicalTypeScript(sourceRef).get(name):
        name.startsWith('src/')||['tsconfig.json','package.json','package-lock.json'].includes(name)?historicalSourceBytes(sourceRef,name):
        execFileSync('git',['show',sourceRef+':'+name],{cwd:root,windowsHide:true,maxBuffer:16*1024*1024})):fs.readFileSync(path.join(root,name));
      assert(bytes!==undefined,'Historical source or compiled output is missing: '+name);
      cache.set(name,sha256(bytes));
    }
    return cache.get(name);
  };
}
