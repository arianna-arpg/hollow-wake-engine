import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,verifyReference,listFiles} from './reference-utils.mjs';
import {renderInventoryHost} from '../adapters/hollow-wake/integrate-inventory-host.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json')));
const index=process.argv.indexOf('--inventory-adapter');assert(index>=0&&process.argv[index+1],'Pass --inventory-adapter with the retained M11 game');const previous=path.resolve(process.argv[index+1]);
assert.equal(JSON.parse(fs.readFileSync(path.join(previous,'node_modules/@hollow-wake/engine/package.json'))).version,'0.9.0');
const lf=s=>s.replaceAll('\r\n','\n'),originalInventory=fs.readFileSync(path.join(game,'src/engine/inventory.ts'),'utf8');
assert.equal(lf(fs.readFileSync(path.join(previous,'src/engine/stash.ts'),'utf8')),lf(fs.readFileSync(path.join(game,'src/engine/stash.ts'),'utf8')),'M11 control must retain original storage policy');
assert.equal(lf(fs.readFileSync(path.join(previous,'src/engine/inventory.ts'),'utf8')),renderInventoryHost(originalInventory,originalInventory),'M11 inventory overlay changed');
for(const file of ['inventory-host.js','validation.js'])assert.deepEqual(fs.readFileSync(path.join(previous,'node_modules/@hollow-wake/engine/dist',file)),fs.readFileSync(path.join(root,'dist',file)),'M11 geometry control changed');
const installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');for(const file of listFiles(path.join(root,'dist')))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale storage runtime: ${file}`);
verifyReference(game,lock);const target=path.join(game,'balance/benchmark-engine-stash.ts');fs.copyFileSync(path.join(root,'reference/benchmark-stash.ts'),target);
if(process.argv.includes('--check-only')){console.log('Original/M11/M12 benchmark sources and installed geometry verified.');process.exit(0);}
execFileSync(process.execPath,['--import','tsx',target,root,previous,location.game,path.join(root,'.artifacts/stash-benchmark.json')],{cwd:game,stdio:'inherit'});verifyReference(game,lock);
