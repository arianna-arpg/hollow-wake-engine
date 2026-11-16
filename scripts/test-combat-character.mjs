import {verifyCharacterCourses} from '../test/combat-session/characters.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {Random} from '@hollow-wake/engine';
import {root,sha256} from './reference-utils.mjs';
import {buildCharacterBuilds} from './compile-character-builds.mjs';
import {characterSessionPack} from './compile-character-session.mjs';
import {buildCombatContent} from './compile-combat-content.mjs';
import {createCombatSession} from '../adapters/embedded/combat-session.mjs';
import {emptyCombatSpace} from '../test/combat-empty-space.mjs';

const parent=fs.realpathSync('.artifacts'),work=fs.mkdtempSync(path.join(parent,'m3-character-owned-'));
const same=(a,b,message)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),message);
try {
  const archive=fs.readFileSync('baseline/character-session/observations.json.gz'),bytes=gunzipSync(archive);
  const accepted=JSON.parse(fs.readFileSync('baseline/character-session/acceptance.json'));
  assert.equal(sha256(archive),accepted.compressedSha256);assert.equal(sha256(bytes),accepted.sha256);
  const fixture=JSON.parse(bytes),pack=characterSessionPack();
  await buildCharacterBuilds(path.join(work,'builds'));
  const builds=JSON.parse(fs.readFileSync(path.join(work,'builds/builds.json')));
  await build({absWorkingDir:root,entryPoints:['adapters/embedded/character-session.mjs'],bundle:true,platform:'neutral',format:'esm',target:'es2022',
    outfile:path.join(work,'kit.mjs'),external:['@hollow-wake/engine','@hollow-wake/engine/*'],alias:{'@hollow-wake/character-builds':path.join(work,'builds/index.js')}});
  const {createCharacterKit}=await import(pathToFileURL(path.join(work,'kit.mjs'))),kit=createCharacterKit(builds,pack);
  await buildCombatContent(path.join(work,'content'));
  const {combatContent}=await import(pathToFileURL(path.join(work,'content/content.mjs')));
  const result=verifyCharacterCourses({fixture,kit,pack,combatContent,createCombatSession,emptyCombatSpace});
  console.log({passed:true,...result});
}finally{assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});}
