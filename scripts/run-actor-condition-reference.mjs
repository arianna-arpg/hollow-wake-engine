import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';

const game=path.join(root,'.reference'),artifacts=path.join(root,'.artifacts');
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const acceptanceFile=path.join(root,'baseline/milestone-thirty-seven/acceptance.json');
const acceptance=JSON.parse(fs.readFileSync(acceptanceFile));
assert.equal(acceptance.source,lock.commit);assert.equal(acceptance.courses,49);
assert.equal(acceptance.helpers.length,5);assert.equal(acceptance.fixtures.length,6);
verifyReference(game,lock);fs.mkdirSync(artifacts,{recursive:true});
const output=fs.mkdtempSync(path.join(artifacts,'reference-actor-conditions-'));
const helpers=new Map(),typed=[];
for(const row of acceptance.helpers){
  const source=fs.readFileSync(path.join(root,row.file),'utf8');assert.equal(sha256(source),row.sha256,'Changed oracle helper: '+row.file);
  const name=path.basename(row.file,'.ts'),directory=path.join(output,name);fs.mkdirSync(directory);
  const imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
  const runtimeFile=path.join(directory,'capture.ts'),typedFile=path.join(directory,'typed.ts');
  fs.writeFileSync(runtimeFile,source.replace(imports,(_all,_q,file)=>JSON.stringify(pathToFileURL(path.join(game,'src',file+'.ts')).href)),{flag:'wx'});
  fs.writeFileSync(typedFile,source.replace(imports,(_all,_q,file)=>JSON.stringify(path.relative(directory,path.join(game,'src',file)).replaceAll('\\','/'))),{flag:'wx'});
  helpers.set(row.file,{runtimeFile,sha256:row.sha256});typed.push(typedFile);
}
const config=path.join(output,'tsconfig.json');
writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[path.join(game,'src'),...typed],exclude:[]});
function run(name,args,cwd){
  const log=path.join(output,name+'.txt'),fd=fs.openSync(log,'wx');
  try{execFileSync(process.execPath,args,{cwd,stdio:['ignore',fd,fd]});}
  finally{fs.closeSync(fd);verifyReference(game,lock);}
}
run('types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config],output);
const data=new Map(),results=[];
for(const row of acceptance.fixtures){
  assert(/^[a-z0-9-]+$/.test(row.name));
  const helper=helpers.get(row.helper);assert(helper);assert.equal(helper.sha256,row.helperSha256);
  assert.deepEqual(row.args,row.name.endsWith('-before-import')?['--before-import']:[]);
  const compressed=fs.readFileSync(path.join(root,row.file)),expected=gunzipSync(compressed);
  assert.equal(sha256(compressed),row.compressedSha256);assert.equal(sha256(expected),row.fixtureSha256);
  const destination=path.join(output,row.name+'.json');
  run(row.name,['--import','tsx',helper.runtimeFile,destination,...row.args],game);
  const actual=fs.readFileSync(destination);assert(actual.equals(expected),'Original condition trace changed: '+row.name);
  data.set(row.name,JSON.parse(actual));results.push({name:row.name,courses:row.courses,sha256:sha256(actual),byteEqual:true});
  console.log('PASS original '+row.name);
}

// Independent declared expectations complement raw source parity. They are
// not generated from either a candidate SDK or a fresh expected-data capture.
const courses=new Map(data.get('actor-condition-boundary').courses.map(row=>[row.name,row]));
const holds=(name,id)=>courses.get(name).steps.map(step=>step.after.actorConditions.includes(id));
for(const [name,id,expected]of [
  ['low-life','lowLife',[true,false,false,false]],['full-life','fullLife',[false,true,true,true]],
  ['low-mana','lowMana',[true,false,false,false]],['full-mana','fullMana',[false,true,true,true]],
  ['has-es','hasEs',[false,false,true,true]],['full-es','fullEs',[false,true,true,true]],
  ['low-es','lowEs',[true,false,false,false]],['poised','poised',[false,false,true,true]],
])assert.deepEqual(holds(name+'-threshold',id),expected,name);
assert.deepEqual(holds('actor-specific-low-life-line','lowLife'),[true,false,false,false]);
assert.deepEqual(holds('zero-mana-and-shield-maxima','hasEs'),[false,false,true]);
for(const id of ['lowMana','fullMana','lowEs','fullEs'])assert.deepEqual(holds('zero-mana-and-shield-maxima',id),[false,false,false]);
assert.deepEqual(holds('stance-strict-threshold-and-precedence','moving'),[true,true,false,true,false,false,false]);
assert.deepEqual(holds('stance-strict-threshold-and-precedence','stationary'),[false,false,true,false,false,false,true]);
for(const id of ['guarding','esRecharging'])assert.deepEqual(holds('guard-poise-break-recharge',id),[false,true,true,false,false]);
assert.deepEqual(holds('guard-poise-break-recharge','poised'),[false,true,false,false,false]);
assert.deepEqual(holds('guard-poise-break-recharge','poiseBroken'),[false,false,true,true,false]);
for(const id of ['recentlyHit','recentlyCrit','recentlyKilled','recentlyHurt','recentlyBlocked','recentlyEvaded','recentlyMoved','recentlyHealed'])assert.deepEqual(holds('recency-'+id,id),[false,true,false,false,true,true]);
assert.deepEqual(holds('recency-notHurtRecently','notHurtRecently'),[true,false,true,true,false,false]);
assert.deepEqual(holds('combo-watch-freshness-bits','comboVaried'),[false,false,true,false,true,false,true,false,true,false]);
assert.deepEqual(holds('combo-watch-freshness-bits','comboRepeated'),[false,false,false,true,true,false,true,false,true,false]);
assert.deepEqual(holds('stride-lazy-reach-and-inclusive-threshold','strided'),[false,false,true,true,false,false]);
for(const row of courses.values())for(const step of row.steps){
  assert(step.queueIdentityPreserved&&step.after.sheetMarkerCurrent);
  const reads=['life','mana','energyShield','lowLifeLine'];
  if(step.before.stride>0&&!step.before.strideSpent)reads.push('strideReach');
  assert.deepEqual(step.reads.map(read=>read.stat),reads,row.name+'/'+step.label);
  for(const call of step.publications){assert.equal(call.maskAtSink,step.after.mask);assert.deepEqual(call.roseAtSink,step.after.rose);assert.deepEqual(call.active,step.after.actorConditions);}
  assert.deepEqual(step.after.actorConditions,step.after.sheetConditions);
}
const replacement=courses.get('birth-stability-sheet-replacement-last-fold').steps;
assert.deepEqual(replacement.map(step=>step.publications.length),[1,0,1,1,0,1,1]);
assert.deepEqual(replacement[0].after.rose,[]);assert.deepEqual(replacement[3].after.rose,[]);
for(const size of [14,15,16,17]){
  const row=courses.get('queue-cap-prefilled-'+size),change=row.steps[1];assert.equal(change.after.rose.length,Math.max(size,16));
  assert.deepEqual(change.after.rose.slice(0,size),Array(size).fill('moving'));
  assert.deepEqual(change.after.rose.slice(size),size<16?['lowLife','lowMana'].slice(0,16-size):[]);assert.equal(row.steps[2].publications.length,0);
}
const timer=courses.get('timer-phase-recency-combo-expiry').steps;
assert(timer[0].after.actorConditions.includes('recentlyHit')&&timer[0].after.actorConditions.includes('comboVaried'));
assert(timer[0].after.since[0]>4);assert.equal(timer[0].after.comboLeft,0);
assert(!timer[1].after.actorConditions.includes('recentlyHit')&&!timer[1].after.actorConditions.includes('comboVaried'));
const stride=courses.get('timer-phase-stride-spend-before-fold').steps;
assert(stride[0].after.actorConditions.includes('strided'));assert.equal(stride[1].after.stride,0);assert(!stride[1].after.actorConditions.includes('strided'));
const native=data.get('actor-condition-native').courses;
for(const row of native)assert(row.conditionEvents.every(event=>event.queuedAtDispatch===0));
const checkpoints=new Map(native[0].checkpoints.map(row=>[row.name,row]));
assert(!checkpoints.get('hurt-stamped-before-next-fold').state.actorConditions.includes('recentlyHurt'));
assert(checkpoints.get('hurt-condition-published').state.actorConditions.includes('recentlyHurt'));
const wards=native[0].conditionEvents.filter(event=>event.condition==='lowLife');assert.equal(wards.length,1);assert(wards[0].wardAfter>wards[0].wardBefore);
verifyReference(game,lock);
writeJSON(path.join(artifacts,'actor-condition-reference-verification.json'),{source:lock.commit,acceptanceSha256:sha256(fs.readFileSync(acceptanceFile)),output,helpers:5,fixtures:results,courses:49,typesPassed:true,independentAssertionsPassed:true,sourceUnchanged:true,scope:'Pinned original actor condition observations only. This neither tests nor implements the proposed SDK condition recovery policy.'});
console.log('Original actor condition reference passed: 49 courses, five typed helpers, six unchanged fixtures and independent boundary assertions.');
