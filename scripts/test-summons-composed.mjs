import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import ts from 'typescript';
import {root,sha256,materialize,verifyReference} from './reference-utils.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),read=file=>fs.readFileSync(path.join(root,file));
for(const name of ['summons-package','summons-game']){
 const r=JSON.parse(read('.artifacts/'+name+'.json'));assert(r.passed&&r.cleaned&&r.inputsUnchanged&&r.types);
 for(const[file,hash]of Object.entries(r.sources))assert.equal(sha256(read(file)),hash,file);
}
const proofReports=['summons-package','summons-game'].map(name=>JSON.parse(read('.artifacts/'+name+'.json')));
const before={sources:Object.assign({},...proofReports.map(r=>r.sources),{'scripts/test-summons-composed.mjs':sha256(read('scripts/test-summons-composed.mjs'))})};
const work=fs.mkdtempSync(path.join(owned,'summons-composed-owned-')),game=path.join(work,'game'),location=path.join(work,'location.json');
const lock=JSON.parse(read('baseline/source-lock.json')),report={passed:false,sources:before.sources},logs={};
const run=(label,args,cwd=game)=>{
 const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:20*60*1000,maxBuffer:8*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_IGNORE_SCRIPTS:'true'}});
 logs[label]={stdout:c.stdout??'',stderr:c.stderr??''};assert(!c.error&&!c.signal&&c.status===0,label+': '+JSON.stringify(logs[label]).slice(-6000));return logs[label];
};
try{
 verifyReference(path.join(root,'.reference'),lock);materialize(null,lock,game);verifyReference(game,lock);
 run('prepare',[path.join(root,'scripts/prepare-game-adapter.mjs'),'--game',game,'--location-out',location,'--scratch-root',work,'--reuse-tools',path.join(root,'.reference/node_modules')],root);
 const installed=JSON.parse(fs.readFileSync(location));report.archiveSha256=sha256(fs.readFileSync(installed.archive));report.changedFiles=installed.files;
 assert(installed.summonsDecision&&installed.auraTickingDecision&&installed.auraActivationDecision&&installed.auraLedgersDecision&&installed.auraRetirementDecision&&installed.companionRecoveryDecision&&installed.bodyLevelsDecision&&installed.companionBondsDecision);
 const worldFile=path.join(game,'src/engine/world.ts'),installedWorld=fs.readFileSync(worldFile,'utf8'),originalWorld=read('.reference/src/engine/world.ts').toString();
 // Restore only the two summon commands and their original private helpers.
 // Every other SDK capability remains installed in both sides of the comparison.
 const parse=text=>{const ast=ts.createSourceFile(worldFile,text,ts.ScriptTarget.Latest,true),worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1);return{ast,world:worlds[0]};};
 const current=parse(installedWorld),original=parse(originalWorld),edits=[];
 for(const name of ['spawnMinion','spawnSummonOffspring']){
  const select=view=>{const found=view.world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(view.ast)===name);assert.equal(found.length,1);assert(found[0].body);return found[0].body;};
  const body=select(current);edits.push([body.getStart(current.ast),body.end,select(original).getText(original.ast)]);
 }
 for(const name of ['birth','offspring']){const imports=current.ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='@hollow-wake/engine/summons/'+name);assert.equal(imports.length,1);edits.push([imports[0].getStart(current.ast),imports[0].end,'']);}
 for(const name of ['engineSummonBirth','engineSummonOffspring']){const fields=current.world.members.filter(n=>ts.isPropertyDeclaration(n)&&n.name.getText(current.ast)===name);assert.equal(fields.length,1);edits.push([fields[0].getStart(current.ast),fields[0].end,'']);}
 const rolls=original.world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(original.ast)==='rollSummonType');assert.equal(rolls.length,1);assert(!current.world.members.some(n=>ts.isMethodDeclaration(n)&&n.name?.getText(current.ast)==='rollSummonType'));
 edits.push([current.world.members.pos,current.world.members.pos,'\n'+rolls[0].getText(original.ast)+'\n']);
 const helperImports=original.ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)&&n.importClause.namedBindings.elements.some(e=>e.name.text==='summonKitIds'));assert.equal(helperImports.length,1);assert.equal(helperImports[0].importClause.namedBindings.elements.length,1);
 edits.push([0,0,helperImports[0].getText(original.ast)+'\n']);
 let control=installedWorld;for(const[start,end,text]of edits.sort((a,b)=>b[0]-a[0]))control=control.slice(0,start)+text+control.slice(end);
 assert(!control.includes('@hollow-wake/engine/summons/'));assert(control.includes('@hollow-wake/engine/auras/ticking'));report.controlEdits=edits.length;assert.equal(edits.length,8);
 report.controlWorldSha256=sha256(control);report.installedWorldSha256=sha256(installedWorld);
 const tsc=path.join(game,'node_modules/typescript/bin/tsc'),cli=path.join(game,'balance/cli.ts'),controlOut=path.join(work,'smoke-control'),installedOut=path.join(work,'smoke-installed');
 fs.writeFileSync(worldFile,control);
 try{run('control-types',[tsc,'--noEmit','-p','tsconfig.sim.json']);run('control-smoke',['--import','tsx',cli,'run','--suite','smoke','--out',controlOut]);}
 finally{fs.writeFileSync(worldFile,installedWorld);}
 assert.equal(sha256(fs.readFileSync(worldFile)),report.installedWorldSha256);report.controlRestored=true;
 const courses=[['aura-ticking',34],['aura-ticking-contact',9],['aura-ticking-order',20],['aura-activation',38],['aura-ledgers',40],['aura-retirement',26],['retirement-contact',5],['companion-recovery',25],['body-levels',23],['companion-continuation',8],['summon-birth-admission',34],['summon-birth-contact',27],['summon-offspring',19],['summon-birth-order',14],['summon-birth-forms',9],['summon-birth-boundary',4],['summon-nested',10]].map(([name,checkpoints])=>{const file=path.join(game,'balance/hwe-'+name+'.ts');fs.writeFileSync(file,read('reference/export-'+name+'.ts'));return{name,file,checkpoints};});
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
 logs['smoke-observations']={control:controlSmoke,installed:installedSmoke,episodes};report.smoke={scenarios:5,seeds:5,episodes:25,exactEpisodes:true,normalizedReportsEqual:true,episodesSha256:sha256(installedEpisodes),scope:'Fully assembled game with summons delegated versus the same assembly retaining original summon birth and offspring only'};
 assert.equal(report.originalCourses.reduce((sum,c)=>sum+c.checkpoints,0),345);report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{verifyReference(path.join(root,'.reference'),lock);report.inputsUnchanged=Object.entries(before.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'summons-composed.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,'summons-composed.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed,report.failure??'Inputs changed');
console.log({passed:report.passed,types:report.types,originalCourses:report.originalCourses,privateCourses:report.privateCourses,privateStages:report.privateStages,smoke:report.smoke,cleaned:true,failure:report.failure});
