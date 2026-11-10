import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import ts from 'typescript';
import {root,sha256,materialize,verifyReference} from '../../scripts/reference-utils.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),read=file=>fs.readFileSync(path.join(root,file));
for(const name of ['aura-ledgers-package','aura-ledgers-game']){
 const r=JSON.parse(read('.artifacts/'+name+'.json'));assert(r.passed&&r.cleaned&&r.inputsUnchanged&&r.types);
 for(const[file,hash]of Object.entries(r.sources))assert.equal(sha256(read(file)),hash,file);
}
const localBefore='.artifacts/aura-ledgers-before-work.json';
const before=JSON.parse(read(fs.existsSync(path.join(root,localBefore))?localBefore:'evidence/aura-ledgers/summary.json'));
for(const[file,hash]of Object.entries(before.sources))assert.equal(sha256(read(file)),hash,file);
const work=fs.mkdtempSync(path.join(owned,'aura-ledgers-composed-owned-')),game=path.join(work,'game'),location=path.join(work,'location.json');
const lock=JSON.parse(read('baseline/source-lock.json')),report={passed:false,sources:before.sources},logs={};
const run=(label,args,cwd=game)=>{
 const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:20*60*1000,maxBuffer:8*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_IGNORE_SCRIPTS:'true'}});
 logs[label]={stdout:c.stdout??'',stderr:c.stderr??''};assert(!c.error&&!c.signal&&c.status===0,label+': '+JSON.stringify(logs[label]).slice(-6000));return logs[label];
};
try{
 verifyReference(path.join(root,'.reference'),lock);materialize(null,lock,game);verifyReference(game,lock);
 run('prepare',[path.join(root,'scripts/prepare-game-adapter.mjs'),'--game',game,'--location-out',location,'--scratch-root',work,'--reuse-tools',path.join(root,'.reference/node_modules')],root);
 const installed=JSON.parse(fs.readFileSync(location));report.archiveSha256=sha256(fs.readFileSync(installed.archive));report.changedFiles=installed.files;
 assert(installed.auraLedgersDecision&&installed.auraRetirementDecision&&installed.companionRecoveryDecision&&installed.bodyLevelsDecision&&installed.companionBondsDecision);
 const worldFile=path.join(game,'src/engine/world.ts'),installedWorld=fs.readFileSync(worldFile,'utf8'),originalWorld=read('.reference/src/engine/world.ts').toString();
 // The paired control retains every other SDK adapter, including aura retirement.
 // Restore only ledger World methods, Actor capacity and the mana-banking phase.
 const parse=text=>{const ast=ts.createSourceFile(worldFile,text,ts.ScriptTarget.Latest,true),worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1);return{ast,world:worlds[0]};};
 const current=parse(installedWorld),original=parse(originalWorld),edits=[];
 for(const name of ['updateActorLedgers','settleLedger']){
  const select=view=>{const found=view.world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(view.ast)===name);assert.equal(found.length,1);assert(found[0].body);return found[0].body;};
  const body=select(current);edits.push([body.getStart(current.ast),body.end,select(original).getText(original.ast)]);
 }
 const imported=current.ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='@hollow-wake/engine/auras/ledgers');assert.equal(imported.length,1);edits.push([imported[0].getStart(current.ast),imported[0].end,'']);
 const bound=current.world.members.filter(n=>ts.isPropertyDeclaration(n)&&n.name.getText(current.ast)==='engineAuraLedgers');assert.equal(bound.length,1);edits.push([bound[0].getStart(current.ast),bound[0].end,'']);
 let control=installedWorld;for(const[start,end,text]of edits.sort((a,b)=>b[0]-a[0]))control=control.slice(0,start)+text+control.slice(end);
 assert(!control.includes('@hollow-wake/engine/auras/ledgers'));assert(control.includes('@hollow-wake/engine/bodies/levels'));
 report.controlWorldSha256=sha256(control);report.installedWorldSha256=sha256(installedWorld);
 const actorFile=path.join(game,'src/engine/actor.ts'),installedActor=fs.readFileSync(actorFile,'utf8'),originalActor=read('.reference/src/engine/actor.ts').toString();
 const actorTree=source=>{const ast=ts.createSourceFile(actorFile,source,ts.ScriptTarget.Latest,true),owners=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='Actor');assert.equal(owners.length,1);return{ast,owner:owners[0]};};
 const liveActor=actorTree(installedActor),pinnedActor=actorTree(originalActor),actorEdits=[];
 const actorMethod=(view,name)=>{const rows=view.owner.members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(view.ast)===name);assert.equal(rows.length,1);assert(rows[0].body);return rows[0];};
 const capacity=actorMethod(liveActor,'ledgerCap').body;actorEdits.push([capacity.getStart(liveActor.ast),capacity.end,actorMethod(pinnedActor,'ledgerCap').body.getText(pinnedActor.ast)]);
 function phase(view,installed){const found=[];const visit=n=>{if(installed?ts.isExpressionStatement(n)&&n.getText(view.ast)==='manaRegen = engineBankAuraManaRegeneration(this,manaRegen,dt);':ts.isIfStatement(n)&&n.expression.getText(view.ast)==='manaRegen > 0')found.push(n);ts.forEachChild(n,visit);};visit(actorMethod(view,'updateTimers'));assert.equal(found.length,1);return found[0];}
 const currentPhase=phase(liveActor,true);actorEdits.push([currentPhase.getStart(liveActor.ast),currentPhase.end,phase(pinnedActor,false).getText(pinnedActor.ast)]);
 const actorImports=liveActor.ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='@hollow-wake/engine/auras/ledgers');assert.equal(actorImports.length,1);actorEdits.push([actorImports[0].getStart(liveActor.ast),actorImports[0].end,'']);
 let actorControl=installedActor;for(const[start,end,text]of actorEdits.sort((a,b)=>b[0]-a[0]))actorControl=actorControl.slice(0,start)+text+actorControl.slice(end);
 assert(!actorControl.includes('@hollow-wake/engine/auras/ledgers'));assert(control.includes('@hollow-wake/engine/auras/retirement'));
 report.controlActorSha256=sha256(actorControl);report.installedActorSha256=sha256(installedActor);
 const tsc=path.join(game,'node_modules/typescript/bin/tsc'),cli=path.join(game,'balance/cli.ts'),controlOut=path.join(work,'smoke-control'),installedOut=path.join(work,'smoke-installed');
 fs.writeFileSync(worldFile,control);fs.writeFileSync(actorFile,actorControl);
 try{run('control-types',[tsc,'--noEmit','-p','tsconfig.sim.json']);run('control-smoke',['--import','tsx',cli,'run','--suite','smoke','--out',controlOut]);}
 finally{fs.writeFileSync(worldFile,installedWorld);fs.writeFileSync(actorFile,installedActor);}
 assert.equal(sha256(fs.readFileSync(worldFile)),report.installedWorldSha256);assert.equal(sha256(fs.readFileSync(actorFile)),report.installedActorSha256);report.controlRestored=true;
 const courses=[['aura-ledgers',40],['aura-retirement',26],['retirement-contact',5],['companion-recovery',25],['body-levels',23],['companion-continuation',8]].map(([name,checkpoints])=>{const file=path.join(game,'balance/hwe-'+name+'.ts');fs.writeFileSync(file,read('reference/export-'+name+'.ts'));return{name,file,checkpoints};});
 const probe=path.join(game,'balance/hwe-companion-private.ts');fs.writeFileSync(probe,read('test/companion-continuation-game.ts'));
 for(const config of ['tsconfig.json','tsconfig.launcher.json','tsconfig.sim.json'])run('types-'+config,[tsc,'--noEmit','-p',config]);report.types=true;report.typeConfigs=['game','launcher','simulation'];
 for(const{name,file,checkpoints}of courses){const expected=gunzipSync(read('baseline/'+name+'/observations.json.gz')),output=path.join(work,name+'.json');run(name,['--import','tsx',file,output]);assert(fs.readFileSync(output).equals(expected));(report.originalCourses??=[]).push({name,checkpoints});}
 const known=JSON.parse(gunzipSync(read('baseline/companion-continuation/original.logs.json.gz')))['original-1'];
 assert.deepEqual(run('private-companion',['--import','tsx',probe]),{stdout:'Companion private game continuation: 4 courses, 15 stages passed\n',stderr:known.stderr});report.privateCourses=4;report.privateStages=15;
 run('installed-smoke',['--import','tsx',cli,'run','--suite','smoke','--out',installedOut]);
 const summary=dir=>{const{startedAt,...result}=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));assert.equal(typeof startedAt,'string');return result;};
 const controlSmoke=summary(controlOut),installedSmoke=summary(installedOut);assert.deepEqual(installedSmoke,controlSmoke);assert.equal(installedSmoke.scenarios.length,5);assert.equal(installedSmoke.seeds,5);
 const controlEpisodes=fs.readFileSync(path.join(controlOut,'episodes.json')),installedEpisodes=fs.readFileSync(path.join(installedOut,'episodes.json'));assert(controlEpisodes.equals(installedEpisodes));
 const episodes=JSON.parse(installedEpisodes);assert.equal(episodes.length,25);assert(episodes.every(e=>e.ended!=='error'));
 logs['smoke-observations']={control:controlSmoke,installed:installedSmoke,episodes};report.smoke={scenarios:5,seeds:5,episodes:25,exactEpisodes:true,normalizedReportsEqual:true,episodesSha256:sha256(installedEpisodes),scope:'Composed game with aura ledgers delegated versus the same composed game with only ledger upkeep, settlement, capacity and regeneration banking restored to original'};
 report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{verifyReference(path.join(root,'.reference'),lock);report.inputsUnchanged=Object.entries(before.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'aura-ledgers-composed.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,'aura-ledgers-composed.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed,report.failure??'Inputs changed');
console.log({passed:report.passed,types:report.types,originalCourses:report.originalCourses,privateCourses:report.privateCourses,privateStages:report.privateStages,smoke:report.smoke,cleaned:true,failure:report.failure});
