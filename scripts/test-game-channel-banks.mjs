import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),location=JSON.parse(fs.readFileSync(path.join(artifacts,'adapter-location.json'))),installed=path.join(location.tooling,'node_modules/@hollow-wake/engine');
assert.equal(fs.realpathSync(path.join(location.game,'node_modules/@hollow-wake/engine')),fs.realpathSync(installed));
for(const name of ['m36-initial-candidate','m36-compact-candidate']){
 const control=path.join(artifacts,name,'retained.json');if(!fs.existsSync(control))continue;
 const initial=JSON.parse(fs.readFileSync(control));
 assert.notEqual(fs.realpathSync(path.join(initial.tooling,'node_modules/@hollow-wake/engine')),fs.realpathSync(installed),'Refusing to mutate retained M36 installation: '+name);
}
// A managed host may share the verified candidate package for read-only
// comparisons. Deliberate faults always require an independent installation.
if(!process.argv.includes('--skip-faults'))for(const name of fs.readdirSync(artifacts).filter(name=>/^m\d+-adapter-location\.json$/.test(name))){
 const prior=JSON.parse(fs.readFileSync(path.join(artifacts,name)));if(path.resolve(prior.game)===path.resolve(location.game))continue;
 assert.notEqual(fs.realpathSync(path.join(prior.tooling,'node_modules/@hollow-wake/engine')),fs.realpathSync(installed),'Refusing to mutate retained installation: '+name);
}
const built=path.join(root,'dist'),files=listFiles(built),hostFiles=['src/engine/world.ts','src/engine/actor.ts','src/engine/channelCastingAdapter.ts','src/engine/channelBankAdapter.ts'];
const hostBytes=new Map(hostFiles.map(file=>[file,fs.readFileSync(path.join(location.game,file))]));
assert(hostBytes.get(hostFiles[0]).includes('channelBanks.decay(a, dt);'));
assert(hostBytes.get(hostFiles[1]).includes('this.sdkActorGauges.refresh(this, this.sheet);'));
function verifyInstalled(){
 assert.deepEqual(listFiles(path.join(installed,'dist')),files);
 for(const file of files)assert(fs.readFileSync(path.join(installed,'dist',file)).equals(fs.readFileSync(path.join(built,file))),'Stale or unrestored SDK runtime: '+file);
 for(const [file,bytes]of hostBytes)assert(fs.readFileSync(path.join(location.game,file)).equals(bytes),'Host not restored: '+file);
}
verifyInstalled();
const baseline=path.join(root,'baseline/milestone-thirty-six'),acceptance=JSON.parse(fs.readFileSync(path.join(baseline,'acceptance.json'))),decision=JSON.parse(fs.readFileSync(path.join(baseline,'gauge-namespace-refresh.json')));
assert.equal(decision.decision,'gauge-namespace-refresh/v1');
const output=fs.mkdtempSync(path.join(artifacts,'game-channel-banks-')),sources=[];
const sparseAcceptance=JSON.parse(fs.readFileSync(path.join(baseline,'absent-counts-acceptance.json')));
assert.equal(sparseAcceptance.source,acceptance.source);
const fixtures=[...acceptance.fixtures,sparseAcceptance.fixture];
for(const row of fixtures){
 const source=fs.readFileSync(path.join(root,row.helper??'reference/export-'+row.name+'.ts')),compressed=fs.readFileSync(path.join(baseline,row.name+'.json.gz')),raw=gunzipSync(compressed);
 assert.equal(sha256(source),row.helperSha256);assert.equal(sha256(compressed),row.compressedSha256);assert.equal(sha256(raw),row.fixtureSha256);
 let expected=raw;const intentional=[];
 if(row.name==='actor-gauges'){
  // This expectation is derived solely from the independently specified,
  // pre-implementation decision. Candidate output is never an oracle input.
  const data=JSON.parse(raw),diagnostics=data.results.filter(course=>course.diagnostic);
  assert.equal(diagnostics.length,6);
  for(const requirement of decision.expected){
   const course=diagnostics.find(course=>course.name===requirement.course);assert(course);
   for(const index of requirement.steps??[requirement.step]){
    const step=course.steps[index],[key,value]=requirement.onlyPositiveGauge;assert(step.after.gauges.some(([id])=>id===key));
    step.after.gauges=step.after.gauges.map(([id])=>[id,id===key?value:0]);step.after.damage=requirement.damage;step.after.publicationCount=requirement.publicationCount;
    if(index===(requirement.steps?.[0]??requirement.step)&&step.command.kind!=='publish-native-brim-directly')step.publications=[{phase:step.command.kind,sheet:step.after.sheet,entries:[[key,value]]}];
    intentional.push({course:course.name,step:index,fields:['after.gauges','after.damage','after.publicationCount',...(step.publications.length?['publications']:[])]});
   }
  }
  expected=Buffer.from(JSON.stringify(data,null,2)+'\n');
 }
 const helper=path.join(location.game,'balance','sdk-banks-'+randomUUID()+'.ts');
 sources.push({name:row.name,source,helper,expected,originalSha256:row.fixtureSha256,expectedSha256:sha256(expected),intentional});
 fs.writeFileSync(path.join(output,row.name+'-expected.json'),expected);
}
function capture(source,label){
 const file=path.join(output,label+'-'+source.name+'.json');
 const stdout=execFileSync(process.execPath,['--import','tsx',source.helper,file],{cwd:location.game,encoding:'utf8',maxBuffer:16*1024*1024});fs.writeFileSync(path.join(output,label+'-'+source.name+'.txt'),stdout);
 const actual=fs.readFileSync(file);
 if(!actual.equals(source.expected)){
  // Deep comparison provides a useful local diagnostic; equality remains exact.
  assert.deepEqual(JSON.parse(actual),JSON.parse(source.expected),'Bank/gauge observations differ: '+source.name);
  assert.fail('Raw formatting differs: '+source.name);
 }
 return {name:source.name,label,sha256:sha256(actual),exactExpectedMatch:true,originalByteEqual:source.originalSha256===sha256(actual)};
}
const faults=[
 ['bank-retained-fill-reset','channel-banks','bank.inst = instance;','bank.fill = 0; bank.inst = instance;','channel-banks'],
 ['bank-spec-rebinding-lost','channel-banks','bank.spec = spec;','void 0;','channel-banks'],
 ['bank-release-lookup-lost','channel-banks','return actor.brims?.get(this.ports.key(instance));','return undefined;','channel-banks'],
 ['bank-held-exclusion-lost','channel-banks',"cast?.mode === 'channel' && cast.held",'false && cast.held','channel-banks'],
 ['bank-empty-removal-lost','channel-banks','if (bank.fill <= 0) {\n                actor.brims.delete(key);','if (bank.fill <= 0) {\n                void 0;','channel-banks'],
 ['bank-plateau-boundary-lost','channel-banks','bank.fill >= spec.bankAt','bank.fill > spec.bankAt','channel-banks'],
 ['bank-live-context-lost','channel-banks','this.ports.decayMultiplier(actor, bank)','1','channel-banks'],
 ['bank-detached-fill-clamped','channel-banks','bank.fill = next;','bank.fill = Math.max(0, next);','channel-banks'],
 ['gauge-namespace-omitted','actor-gauges','cells[at] !== kind || cells[at + 1] !== id','cells[at + 1] !== id','actor-gauges'],
 ['gauge-sheet-replacement-ignored','actor-gauges','this.invalid || this.sink !== sink','this.invalid','actor-gauges'],
 ['gauge-pips-rounded-down','actor-gauges',"Math.round(finite(bank.fill, 'Brim fill') * 5)","Math.floor(finite(bank.fill, 'Brim fill') * 5)",'actor-gauges'],
 ['gauge-derived-key-prefixed','actor-gauges',"cells.push(kind, id, value, kind === 'derived' ? id : kind + ':' + id)","cells.push(kind, id, value, kind + ':' + id)",'actor-gauges'],
 ['gauge-zero-records-published','actor-gauges','if (value <= 0)','if (value < 0)','actor-gauges'],
 ['gauge-absent-stacks-invented','actor-gauges',"if (stacks !== undefined)\n                    this.observe('status', id, stacks);","this.observe('status', id, stacks ?? 1);",'absent-counts'],
 ['gauge-absent-reserve-pips-invented','actor-gauges',"if (pips !== undefined)\n                        this.observe('reserve', id, pips);","this.observe('reserve', id, pips ?? 1);",'absent-counts'],
 ['host-bank-decay-disconnected',hostFiles[0],'channelBanks.decay(a, dt);','void 0;','channel-banks',true],
 ['host-gauge-publication-disconnected',hostFiles[1],'this.sdkActorGauges.refresh(this, this.sheet);','void 0;','actor-gauges',true],
 ['host-bank-creation-detached',hostFiles[2],'channelBanks.bind(actor, state.inst, spec)','({fill: 0, inst: state.inst, spec})','channel-banks',true],
];
const observations=[],reports=[];
try{
 for(const source of sources)fs.writeFileSync(source.helper,source.source,{flag:'wx'});
 for(const config of ['tsconfig.json','tsconfig.launcher.json','tsconfig.sim.json']){
  const log=path.join(output,config+'.txt'),fd=fs.openSync(log,'wx');try{execFileSync(process.execPath,[path.join(location.game,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:location.game,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
 }
 for(const source of sources){observations.push(capture(source,'candidate'));console.log('Candidate matches '+source.name+' expected observations.');}
 if(!process.argv.includes('--skip-faults'))for(const [name,file,before,after,fixture,native]of faults){
  const target=native?path.join(location.game,file):path.join(installed,'dist',file+'.js'),original=fs.readFileSync(target),text=original.toString();assert.equal(text.split(before).length,2,'Fault site moved: '+name);
  let detected=false;
  try{
   fs.writeFileSync(target,text.replace(before,after));
   try{capture(sources.find(source=>source.name===fixture),'fault-'+name);}catch(error){
    const detail=String(error.stdout??'')+String(error.stderr??'');assert(error.code==='ERR_ASSERTION'||error.status!==undefined&&/AssertionError/.test(detail)&&!/SyntaxError|ERR_MODULE_NOT_FOUND|TypeError/.test(detail),'Fault did not reach behavior: '+detail);
    fs.writeFileSync(path.join(output,name+'-detected.txt'),String(error)+'\n'+detail);detected=true;
   }
  }finally{fs.writeFileSync(target,original);}
  assert(detected,'Undetected installed fault: '+name);reports.push({name,detected});console.log('Detected installed fault: '+name);
 }
}finally{
 for(const source of sources)if(fs.existsSync(source.helper)&&fs.readFileSync(source.helper).equals(source.source))fs.unlinkSync(source.helper);
 verifyInstalled();
}
writeJSON(path.join(artifacts,'game-channel-bank-verification.json'),{game:location.game,output,version:JSON.parse(fs.readFileSync(path.join(installed,'package.json'))).version,packageIntegrity:location.integrity,installedRuntimeFilesMatchBuild:files.length,gameLauncherAndCaptureTypeChecks:true,fixtures,observations,oracle:sources.map(({name,originalSha256,expectedSha256,intentional})=>({name,originalSha256,expectedSha256,intentional})),installedFaults:reports,allInstalledFilesAndHostRestored:true});
console.log('Installed bank/gauge comparison passed; original bank traces unchanged, namespace correction confined to the pre-specified diagnostics.');
