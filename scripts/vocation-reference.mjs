import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';

export const accepted = JSON.parse(fs.readFileSync(path.join(root,'baseline/vocation-progression/acceptance.json')));
export function readVocationFixture(name) {
  const fixture=accepted.fixtures[name],compressed=fs.readFileSync(path.join(root,fixture.file));
  assert.equal(sha256(compressed),fixture.compressedSha256);
  const bytes=gunzipSync(compressed);assert.equal(sha256(bytes),fixture.sha256);return bytes;
}
export function prepareVocationObserver(name, game, directory) {
  const fixture=accepted.fixtures[name],template=fs.readFileSync(path.join(root,fixture.helper),'utf8');
  assert.equal(sha256(template),fixture.helperSha256);
  const entry=path.join(directory,name+'.ts');
  const source=template.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_,quote,file)=>{
    const relative=path.relative(directory,path.join(game,'src',file)).split(path.sep).join('/');
    assert(!path.isAbsolute(relative),'The observer and selected source must share a volume');
    return JSON.stringify(relative.startsWith('.')?relative:'./'+relative);
  });
  fs.writeFileSync(entry,source,{flag:'wx'});return entry;
}
export function checkVocationObserverTypes(directory, entries) {
  const ref=path.join(root,'.reference'),config=path.join(directory,'tsconfig.json');
  writeJSON(config,{extends:path.join(ref,'tsconfig.sim.json'),compilerOptions:{noEmit:true,typeRoots:[path.join(ref,'node_modules/@types')]},include:entries});
  const log=path.join(directory,'types.txt'),fd=fs.openSync(log,'wx');
  try{execFileSync(process.execPath,[path.join(ref,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:ref,stdio:['ignore',fd,fd],timeout:240000,windowsHide:true});}
  finally{fs.closeSync(fd);}
  return sha256(fs.readFileSync(log));
}
export function captureVocationObserver(entry,directory,label) {
  const output=path.join(directory,label+'.json'),log=path.join(directory,label+'.txt'),fd=fs.openSync(log,'wx');
  try{execFileSync(process.execPath,['--import','tsx',entry,output],{cwd:path.join(root,'.reference'),stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});}
  finally{fs.closeSync(fd);}
  const bytes=fs.readFileSync(output);
  return {label,output,sha256:sha256(bytes),logSha256:sha256(fs.readFileSync(log)),bytes};
}
