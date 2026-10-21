import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,listFiles,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
const at=process.argv.indexOf('--previous-adapter');assert(at>=0&&process.argv[at+1],'Pass retained v0.16.0 game as --previous-adapter');
const previous=path.resolve(process.argv[at+1]),location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json'))),reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),oldEngine=path.join(previous,'node_modules/@hollow-wake/engine'),newEngine=path.join(location.tooling,'node_modules/@hollow-wake/engine');
assert.equal(JSON.parse(fs.readFileSync(path.join(oldEngine,'package.json'))).version,'0.16.0');assert.equal(JSON.parse(fs.readFileSync(path.join(newEngine,'package.json'))).version,'0.16.1');
const files=listFiles(path.join(root,'dist'));assert.deepEqual(listFiles(path.join(newEngine,'dist')),files);assert.deepEqual(listFiles(path.join(oldEngine,'dist')),files);
for(const file of files){const built=fs.readFileSync(path.join(root,'dist',file));assert(built.equals(fs.readFileSync(path.join(newEngine,'dist',file))),`Stale installed ${file}`);if(!['passive-grants.js','passive-grants.js.map'].includes(file))assert(built.equals(fs.readFileSync(path.join(oldEngine,'dist',file))),`Control differs beyond grant vectors: ${file}`);}
for(const file of new Set([...Object.keys(lock.files),...location.files]))assert.equal(fs.readFileSync(path.join(previous,file),'utf8').replaceAll('\r\n','\n'),fs.readFileSync(path.join(location.game,file),'utf8').replaceAll('\r\n','\n'),`Game control source differs: ${file}`);
verifyReference(reference,lock);
for(const [source,stem,args] of [['benchmark-grant-rebuilds.ts','grant-vector-rebuild',[root,previous,location.game]],['benchmark-rebuild-actions.ts','grant-vector-action',[previous,location.game]]]){
 const helper=path.join(reference,'balance',source),output=path.join(root,'.artifacts',stem+'-benchmark.json');fs.copyFileSync(path.join(root,'reference',source),helper);execFileSync(process.execPath,['--import','tsx',helper,...args,output],{cwd:reference,stdio:'inherit'});
 const report=JSON.parse(fs.readFileSync(output));report.grantModules={previousSha256:sha256(fs.readFileSync(path.join(oldEngine,'dist/passive-grants.js'))),currentSha256:sha256(fs.readFileSync(path.join(newEngine,'dist/passive-grants.js')))};writeJSON(output,report);
}
verifyReference(reference,lock);
