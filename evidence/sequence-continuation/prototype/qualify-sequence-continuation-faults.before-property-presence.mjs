import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {build} from 'esbuild';import {root,sha256} from '../scripts/reference-utils.mjs';import {sequenceContinuationContracts} from './sequence-continuation-contracts.mjs';
const attempt=process.argv[2];assert(/^r\d+$/.test(attempt));const owned=fs.realpathSync(path.join(root,'.artifacts')),stem='sequence-continuation-faults-'+attempt;assert(!fs.existsSync(path.join(owned,stem+'.json')));const files=['.artifacts/attack-sequences-continuation.ts','.artifacts/sequence-continuation-contracts.mjs','.artifacts/qualify-sequence-continuation-faults.mjs'];
const read=file=>fs.readFileSync(path.join(root,file)),source=read(files[0]).toString(),require=createRequire(import.meta.url),report={passed:false,candidateOnly:true,sources:Object.fromEntries(files.map(f=>[f,sha256(read(f))])),faults:[]},work=fs.mkdtempSync(path.join(owned,'sequence-continuation-faults-owned-'));
try{
 const faults=[
  ['lost-retired-state','retired:source.retired','retired:false'],
  ['cast-alias-duplicated','const found=casts.get(source);if(found)return found;','const found=casts.get(source);if(false && found)return found;'],
  ['rain-clock-reset','rainAt.set(target,this.rainAt.get(source)!)','rainAt.set(target,0)'],
  ['catch-count-reset','caught:source.caught,retired:','caught:0,retired:'],
  ['recovery-clock-reset','({...r,cast:cast(r.cast),projectile:projectile(r.projectile),','({...r,elapsed:0,cast:cast(r.cast),projectile:projectile(r.projectile),'],
  ['receipt-keeps-live-target','{...source.receipt,target:actor(source.receipt.target)}','{...source.receipt,target:source.receipt.target}'],
  ['source-key-reminted','policy:source.policy,key:source.key','policy:source.policy,key:"reminted"'],
  ['owned-buffs-lost','retired:source.retired,buffs:ownedBuffs','retired:source.retired,buffs:new Map()'],
  ['publish-before-fallible-mapping','const recoveries=this.recoveries.map','runtime.states=ownedStates; const recoveries=this.recoveries.map'],
  ['active-casts-lost','runtime.active=active;runtime.recoveries=recoveries;','runtime.active=new Set();runtime.recoveries=recoveries;'],
 ];
 async function run(label,contents){const file=path.join(work,label+'.cjs');await build({stdin:{contents,loader:'ts',resolveDir:path.join(root,'src')},bundle:true,platform:'node',format:'cjs',outfile:file,logLevel:'silent'});try{return sequenceContinuationContracts(require(file).AttackSequences);}finally{delete require.cache[file];fs.unlinkSync(file);}}
 report.contracts=await run('control',source);assert.equal(report.contracts,23);
 for(const[name,from,to]of faults){assert.equal(source.split(from).length,2,name+' selector');let error;try{await run(name,source.replace(from,to));}catch(e){error=e;}assert(error,name+' escaped');assert.equal(error.code,'ERR_ASSERTION',name+': '+error);report.faults.push({name,detected:true,detection:'independent assertion'});}
 assert.equal(await run('restored',source),23);report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(read(f))===h);report.passed=report.passed&&report.inputsUnchanged;assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
assert(report.passed,report.failure??'Inputs changed');console.log({passed:true,contracts:report.contracts,faults:report.faults.length,restored:true,cleaned:true});
