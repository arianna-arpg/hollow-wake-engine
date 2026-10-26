import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),arg=process.argv.indexOf('--location'),location=JSON.parse(fs.readFileSync(arg<0?path.join(artifacts,'adapter-location.json'):path.resolve(process.argv[arg+1])));
const readOnly=process.argv.includes('--read-only'),game=location.game,installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
if(!readOnly){
 assert.equal(location.procAdapterDecision,'proc-game-adapter/v1','Requires the complete proc adapter');
 const canonical=p=>fs.realpathSync(p).toLowerCase();
 for(const file of ['m36-condition-control/retained.json','m37-initial-candidate/retained.json','m37-proc-control/retained.json','m38-prepared-adapter-location.json','m38-proc-initial/retained.json','m38-observation-control/retained.json','m38-native-array-initial-control/retained.json','m38-effect-control/retained.json','m39-ward-initial-control/retained.json','m39-delayed-control/retained.json','m40-delayed-initial-control/retained.json','m40-buff-control/retained.json','m40-measured-control/retained.json','m41-buff-initial-control/retained.json','m41-buff-control/retained.json','m41-measured-control/retained.json', 'm41-timer-control/retained.json']){
  const controlPath=path.join(artifacts,file);if(!fs.existsSync(controlPath))continue;const retained=JSON.parse(fs.readFileSync(controlPath)),control=retained.location??retained;
  assert.notEqual(canonical(game),canonical(control.game),'Retained game control: use --read-only');
  assert.notEqual(canonical(location.tooling),canonical(control.tooling),'Retained runtime control: use --read-only');
  assert.notEqual(canonical(path.join(game,'src')),canonical(path.join(control.game,'src')),'Retained source junction: use --read-only');
  assert.notEqual(canonical(installed),canonical(path.join(control.tooling,'node_modules/@hollow-wake/engine/dist')),'Retained package junction: use --read-only');
 }
}
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(file=>[file,sha256(fs.readFileSync(path.join(dir,file)))]));
const hostBefore=snapshot(path.join(game,'src')),runtimeBefore=snapshot(installed),output=fs.mkdtempSync(path.join(artifacts,'game-procs-'));
const unchanged=()=>{assert.deepEqual(snapshot(path.join(game,'src')),hostBefore);assert.deepEqual(snapshot(installed),runtimeBefore);};
const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-eight/acceptance.json'))),addendum=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-eight/dispatch-addendum.json')));
const phases=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-eight/host-phase-addendum.json')));
const fixtures=[...acceptance.fixtures,...addendum.fixtures,...phases.fixtures],helpers=new Map(),typed=[];
for(const row of [...acceptance.helpers,...addendum.helpers,...phases.helpers]){
 const source=fs.readFileSync(path.join(root,row.file),'utf8');assert.equal(sha256(source),row.sha256);
 const name=path.basename(row.file,'.ts'),runtime=path.join(output,name+'.ts'),type=path.join(output,name+'.typed.ts'),imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
 fs.writeFileSync(runtime,source.replace(imports,(_all,_q,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)));
 fs.writeFileSync(type,source.replace(imports,(_all,_q,p)=>JSON.stringify(path.relative(output,path.join(game,'src',p)).replaceAll('\\','/'))));typed.push(type);helpers.set(row.file,runtime);
}
let observationHelper,registryHelper;
if(!readOnly){
 const body=`import fs from 'node:fs';import assert from 'node:assert/strict';
import {WorldProcHitEvent} from '../src/engine/procAdapter';import type {DamagePacket} from '../src/engine/damage';import type {Modifier} from '../src/engine/stats';
const packet:DamagePacket={amounts:{physical:10},crit:false,tags:new Set(['spell']),sourceName:'observation',rollT:.2},extra:Modifier[]=[];
const first=new WorldProcHitEvent(packet,10,1,false,false,false,packet.tags,extra);
assert.equal(first.dominantType,'physical');assert.equal(first.rollT,.2);assert.equal(first.tags,packet.tags);assert.equal(first.extra,extra);
const nestedPacket:DamagePacket={...packet,amounts:{fire:20},rollT:.9};
const nested=new WorldProcHitEvent(nestedPacket,20,2,true,true,true,nestedPacket.tags,[]);
packet.amounts={lightning:30};packet.rollT=.75;packet.crit=true;
assert.equal(first.dominantType,'lightning');assert.equal(first.rollT,.75);assert.equal(first.crit,false);assert.equal(first.dealt,10);
assert.equal(nested.dominantType,'fire');assert.equal(nested.rollT,.9);assert.equal(nested.depth,2);assert.equal(first.depth,1);
fs.writeFileSync(process.argv[2],JSON.stringify({lazyPacketReads:true,separateNestedObservations:true,scalarSnapshots:true,borrowedTagAndModifierIdentities:true}));
`;
 observationHelper=path.join(output,'hit-observation.ts');const type=path.join(output,'hit-observation.typed.ts'),imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
 fs.writeFileSync(observationHelper,body.replace(imports,(_all,_q,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)));
 fs.writeFileSync(type,body.replace(imports,(_all,_q,p)=>JSON.stringify(path.relative(output,path.join(game,'src',p)).replaceAll('\\','/'))));typed.push(type);
 const registryBody=`import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {StatSheet,STAT_DEFS} from '../src/engine/stats';
import {PROC_LIST,PROCS,registerProc,procStat,procPowerStat} from '../src/data/procs';
bootSimEngine();const w=makeSimWorld('warrior',0xabc38),p=w.player;p.sheet=new StatSheet();
const views:(readonly string[])[]=[],armed=p.sheet.armedFamily;
p.sheet.armedFamily=function(prefix,ids,extra){views.push(ids);return armed.call(this,prefix,ids,extra);};
w.rollOwnProcs(p,'condition');w.rollOwnProcs(p,'condition');assert.equal(views.length,2);assert.equal(views[0],views[1]);assert.deepEqual(views[0],PROC_LIST.map(row=>row.id));
const originalView=views[0],length=PROC_LIST.length,id='__m38_native_view';assert(!PROCS[id]);let executions=0;
w['procChance']=(_owner,proc)=>proc.id===id?1:0;w['executeProc']=(proc)=>{assert.equal(proc.id,id);executions++;};
try{
 registerProc({id,name:'Native view revision',color:'#ffffff',trigger:'condition',condition:'lowLife',effect:{type:'ward',flat:1}});p.sheet.setBase(procStat(id),1);
 w.rollOwnProcs(p,'condition',{condition:'lowLife'});assert.equal(executions,1);assert.equal(views.length,3);assert.notEqual(views[2],originalView);assert.deepEqual(views[2],PROC_LIST.map(row=>row.id));assert.equal(originalView.length,length);
 const newView=views[2];w.rollOwnProcs(p,'condition',{condition:'lowLife'});assert.equal(executions,2);assert.equal(views[3],newView);
 PROC_LIST.splice(length);delete PROCS[id];delete STAT_DEFS[procStat(id)];delete STAT_DEFS[procPowerStat(id)];
 w.rollOwnProcs(p,'condition',{condition:'lowLife'});assert.equal(executions,2);assert.notEqual(views[4],newView);assert.deepEqual(views[4],PROC_LIST.map(row=>row.id));
 const own=w.rollOwnProcs.bind(w),ownEvents:string[]=[];
 w.rollOwnProcs=(owner,trigger,event)=>{assert.equal(owner,p);assert.equal(owner.condRose.length,0);ownEvents.push(trigger+(event?.condition?':'+event.condition:''));own(owner,trigger,event);};
 p.condRose=['lowLife'];p.healedSince=1;p.gasped=true;w['sweepTalentEvents'](p);
 assert.deepEqual(ownEvents,['condition:lowLife','heal','lastGasp']);assert.equal(p.healedSince,0);assert.equal(p.gasped,false);
 fs.writeFileSync(process.argv[2],JSON.stringify({stableRegistryIdentity:true,appendObserved:true,removeObserved:true,oldViewPreserved:true,executions,ownEvents}));
}finally{PROC_LIST.splice(length);delete PROCS[id];delete STAT_DEFS[procStat(id)];delete STAT_DEFS[procPowerStat(id)];}
`;
 registryHelper=path.join(output,'registry-view.ts');const registryType=path.join(output,'registry-view.typed.ts');
 fs.writeFileSync(registryHelper,registryBody.replace(imports,(_all,_q,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)));
 fs.writeFileSync(registryType,registryBody.replace(imports,(_all,_q,p)=>JSON.stringify(path.relative(output,path.join(game,'src',p)).replaceAll('\\','/'))));typed.push(registryType);
}
const config=path.join(output,'tsconfig.json');writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[path.join(game,'src'),...typed],exclude:[]});
const run=(name,args)=>{const log=path.join(output,name+'.txt'),fd=fs.openSync(log,'wx');try{execFileSync(process.execPath,args,{cwd:game,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}return log;};
const args=(helper,destination)=>['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,helper,destination];
run('types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config]);unchanged();
if(observationHelper){run('hit-observation',args(observationHelper,path.join(output,'hit-observation.json')));unchanged();}
if(registryHelper){run('registry-view',args(registryHelper,path.join(output,'registry-view.json')));unchanged();}
const results=[],expected=new Map();
for(const row of fixtures){
 const compressed=fs.readFileSync(path.join(root,row.file));assert.equal(sha256(compressed),row.compressedSha256);const bytes=gunzipSync(compressed);assert.equal(sha256(bytes),row.fixtureSha256);expected.set(row.name,bytes);
 const destination=path.join(output,row.name+'.json');run(row.name,args(helpers.get(row.helper),destination));
 const actual=fs.readFileSync(destination);assert(actual.equals(bytes),'Installed proc observation differs: '+row.name);unchanged();
 results.push({name:row.name,courses:row.courses,procRows:row.procRows,riderRows:row.riderRows,byteEqual:true,sha256:sha256(actual)});console.log('PASS installed '+row.name);
}
const faults=[];
for(const [name,relative,before,after,fixture]of readOnly?[]:[
 ['chance-cap','runtime','return Math.min(.95, value);','return Math.min(.9, value);','proc-rules'],
 ['cooldown-equality','runtime','p.time() < (actor.procReadyAt.get(proc.id) ?? 0)','p.time() <= (actor.procReadyAt.get(proc.id) ?? 0)','proc-rules'],
 ['once-ignored','runtime','if (proc.oncePerCast)','if (false)','proc-rules'],
 ['own-selection-skipped','runtime','for (const proc of s.candidates(trigger)) {','for (const proc of []) {','proc-native'],
 ['pulse-live-grants','runtime','for (const id of p.armed(actor, s.allIds())) {','for (const id of s.allIds()) {','proc-registry'],
 ['status-bank-depth-gated','runtime','this.#ports.bankStatus(actor, inst, target, status);','if (depth < this.depthAllowed(actor)) this.#ports.bankStatus(actor, inst, target, status);','proc-dispatch'],
 ['collision-dead-caster','runtime','if (target.dead)','if (actor.dead || target.dead)','proc-dispatch'],
 ['surface-dead-caster','runtime','surface(actor) {','surface(actor) { if (actor.dead) return;','proc-dispatch'],
 ['court-normalization-omitted','runtime','chance /= court;','chance /= 1;','proc-hits'],
 ['true-kill-normalized','runtime',"&& !(proc.trigger === 'kill' && event.lethal)",'','proc-hits'],
 ['rider-depth','runtime','depth + 1, rider.cast','depth, rider.cast','proc-dispatch'],
 ['carry-context-omitted','binding','carryTags:inst=>skillContextTags(inst.def)','carryTags:()=>new Set()','proc-hits'],
 ['hit-observation-stale-type','binding','get dominantType(){return dominantTypeOf(this.packet.amounts);}',"get dominantType(){return 'physical';}",'hit-observation'],
 ['hit-observation-stale-roll','binding','get rollT(){return this.packet.rollT;}','get rollT(){return .2;}','hit-observation'],
 ['native-registry-view-stale','binding','nativeView.source!==ids','false','registry-view'],
 ['native-own-observer-bypassed','binding','return this.#nativeOwn(owner,trigger,event);','return super.own(owner,trigger,event);','registry-view'],
 ['later-death-skips-gauges','runtime','this.pulses(actor);\n        return true;','this.pulses(actor);\n        return !actor.dead;','proc-host-phases'],
 ['later-death-skips-kill-rewards','runtime','this.#hitRows(owner, inst, target, event, tags, extra, eliteFactor, court);\n        return true;','this.#hitRows(owner, inst, target, event, tags, extra, eliteFactor, court);\n        return !owner.dead;','proc-host-phases'],
]){
 const file=relative==='runtime'?path.join(installed,'proc-runtime.js'):path.join(game,'src/engine/procAdapter.ts'),source=fs.readFileSync(file,'utf8');assert(source.includes(before),'Fault anchor changed: '+name);
 const row=fixtures.find(r=>r.name===fixture),helper=fixture==='hit-observation'?observationHelper:fixture==='registry-view'?registryHelper:helpers.get(row.helper),destination=path.join(output,'fault-'+name+'.json');let detected=false;
 try{
  fs.writeFileSync(file,source.replace(before,after));
  try{run('fault-'+name,args(helper,destination));}
  catch(error){const log=fs.readFileSync(path.join(output,'fault-'+name+'.txt'),'utf8');assert(/AssertionError/.test(log)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(log),'Fault failed for an unrelated reason: '+name);detected=true;}
  if(!detected)detected=!fs.readFileSync(destination).equals(row?expected.get(fixture):fs.readFileSync(path.join(output,fixture+'.json')));assert(detected,'Installed proc fault escaped: '+name);
 }finally{fs.writeFileSync(file,source);unchanged();}
 faults.push({name,detected});console.log('Rejected installed proc fault: '+name);
}
assert.equal(results.reduce((n,r)=>n+(r.courses??0),0),150);
writeJSON(path.join(artifacts,'game-proc-verification.json'),{output,game,tooling:location.tooling,packageIntegrity:location.integrity,typesPassed:true,results,originalCoursesCompared:150,installedFaults:faults,hitObservationContractVerified:!!observationHelper,nativeRegistryViewVerified:!!registryHelper,nativeOwnHookVerified:!!registryHelper,readOnly,allInstalledFilesRestored:true});
