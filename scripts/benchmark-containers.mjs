import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,verifyReference,listFiles} from './reference-utils.mjs';import {containerFiles,renderContainers} from '../adapters/hollow-wake/integrate-containers.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json')));
const index=process.argv.indexOf('--previous-adapter');assert(index>=0&&process.argv[index+1],'Pass the retained M12 game as --previous-adapter');const previous=path.resolve(process.argv[index+1]),sources={};
assert.equal(JSON.parse(fs.readFileSync(path.join(previous,'node_modules/@hollow-wake/engine/package.json'))).version,'0.10.0');
for(const file of containerFiles){sources[file]=fs.readFileSync(path.join(game,file),'utf8');assert.equal(fs.readFileSync(path.join(previous,file),'utf8').replaceAll('\r\n','\n'),sources[file].replaceAll('\r\n','\n'),'Prior container control must remain original');}
const expected=renderContainers(sources,sources);for(const file of containerFiles)assert.equal(fs.readFileSync(path.join(location.game,file),'utf8').replaceAll('\r\n','\n'),expected[file]);
for(const file of ['inventory-host.js','validation.js'])assert.deepEqual(fs.readFileSync(path.join(previous,'node_modules/@hollow-wake/engine/dist',file)),fs.readFileSync(path.join(root,'dist',file)),'Prior geometry control changed');
const installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');for(const file of listFiles(path.join(root,'dist')))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale container runtime: ${file}`);
verifyReference(game,lock);const target=path.join(game,'balance/benchmark-engine-containers.ts');fs.copyFileSync(path.join(root,'reference/benchmark-containers.ts'),target);
if(process.argv.includes('--check-only')){console.log('Original/M12/M13 container benchmark sources and packages verified.');process.exit(0);}
execFileSync(process.execPath,['--import','tsx',target,root,previous,location.game,path.join(root,'.artifacts/container-benchmark.json')],{cwd:game,stdio:'inherit'});verifyReference(game,lock);
