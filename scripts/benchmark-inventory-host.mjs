import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,verifyReference,listFiles} from './reference-utils.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json')));
verifyReference(game,lock);const installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
for(const file of listFiles(path.join(root,'dist')))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale inventory runtime: ${file}`);
const target=path.join(game,'balance/benchmark-engine-inventory-host.ts');fs.copyFileSync(path.join(root,'reference/benchmark-inventory-host.ts'),target);
execFileSync(process.execPath,['--import','tsx',target,root,location.game,path.join(root,'.artifacts/inventory-host-benchmark.json')],{cwd:game,stdio:'inherit'});verifyReference(game,lock);
