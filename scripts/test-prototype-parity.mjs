import {replayCombat} from '../test/prototype-parity/replay.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
import {root,sha256} from './reference-utils.mjs';import {parityDirectory} from './prototype-parity-tools.mjs';
import {readPrototypeContent} from './prototype-content.mjs';import {buildCombatContent} from './compile-combat-content.mjs';
import {createCombatSession} from '../adapters/embedded/combat-session.mjs';import {emptyCombatSpace} from '../test/combat-empty-space.mjs';
const profile=readPrototypeContent();
const hostAcceptance=JSON.parse(fs.readFileSync(path.join(parityDirectory,'host-acceptance.json'))),hostArchive=fs.readFileSync(path.join(parityDirectory,'host.json.gz'));
assert.equal(sha256(hostArchive),hostAcceptance.compressedSha256);assert.equal(sha256(profile.lockBytes),hostAcceptance.sourceLockSha256);
assert.equal(sha256(fs.readFileSync(path.join(root,hostAcceptance.observer))),hostAcceptance.observerSha256);
const hostBytes=gunzipSync(hostArchive);assert.equal(sha256(hostBytes),hostAcceptance.sha256);
const hostGeometry=JSON.parse(hostBytes).courses[0];
const fixtures=['combat','interactions','layers-v2','summons-v5','rules-v2','terminal','corpse-rites','relocation'].map(name=>{
  const accepted=JSON.parse(fs.readFileSync(path.join(parityDirectory,name+'-acceptance.json'))),archive=fs.readFileSync(path.join(parityDirectory,name+'.json.gz'));
  assert.equal(sha256(archive),accepted.compressedSha256);const bytes=gunzipSync(archive);assert.equal(sha256(bytes),accepted.sha256);
  assert.equal(sha256(fs.readFileSync(path.join(root,accepted.observer))),accepted.observerSha256);
  assert.equal(accepted.sourceLockSha256,sha256(profile.lockBytes));const fixture=JSON.parse(bytes);assert(fixture.originalOnly);return fixture;
});
const parent=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(parent,'parity-test-owned-'));
try {
  await buildCombatContent(path.join(work,'content'),profile);
  const {combatContent}=await import(pathToFileURL(path.join(work,'content/content.mjs')));
  const result=replayCombat({createCombatSession,combatContent,emptyCombatSpace,fixtures,hostGeometry,filter:process.argv.includes('--course')?process.argv[process.argv.indexOf('--course')+1]:undefined});
  console.log(JSON.stringify({...result,source:profile.lock.commit},null,2));if(!result.passed)process.exitCode=1;
} finally {assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});}
