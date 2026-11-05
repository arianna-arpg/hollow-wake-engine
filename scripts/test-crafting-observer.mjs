import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
import {root,sha256,writeJSON,verifyReference} from './reference-utils.mjs';
import {prepareCraftingObservers} from './crafting-reference.mjs';
import {craftingSourceFaults} from './crafting-source-faults.mjs';
const ref=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const args=process.argv.slice(2);assert(args.length===0||args.length===2&&args[0]==='--control');
const controlFile=args[1]??path.join(root,'baseline/crafting/acceptance.json'),record=JSON.parse(fs.readFileSync(controlFile));
const control=args.length?record:{passed:true,fixtures:record.fixtures,runs:Object.fromEntries(Object.entries(record.fixtures).map(([name,row])=>[name,{sha256:row.sha256}]))};
assert(control.passed);
verifyReference(ref,lock);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/crafting-source-faults-')),game=path.join(directory,'game');fs.mkdirSync(game);
const receipt=path.join(directory,'verification.json'),report={passed:false,directory,controlSha256:sha256(fs.readFileSync(controlFile)),runs:[],
  sourceLockSha256:sha256(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),
  scripts:Object.fromEntries(['scripts/test-crafting-observer.mjs','scripts/crafting-source-faults.mjs','scripts/crafting-reference.mjs'].map(f=>[f,sha256(fs.readFileSync(path.join(root,f)))]))};
writeJSON(receipt,report);writeJSON(path.join(root,'.artifacts/crafting-source-faults-latest.json'),{directory,receipt});
try{
  fs.cpSync(path.join(ref,'src'),path.join(game,'src'),{recursive:true,errorOnExist:true,force:false});
  fs.copyFileSync(path.join(ref,'package.json'),path.join(game,'package.json'));
  fs.symlinkSync(path.join(ref,'node_modules'),path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
  const {entries,fixtures}=prepareCraftingObservers(directory,game);
  for(const [name,fixture]of Object.entries(fixtures))assert.equal(fixture.helperSha256,control.fixtures[name].helperSha256,name);
  function run(name,fixture){
    const output=path.join(directory,name+'.json'),log=path.join(directory,name+'.txt'),fd=fs.openSync(log,'wx');let result;
    try{result=spawnSync(process.execPath,['--import','tsx',entries[fixture],output],{cwd:ref,windowsHide:true,stdio:['ignore',fd,fd],timeout:180000});}finally{fs.closeSync(fd);}
    assert(!result.error&&!result.signal,name+' process failure');
    return {output,log,result,text:fs.readFileSync(log,'utf8'),sha256:fs.existsSync(output)?sha256(fs.readFileSync(output)):null};
  }
  for(const fixture of ['policy','actions']){const clean=run('control-'+fixture,fixture);assert.equal(clean.result.status,0,clean.text.slice(-1600));assert.equal(clean.sha256,control.runs[fixture].sha256,fixture+' copied-source control differs');}
  for(const fault of craftingSourceFaults){
    const file=path.join(game,'src',fault.file),original=fs.readFileSync(file,'utf8');
    assert.equal(sha256(original),lock.files['src/'+fault.file],fault.file+' pristine source');
    const ast=ts.createSourceFile(file,original,ts.ScriptTarget.Latest,true),world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
    const member=world?world.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===fault.method):ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===fault.method);
    assert(member,fault.name);const before=member.getText(ast);assert.equal(before.split(fault.from).length,2,fault.name+' exact mutation span');
    const changed=original.slice(0,member.getStart(ast))+before.replace(fault.from,fault.to)+original.slice(member.end);
    let observed;try{fs.writeFileSync(file,changed);observed=run(fault.name,fault.fixture);}finally{fs.writeFileSync(file,original);}
    if(observed.result.status===0)assert.notEqual(observed.sha256,control.runs[fault.fixture].sha256,fault.name+' escaped observation');
    else{assert.match(observed.text,/AssertionError \[ERR_ASSERTION\]/,fault.name+' failed for an unrelated reason');assert.doesNotMatch(observed.text,/SyntaxError|TransformError|Cannot find module/);}
    report.runs.push({name:fault.name,fixture:fault.fixture,method:fault.method,sourceSha256:sha256(changed),exitCode:observed.result.status,
      detection:observed.result.status===0?'changed-observation':'independent-assertion',observationSha256:observed.sha256,logSha256:sha256(fs.readFileSync(observed.log))});
    writeJSON(receipt,report);console.log({detected:fault.name,count:report.runs.length});
  }
  verifyReference(game, {files:Object.fromEntries(Object.entries(lock.files).filter(([f])=>f.startsWith('src/')))});
  report.passed=true;console.log({passed:true,faults:report.runs.length,directory});
}catch(error){report.error={name:error.name,message:error.message};throw error;}finally{verifyReference(ref,lock);writeJSON(receipt,report);}
