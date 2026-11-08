import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,sha256} from './reference-utils.mjs';

/** Retained observations refer to actual immutable Git blobs, never substituted
 * recorded hashes. Ignored compiled outputs still require their original bytes. */
export function sourceHasher(sourceRef=null){
  assert(sourceRef===null||/^[a-f0-9]{40}$/.test(sourceRef),'Expected a complete immutable source commit');
  const cache=new Map();
  return file=>{
    const name=file.replaceAll('\\','/');
    assert(name.length>0&&!name.startsWith('/')&&!name.includes(':')&&!name.includes('\0')&&!name.split('/').includes('..'));
    if(!cache.has(name))cache.set(name,sha256(sourceRef&&!name.startsWith('dist/')?
      execFileSync('git',['show',sourceRef+':'+name],{cwd:root,windowsHide:true,maxBuffer:16*1024*1024}):fs.readFileSync(path.join(root,name))));
    return cache.get(name);
  };
}
