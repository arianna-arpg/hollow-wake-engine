import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
import {bankPaths,renderBankWorld,renderGaugeActor,renderBankChannel} from '../adapters/hollow-wake/integrate-channel-banks.mjs';
const at=process.argv.indexOf('--previous-adapter');assert(at>=0&&process.argv[at+1],'Pass retained v0.30 game as --previous-adapter');
const previous=path.resolve(process.argv[at+1]),artifacts=path.join(root,'.artifacts'),location=JSON.parse(fs.readFileSync(path.join(artifacts,'adapter-location.json')));
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),oldEngine=path.join(previous,'node_modules/@hollow-wake/engine'),newEngine=path.join(location.tooling,'node_modules/@hollow-wake/engine');
assert.equal(fs.realpathSync(path.join(location.game,'node_modules/@hollow-wake/engine')),fs.realpathSync(newEngine));assert.notEqual(fs.realpathSync(oldEngine),fs.realpathSync(newEngine));
assert.equal(JSON.parse(fs.readFileSync(path.join(oldEngine,'package.json'))).version,'0.30.0');assert.equal(JSON.parse(fs.readFileSync(path.join(newEngine,'package.json'))).version,'0.31.0');
const files=listFiles(path.join(root,'dist')),oldFiles=listFiles(path.join(oldEngine,'dist'));
const comparisonAt=process.argv.indexOf('--comparison-adapter');assert(comparisonAt<0||process.argv[comparisonAt+1]);const comparison=comparisonAt<0?undefined:path.resolve(process.argv[comparisonAt+1]);
function snapshot(game){
 if(!game)return undefined;const engine=path.join(game,'node_modules/@hollow-wake/engine');assert.notEqual(fs.realpathSync(engine),fs.realpathSync(newEngine));assert.notEqual(fs.realpathSync(engine),fs.realpathSync(oldEngine));
 const runtime=Object.fromEntries(listFiles(path.join(engine,'dist')).map(file=>[file,sha256(fs.readFileSync(path.join(engine,'dist',file)))]));
 const source=Object.fromEntries(listFiles(path.join(game,'src')).map(file=>[file,sha256(fs.readFileSync(path.join(game,'src',file)))]));return {runtime,source};
}
const comparisonBefore=snapshot(comparison),renderers=new Map([[bankPaths.world,renderBankWorld],[bankPaths.actor,renderGaugeActor],[bankPaths.channel,renderBankChannel]]);
function verify(){
 assert.deepEqual(listFiles(path.join(newEngine,'dist')),files);assert.deepEqual(files.filter(file=>!/^(channel-banks|actor-gauges)\./.test(file)),oldFiles);
 for(const file of files){const bytes=fs.readFileSync(path.join(root,'dist',file));assert(bytes.equals(fs.readFileSync(path.join(newEngine,'dist',file))),'Stale candidate '+file);if(oldFiles.includes(file))assert(bytes.equals(fs.readFileSync(path.join(oldEngine,'dist',file))),'Changed predecessor '+file);}
 const oldSource=listFiles(path.join(previous,'src'));assert.deepEqual(listFiles(path.join(location.game,'src')).filter(file=>'src/'+file!==bankPaths.binding),oldSource);
 for(const relative of oldSource){const file='src/'+relative,prior=fs.readFileSync(path.join(previous,file),'utf8'),expected=renderers.has(file)?renderers.get(file)(prior):prior;
  assert.equal(fs.readFileSync(path.join(location.game,file),'utf8').replaceAll('\r\n','\n'),expected.replaceAll('\r\n','\n'),'Host differs beyond bank/gauge overlay: '+file);
 }
 assert.equal(fs.readFileSync(path.join(location.game,bankPaths.binding),'utf8'),fs.readFileSync(path.join(root,'adapters/hollow-wake/channelBankAdapter.ts'),'utf8'));
 verifyReference(reference,lock);assert.deepEqual(snapshot(comparison),comparisonBefore,'Comparison installation changed');
}
verify();const bytes=fs.readFileSync(path.join(root,'reference/benchmark-channel-banks.ts')),helper=path.join(reference,'balance','benchmark-sdk-banks-'+randomUUID()+'.ts'),validationOnly=process.argv.includes('--validate-only');
const dir=fs.mkdtempSync(path.join(artifacts,'bank-benchmark-')),output=path.join(dir,validationOnly?'validation.json':'benchmark.json');
try{
 fs.writeFileSync(helper,bytes,{flag:'wx'});const typeLog=path.join(dir,'helper-types.txt'),fd=fs.openSync(typeLog,'wx');
 try{execFileSync(process.execPath,[path.join(reference,'node_modules/typescript/bin/tsc'),'-p','tsconfig.sim.json','--pretty','false'],{cwd:reference,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
 execFileSync(process.execPath,['--expose-gc','--import','tsx',helper,previous,location.game,output,...(comparison?['--comparison-adapter',comparison]:[]),...(validationOnly?['--validate-only']:[])],{cwd:reference,stdio:'inherit'});
 verify();const result=JSON.parse(fs.readFileSync(output));assert.equal(result.validationOnly,validationOnly);
 Object.assign(result,{helperTypesPassed:true,helperSha256:sha256(bytes),installedRuntimeFilesMatchBuild:files.length,unchangedPredecessorRuntimeFiles:oldFiles.length,installedArchive:location.integrity,comparison:comparisonBefore?{sourceFiles:Object.keys(comparisonBefore.source).length,runtimeFiles:Object.keys(comparisonBefore.runtime).length,manifestSha256:sha256(JSON.stringify(comparisonBefore))}:undefined});
 writeJSON(output,result);writeJSON(path.join(artifacts,'channel-bank-'+(validationOnly?'benchmark-validation':'benchmark')+'-location.json'),{output});
}finally{if(fs.existsSync(helper)&&fs.readFileSync(helper).equals(bytes))fs.unlinkSync(helper);}
