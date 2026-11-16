import {test} from 'node:test';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';

test('Godot preparation reaches download on a clean checkout and cleans a failed attempt',{skip:process.arch!=='x64'},()=>{
 const artifacts=path.resolve('.artifacts');fs.mkdirSync(artifacts,{recursive:true});const work=fs.mkdtempSync(path.join(artifacts,'m5-godot-bootstrap-owned-'));
 try{
  const scripts=path.join(work,'scripts');fs.mkdirSync(scripts);fs.mkdirSync(path.join(work,'experiments/godot-native'),{recursive:true});
  fs.copyFileSync('scripts/prepare-node-godot-tools.mjs',path.join(scripts,'prepare.mjs'));
  fs.writeFileSync(path.join(scripts,'reference-utils.mjs'),"import path from 'node:path';import {fileURLToPath} from 'node:url';export const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));export const sha256=()=>{throw Error('unexpected hashing')};export const writeJSON=()=>{throw Error('unexpected write')};");
  fs.writeFileSync(path.join(scripts,'tool-download.mjs'),"export async function downloadPinned(){throw Error('probe-download-reached');}");
  fs.writeFileSync(path.join(work,'experiments/godot-native/toolchain-lock.json'),JSON.stringify({platforms:{[process.platform]:{editor:{archive:{name:'probe.zip'}}}},exportTemplates:{url:'https://example.invalid/probe.zip'}}));
  assert(!fs.existsSync(path.join(work,'.artifacts')));
  const result=spawnSync(process.execPath,[path.join(scripts,'prepare.mjs'),'--python','unused'],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(result.status,1);assert.match(result.stderr,/probe-download-reached/);assert.deepEqual(fs.readdirSync(path.join(work,'.artifacts')),[]);
 }finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(artifacts));fs.rmSync(work,{recursive:true,maxRetries:3});}
});
