import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';

// The scanner operates on a disposable source copy, never a live production file.
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const copy=fs.mkdtempSync(path.join(owned,'boundary-controls-'));
try {
fs.cpSync(path.join(root,'src'),path.join(copy,'src'),{recursive:true});
fs.mkdirSync(path.join(copy,'scripts'));
for(const file of ['check-boundaries.mjs','reference-utils.mjs'])fs.copyFileSync(path.join(root,'scripts',file),path.join(copy,'scripts',file));
fs.copyFileSync(path.join(root,'package.json'),path.join(copy,'package.json'));
const probe=path.join(copy,'src/host-api-probe.ts');
fs.writeFileSync(probe,'export interface TimingData { window: number }\n');
const run=()=>spawnSync(process.execPath,['scripts/check-boundaries.mjs'],{cwd:copy,encoding:'utf8'});
const typed=run();assert.equal(typed.status,0,typed.stderr);
for(const source of ['export const value = window;','export const value = globalThis.window;']){
  fs.writeFileSync(probe,source+'\n');
  const result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/host-api-probe.ts: host API window/);
}
fs.unlinkSync(probe);
fs.appendFileSync(path.join(copy,'src/index.ts'),"\nexport {CastSeals} from './cast-seals.js';\n");
const eager=run();assert.notEqual(eager.status,0);assert.match(eager.stderr,/Optional cast seals became an eager core import/);
// Restore the root entry before probing a separate public subpath.
fs.copyFileSync(path.join(root,'src/index.ts'),path.join(copy,'src/index.ts'));
fs.appendFileSync(path.join(copy,'src/character-builds.ts'),"\nexport {RunCharacterSession} from './run-character-session.js';\n");
const excluded=run();assert.notEqual(excluded.status,0);assert.match(excluded.stderr,/Public package depends on excluded module/);
writeJSON(path.join(root,'.artifacts/boundary-controls-verification.json'),{interfaceDataKeyAccepted:true,bareHostGlobalRejected:true,globalPropertyRejected:true,eagerCastSealsRejected:true,excludedPublicDependencyRejected:true,productionSourcesUntouched:true});
console.log('Boundary controls accept typed data keys while rejecting bare and property-based host globals.');

} finally {
  assert.equal(path.dirname(fs.realpathSync(copy)),fs.realpathSync(owned));
  assert(!fs.existsSync(path.join(copy,'.git')));
  fs.rmSync(copy,{recursive:true,maxRetries:3});
}
