import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';import {hitReactionsDecision} from '../adapters/hollow-wake/integrate-hit-reactions.mjs';
const args=process.argv.slice(2);assert(args.length===0||(args.length===2&&args[0]==='--location'));
const location=JSON.parse(fs.readFileSync(path.resolve(root,args[1]??'.artifacts/adapter-location.json')));assert.equal(location.hitReactionsDecision,hitReactionsDecision);
const installed=fs.realpathSync(path.join(location.game,'node_modules/@hollow-wake/engine')),archive=fs.readFileSync(location.archive);
assert.equal('sha512-'+createHash('sha512').update(archive).digest('base64'),location.integrity);
const consumer=path.dirname(path.dirname(path.dirname(installed))),lock=JSON.parse(fs.readFileSync(path.join(consumer,'package-lock.json')));assert.equal(lock.packages['node_modules/@hollow-wake/engine'].integrity,location.integrity);
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))]));
const before=snapshot(path.join(location.game,'src')),pkg=snapshot(installed);assert.deepEqual(snapshot(path.join(installed,'dist')),snapshot(path.join(root,'dist')));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/game-hit-reactions-')),fd=fs.openSync(path.join(directory,'reference.txt'),'wx');let proof;
try{execFileSync(process.execPath,['scripts/run-hit-reactions-reference.mjs','--game',location.game],{cwd:root,stdio:['ignore',fd,fd],timeout:240000});proof=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/hit-reactions-reference-verification.json')));assert(proof.passed);assert.equal(proof.game,fs.realpathSync(location.game));}
finally{fs.closeSync(fd);assert.deepEqual(snapshot(path.join(location.game,'src')),before);assert.deepEqual(snapshot(installed),pkg);}
const report={passed:true,directory,game:location.game,reference:proof,archiveSha256:sha256(archive),sourceMapSha256:sha256(JSON.stringify(before)),packageMapSha256:sha256(JSON.stringify(pkg)),sourceAndPackageUnchanged:true};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/game-hit-reactions-verification.json'),report);console.log({passed:true,directory,courses:136});
