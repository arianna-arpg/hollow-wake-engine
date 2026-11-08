import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
const [output,...extra]=process.argv.slice(2);
assert(output && !extra.length,'Provide a fresh report path');
const reportPath=path.resolve(output),rawPath=reportPath+'.raw.json.gz';
assert(!fs.existsSync(reportPath) && !fs.existsSync(rawPath));
const modulePath=path.join(root,'adapters/embedded/equipment-session.mjs');
const testPath=path.join(root,'test/embedded-live-equipment.test.mjs');
const source=fs.readFileSync(modulePath,'utf8'),testSource=fs.readFileSync(testPath,'utf8');
const work=fs.mkdtempSync(path.join(root,'.artifacts/live-equipment-fault-'));
const modified=path.join(work,'session.mjs'),testFile=path.join(work,'course.test.mjs');
const replace=(text,from,to)=>{assert.equal(text.split(from).length,2,'Fault anchor must be unique');return text.replace(from,to);};
const fixtures=testSource.replace(/'\.\.\/([^']+)'/g,(_,file)=>JSON.stringify(pathToFileURL(
 file==='adapters/embedded/equipment-session.mjs'?modified:path.join(root,file)).href));
const faults=[
 {name:'early-publication',target:'live equipment reproduces original mechanical course equip-ring_lapis-during-cast',
  change:text=>replace(text,'const token=state.nextToken++;','const token=state.nextToken++;owner.character=character;')},
 {name:'stale-resource-publication',target:'pending gear publishes against current combat, including another cast, contact RNG and timed damage',
  change:text=>replace(replace(text,'{token,character,source:owner.character,',
   '{token,character,source:owner.character,resources:{life:owner.casting.life,mana:owner.casting.mana},'),
   'const resources={life:Math.min(owner.casting.life,pending.character.sheet.get(\'life\')),\n   mana:Math.min(owner.casting.mana,pending.character.sheet.get(\'mana\'))};',
   'const resources={life:Math.min(pending.resources.life,pending.character.sheet.get(\'life\')),\n   mana:Math.min(pending.resources.mana,pending.character.sheet.get(\'mana\'))};')},
 {name:'cast-reset',target:'live equipment reproduces original mechanical course equip-ring_lapis-during-cast',
  change:text=>replace(text,'owner.casting.setResources(resources);','owner.casting=new owner.casting.constructor(resources);')},
 {name:'combat-random-rewind',target:'pending gear publishes against current combat, including another cast, contact RNG and timed damage',
  change:text=>replace(replace(text,'{token,character,source:owner.character,',
   '{token,character,source:owner.character,random:owner.engine.randomSnapshot(),'),
   'owner.character=pending.character;','owner.character=pending.character;owner.engine.restoreRandom(pending.random);')},
 {name:'silent-unsupported-effect',target:'unsupported or malformed equipment is refused without poisoning live combat or advancing randomness',
  change:text=>replace(text,'fields(item,itemFields);','/* deliberately accept unknown effect fields */')}
];
const report={passed:false,sources:{'adapters/embedded/equipment-session.mjs':sha256(source),
 'test/embedded-live-equipment.test.mjs':sha256(testSource)},cases:[]},logs={};
try{
 fs.writeFileSync(testFile,fixtures,{flag:'wx'});
 for(const fault of [{name:'unchanged-control'},...faults]){
  let text=fault.change?fault.change(source):source;
  text=replace(text,"'../../experiments/embedded-js/session.mjs'",JSON.stringify(pathToFileURL(path.join(root,'experiments/embedded-js/session.mjs')).href));
  fs.writeFileSync(modified,text);
  const syntax=spawnSync(process.execPath,['--check',modified],{encoding:'utf8',windowsHide:true});
  assert.equal(syntax.status,0,syntax.stderr);
  const result=spawnSync(process.execPath,['--test','--test-reporter=tap',testFile],{
   cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024});
  assert(!result.error,result.error?.message);assert.equal(result.signal,null);
  logs[fault.name]=result.stdout+result.stderr;
  if(!fault.change){assert.equal(result.status,0,logs[fault.name]);assert(result.stdout.includes('# pass 17'));}
  else{
   assert.notEqual(result.status,0,fault.name+' was accepted');
   assert(result.stdout.split(/\r?\n/).some(line=>line.startsWith('not ok ') && line.endsWith(' - '+fault.target)),
    fault.name+': intended assertion was not reached');
  }
  report.cases.push({name:fault.name,rejected:!!fault.change,exitCode:result.status,
   modifiedSha256:sha256(text),logSha256:sha256(logs[fault.name])});
  console.log({name:fault.name,rejected:!!fault.change});
 }
 report.passed=true;
}finally{
 try{
  assert.equal(sha256(fs.readFileSync(modulePath)),sha256(source));
  assert.equal(sha256(fs.readFileSync(testPath)),sha256(testSource));
 }finally{
  const resolved=fs.realpathSync(work);
  assert.equal(path.dirname(resolved),fs.realpathSync(path.join(root,'.artifacts')));
  fs.rmSync(resolved,{recursive:true});report.cleaned=!fs.existsSync(resolved);
 }
 const raw=gzipSync(JSON.stringify(logs));report.rawSha256=sha256(raw);
 fs.writeFileSync(rawPath,raw,{flag:'wx'});
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
