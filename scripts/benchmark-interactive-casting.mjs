import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
import {interactiveCastFile,renderInteractiveCasting} from '../adapters/hollow-wake/integrate-interactive-casting.mjs';
const pos=process.argv.indexOf('--previous-adapter');assert(pos>=0&&process.argv[pos+1],'Pass retained v0.20 game as --previous-adapter');
const previous=path.resolve(process.argv[pos+1]),location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json'))),reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),oldEngine=path.join(previous,'node_modules/@hollow-wake/engine'),newEngine=path.join(location.tooling,'node_modules/@hollow-wake/engine');
assert.equal(JSON.parse(fs.readFileSync(path.join(oldEngine,'package.json'))).version,'0.20.0');assert.equal(JSON.parse(fs.readFileSync(path.join(newEngine,'package.json'))).version,'0.21.0');
const files=listFiles(path.join(root,'dist'));assert.deepEqual(listFiles(path.join(newEngine,'dist')),files);
for(const file of files){const built=fs.readFileSync(path.join(root,'dist',file));assert(built.equals(fs.readFileSync(path.join(newEngine,'dist',file))),`Stale installed ${file}`);if(!file.startsWith('interactive-casting.'))assert(built.equals(fs.readFileSync(path.join(oldEngine,'dist',file))),`Unexpected runtime control difference: ${file}`);}
for(const file of new Set([...Object.keys(lock.files),...location.files])){
 const old=fs.readFileSync(path.join(previous,file),'utf8'),actual=fs.readFileSync(path.join(location.game,file),'utf8'),expected=file===interactiveCastFile?renderInteractiveCasting(old,fs.readFileSync(path.join(reference,file),'utf8')):old;
 assert.equal(actual.replaceAll('\r\n','\n'),expected.replaceAll('\r\n','\n'),`Game control differs: ${file}`);
}
verifyReference(reference,lock);
const bytes=fs.readFileSync(path.join(root,'reference/benchmark-interactive-casting.ts')),helper=path.join(reference,'balance/benchmark-sdk-interactive-'+randomUUID()+'.ts'),dir=fs.mkdtempSync(path.join(root,'.artifacts/interactive-benchmark-')),output=path.join(dir,'benchmark.json');
try{fs.writeFileSync(helper,bytes,{flag:'wx'});execFileSync(process.execPath,['--import','tsx',helper,previous,location.game,output],{cwd:reference,stdio:'inherit'});verifyReference(reference,lock);const result=JSON.parse(fs.readFileSync(output));result.moduleSha256=sha256(fs.readFileSync(path.join(newEngine,'dist/interactive-casting.js')));writeJSON(output,result);writeJSON(path.join(root,'.artifacts/interactive-casting-benchmark-location.json'),{output});}
finally{if(fs.existsSync(helper)&&fs.readFileSync(helper).equals(bytes))fs.unlinkSync(helper);}
