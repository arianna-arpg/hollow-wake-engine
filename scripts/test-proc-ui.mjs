import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';
const argument=name=>{const i=process.argv.indexOf(name);assert(i>=0&&process.argv[i+1],`${name} required`);return path.resolve(process.argv[i+1]);};
const game=argument('--game'),dist=argument('--dist'),electron=argument('--electron'),baseline=path.join(root,'baseline/milestone-thirty-eight');
const acceptance=JSON.parse(fs.readFileSync(path.join(baseline,'proc-ui-acceptance.json'))),expectedBytes=fs.readFileSync(path.join(baseline,'proc-ui-expected.json')),catalog=fs.readFileSync(path.join(baseline,'proc-ui-catalog.json')),harness=fs.readFileSync(path.join(root,'adapters/hollow-wake/proc-cues-ui.cjs')),server=fs.readFileSync(path.join(game,'launcher/server.cjs'));
assert.equal(sha256(expectedBytes),acceptance.expectedSha256);assert.equal(sha256(catalog),acceptance.catalogueSha256);assert.equal(sha256(harness),acceptance.harnessSha256);assert.equal(sha256(server),acceptance.serverSha256);const expected=JSON.parse(expectedBytes);
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(f=>[f,sha256(fs.readFileSync(path.join(dir,f)))])),runtimeDir=path.join(game,'node_modules/@hollow-wake/engine/dist'),inputs={source:snapshot(path.join(game,'src')),runtime:snapshot(runtimeDir)},build=JSON.parse(fs.readFileSync(path.join(dist,'sdk-build.json')));
assert.deepEqual(build.sourceSha256,inputs.source,'Stale renderer source');assert(!build.originalItems&&!build.originalEscape,'Expected the complete adapted game');
if(build.runtimeSha256!==undefined)assert.deepEqual(build.runtimeSha256,inputs.runtime,'Stale renderer SDK');
const outputs=()=>Object.fromEntries(listFiles(dist).filter(f=>f!=='sdk-build.json').map(f=>[f,sha256(fs.readFileSync(path.join(dist,f)))]));assert.deepEqual(outputs(),build.outputs,'Renderer output changed since build');
const trial=fs.mkdtempSync(path.join(root,'.artifacts/proc-ui-')),reports=path.join(trial,'balance/reports');fs.mkdirSync(reports,{recursive:true});fs.mkdirSync(path.join(trial,'launcher'));fs.symlinkSync(dist,path.join(trial,'dist'),'junction');
fs.writeFileSync(path.join(trial,'launcher/server.cjs'),server,{flag:'wx'});fs.writeFileSync(path.join(trial,'balance/proc-cues-ui.cjs'),harness,{flag:'wx'});fs.writeFileSync(path.join(reports,'proc-catalog.json'),catalog,{flag:'wx'});
const fd=fs.openSync(path.join(trial,'process.txt'),'wx');let passed=false;
try{
 execFileSync(electron,[path.join(trial,'balance/proc-cues-ui.cjs')],{cwd:trial,stdio:['ignore',fd,fd],windowsHide:true,timeout:150000});
 const log=fs.readFileSync(path.join(reports,'proc-cues-ui.log'),'utf8');assert.match(log,/PASS: stored materials/);
 const actual={ward:JSON.parse(fs.readFileSync(path.join(reports,'native-ward.json'))),stages:log.split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>JSON.parse(s))};assert.deepEqual(actual,expected,'Native proc renderer observations changed');writeJSON(path.join(trial,'observed.json'),actual);passed=true;console.log('PASS: all ten proc renderer stages, earned ward, cooldown and visible ward count match the retained original control');
}finally{
 fs.closeSync(fd);assert.deepEqual(snapshot(path.join(game,'src')),inputs.source);assert.deepEqual(snapshot(runtimeDir),inputs.runtime);assert.deepEqual(outputs(),build.outputs);
 writeJSON(path.join(root,'.artifacts/proc-ui-verification.json'),{game,dist,reports,trial,passed,harnessSha256:sha256(harness),expectedSha256:sha256(expectedBytes),stages:10,sourceUnchanged:true,runtimeUnchanged:true,bundleUnchanged:true,runtimeRecordedAtBuild:build.runtimeSha256!==undefined,scope:acceptance.scope});
}
