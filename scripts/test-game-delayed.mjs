import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {readDelayedRepairExpectations} from './check-delayed-contract.mjs';
const artifacts=path.join(root,'.artifacts'),arg=process.argv.indexOf('--location'),location=JSON.parse(fs.readFileSync(arg<0?path.join(artifacts,'adapter-location.json'):path.resolve(process.argv[arg+1])));
const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-forty/adapter-contract.json')));assert.equal(location.delayedAdapterDecision,contract.decision,'Requires the guarded delayed adapter');
const game=location.game,installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist'),reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const inject=process.argv.includes('--faults'),canonical=p=>fs.realpathSync(p).toLowerCase();
assert(!(inject&&process.argv.includes('--read-only')),'Choose either --faults or --read-only');
if(inject){
 const within=p=>{const relative=path.relative(canonical(artifacts),canonical(p));assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Faults require disposable artifact directories');};within(game);within(location.tooling);within(path.join(game,'src'));within(installed);
 for(const name of ['m36-condition-control/retained.json','m37-initial-candidate/retained.json','m37-proc-control/retained.json','m38-prepared-adapter-location.json','m38-proc-initial/retained.json','m38-observation-control/retained.json','m38-native-array-initial-control/retained.json','m38-effect-control/retained.json','m39-ward-initial-control/retained.json','m39-delayed-control/retained.json','m40-delayed-initial-control/retained.json','m40-buff-control/retained.json','m40-measured-control/retained.json','m41-buff-initial-control/retained.json','m41-buff-control/retained.json','m41-measured-control/retained.json', 'm41-timer-control/retained.json', 'm42-initial-recovery-control/retained.json', 'm42-corrected-recovery-control/retained.json', 'm42-notification-rejected-control/retained.json', 'm42-recovery-renderer-control/retained.json', 'm42-recovery-control/retained.json', 'm43-initial-restoration-control/retained.json']){
  const file=path.join(artifacts,name);if(!fs.existsSync(file))continue;const retained=JSON.parse(fs.readFileSync(file)),control=retained.location??retained;
  assert.notEqual(canonical(game),canonical(control.game),'Refusing to mutate a retained game');assert.notEqual(canonical(location.tooling),canonical(control.tooling),'Refusing to mutate retained tooling');assert.notEqual(canonical(path.join(game,'src')),canonical(path.join(control.game,'src')),'Retained source junction');assert.notEqual(canonical(installed),canonical(path.join(control.tooling,'node_modules/@hollow-wake/engine/dist')),'Retained package junction');
 }
}
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(f=>[f,sha256(fs.readFileSync(path.join(dir,f)))]));
const hostBefore=snapshot(path.join(game,'src')),runtimeBefore=snapshot(installed),output=fs.mkdtempSync(path.join(artifacts,'game-delayed-'));
const unchanged=()=>{assert.deepEqual(snapshot(path.join(game,'src')),hostBefore);assert.deepEqual(snapshot(installed),runtimeBefore);verifyReference(reference,lock);};
const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-forty/acceptance.json'))),{expected,proof}=readDelayedRepairExpectations(),helpers=new Map(),typed=[],adaptations=[];
function adapt(source,file){
 const edits=[];
 for(const rule of contract.helperAssertions.filter(r=>r.helper===file)){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0);
  let start=0,end=source.length;
  if(rule.course){const matches=ast.statements.filter(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='course'&&ts.isStringLiteral(n.expression.arguments[0])&&n.expression.arguments[0].text===rule.course);assert.equal(matches.length,1,'Ambiguous named diagnostic: '+rule.course);start=matches[0].getStart(ast);end=matches[0].end;}
  const area=source.slice(start,end);assert.equal(area.split(rule.before).length,2,'Changed diagnostic assertion: '+file+' '+rule.course);
  // Both sides consist only of complete assert calls. No setup, control-flow,
  // catch block or observation is removed to accommodate the repaired result.
  for(const text of [rule.before,rule.after]){const parsed=ts.createSourceFile('assertions.ts',text,ts.ScriptTarget.Latest,true);assert.equal(parsed.parseDiagnostics.length,0);assert(parsed.statements.length>0);assert(parsed.statements.every(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&ts.isPropertyAccessExpression(n.expression.expression)&&n.expression.expression.expression.getText(parsed)==='assert'),'Only explicit assertion changes are allowed');}
  const at=start+area.indexOf(rule.before);edits.push({start:at,end:at+rule.before.length,text:rule.after});adaptations.push({helper:file,course:rule.course,before:rule.before,after:rule.after});
 }
 edits.sort((a,b)=>b.start-a.start);for(let i=1;i<edits.length;i++)assert(edits[i].end<=edits[i-1].start);
 let result=source;for(const e of edits)result=result.slice(0,e.start)+e.text+result.slice(e.end);return result;
}
for(const row of acceptance.helpers){
 const original=fs.readFileSync(path.join(root,row.file),'utf8');assert.equal(sha256(original),row.sha256,'Changed original helper');const source=adapt(original,row.file),name=path.basename(row.file,'.ts'),runtimeFile=path.join(output,name+'.ts'),typeFile=path.join(output,name+'.typed.ts'),imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
 fs.writeFileSync(runtimeFile,source.replace(imports,(_all,_q,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)),{flag:'wx'});
 fs.writeFileSync(typeFile,source.replace(imports,(_all,_q,p)=>JSON.stringify(path.relative(output,path.join(game,'src',p)).replaceAll('\\','/'))),{flag:'wx'});helpers.set(row.file,{runtimeFile,originalSha256:row.sha256,adaptedSha256:sha256(source)});typed.push(typeFile);
}
const hostSource=fs.readFileSync(path.join(root,'reference/check-delayed-host.ts'),'utf8'),hostRuntime=path.join(output,'host.ts'),hostTyped=path.join(output,'host.typed.ts'),hostImports=/(['"])\.\.\/src\/([^'"]+)\1/g;
fs.writeFileSync(hostRuntime,hostSource.replace(hostImports,(_all,_q,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)));
fs.writeFileSync(hostTyped,hostSource.replace(hostImports,(_all,_q,p)=>JSON.stringify(path.relative(output,path.join(game,'src',p)).replaceAll('\\','/'))));typed.push(hostTyped);
const config=path.join(output,'tsconfig.json');writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[path.join(game,'src'),...typed],exclude:[]});
function run(name,args,check=true){const fd=fs.openSync(path.join(output,name+'.txt'),'wx');try{execFileSync(process.execPath,args,{cwd:game,stdio:['ignore',fd,fd]});}catch(error){if(check)console.error('Failed delayed comparison; retained log: '+path.join(output,name+'.txt'));throw error;}finally{fs.closeSync(fd);if(check)unchanged();}}
const args=(helper,destination)=>['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,helper,destination];
run('types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config]);
const hostResult=path.join(output,'host.json');run('host',args(hostRuntime,hostResult));assert.equal(JSON.parse(fs.readFileSync(hostResult)).courses,4);
const results=[];for(const row of acceptance.fixtures){
 const destination=path.join(output,row.name+'.json'),helper=helpers.get(row.helper);assert(helper);run(row.name,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,helper.runtimeFile,destination]);
 const bytes=fs.readFileSync(destination),intended=Buffer.from(JSON.stringify(expected.get(row.name),null,2)+'\n');assert(bytes.equals(intended),'Installed delayed observation differs: '+row.name);assert.equal(JSON.parse(bytes).courses,row.courses);
 results.push({name:row.name,courses:row.courses,sha256:sha256(bytes),byteEqualToExplicitExpectations:true,helper});console.log('PASS installed '+row.name);
}
assert.equal(results.reduce((n,r)=>n+r.courses,0),48);assert.equal(adaptations.length,contract.helperAssertions.length);
const targets={runtime:path.join(installed,'delayed-bursts.js'),binding:path.join(game,'src/engine/delayedBurstAdapter.ts'),world:path.join(game,'src/engine/world.ts')},faults=[];
if(inject)for(const [name,target,before,after,fixture]of [
 ['nested-advance-admitted','runtime','if (this.active)','if (false)','delayed-ordering'],
 ['queue-replacement-ignored','runtime','generation !== this.generation || queue !== this.ports.queue(host)','generation !== this.generation','delayed-ordering'],
 ['live-level-per-target','runtime','burst.fx.healAllies.perLevel * level','burst.fx.healAllies.perLevel * Math.max(0, burst.owner.level - 1)','delayed-ordering'],
 ['tangent-excluded','runtime','- actor.radius > burst.fx.radius','- actor.radius >= burst.fx.radius','delayed-ordering'],
 ['reset-generation-omitted','runtime','this.generation = {};','this.generation = this.generation;','host'],
 ['flash-cancellation-omitted','runtime','ports.flash(host, burst);\n                if (this.cancelled(host, queue, generation))\n                    return;','ports.flash(host, burst);','host'],
 ['heal-cancellation-omitted','runtime','const healed = ports.heal(host, actor, burst.fx.healAllies.base + burst.fx.healAllies.perLevel * level);\n                            if (this.cancelled(host, queue, generation))\n                                return;','const healed = ports.heal(host, actor, burst.fx.healAllies.base + burst.fx.healAllies.perLevel * level);','host'],
 ['native-reset-bypasses-sdk','world','this.delayedBurstEngine.reset(this)','this.pendingBursts = []','host'],
 ['schedule-omitted','world','this.delayedBurstEngine.schedule(this, caster, fx, proc.color, depth, target);','void this;','delayed-ordering'],
 ['drain-omitted','world','this.delayedBurstEngine.advance(this);','void this;','delayed-ordering'],
 ['warning-shape-changed','binding','edgeFrac:0.94','edgeFrac:0.8','host'],
 ['impact-lifetime-changed','binding','life:0.3,maxLife:0.3','life:0.4,maxLife:0.4','host'],
 ['native-heal-bypassed','binding','a.healBy(n)','(a.life+=n,n)','delayed-ordering'],
 ['mitigation-bypassed','binding','mitigateTyped(a,{[type]:n})','n','delayed-defense'],
 ['shield-event-omitted','binding',"w.rollOwnProcs(a,'esBreak',{depth});",'void depth;','delayed-defense'],
 ['defense-sweep-omitted','binding','w.sweepDefenseEvents(a,depth);','void depth;','delayed-defense'],
 ['native-death-omitted','binding','w.kill(a);','void a;','delayed-descent'],
]){
 const file=targets[target],source=fs.readFileSync(file,'utf8');assert.equal(source.split(before).length,2,'Ambiguous fault anchor: '+name);const row=acceptance.fixtures.find(r=>r.name===fixture),helper=row?helpers.get(row.helper).runtimeFile:hostRuntime,destination=path.join(output,'fault-'+name+'.json');let detected=false;
 try{fs.writeFileSync(file,source.replace(before,after));try{run('fault-'+name,args(helper,destination),false);}catch{const log=fs.readFileSync(path.join(output,'fault-'+name+'.txt'),'utf8');assert(/AssertionError/.test(log)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(log),'Fault failed for unrelated reason: '+name);detected=true;}
  if(!detected){const intended=row?Buffer.from(JSON.stringify(expected.get(fixture),null,2)+'\n'):fs.readFileSync(hostResult);detected=!fs.readFileSync(destination).equals(intended);}assert(detected,'Installed delayed fault escaped: '+name);
 }finally{fs.writeFileSync(file,source);unchanged();}
 faults.push({name,detected:true});console.log('Rejected installed delayed fault: '+name);
}
writeJSON(path.join(artifacts,'game-delayed-verification.json'),{output,game,tooling:location.tooling,packageIntegrity:location.integrity,readOnly:!inject,typesPassed:true,courses:48,repair:proof,results,adaptations,hostCases:4,hostProbeSha256:sha256(hostSource),hostOutputSha256:sha256(fs.readFileSync(hostResult)),installedFaults:faults,allSourceAndRuntimeFilesUnchanged:true,scope:'Installed original comparisons with only the six predeclared repairs, plus independent host checks. Renderer and performance acceptance remain required.'});
