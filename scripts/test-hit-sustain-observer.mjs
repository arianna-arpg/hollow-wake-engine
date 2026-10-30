import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {gzipSync,gunzipSync} from 'node:zlib';import ts from 'typescript';
import {root,materialize,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
import {sustainFaults,applySustainFault} from './hit-sustain-observer-faults.mjs';
assert.equal(process.argv.length,2,'This observer control takes no arguments');
const acceptedFile=path.join(root,'baseline/hit-sustain/acceptance.json'),acceptedBytes=fs.readFileSync(acceptedFile),capture=JSON.parse(acceptedBytes);assert.equal(capture.schemaVersion,1);assert.equal(capture.courses,98);assert.equal(sustainFaults.length,38);
const tracked=new Map([[acceptedFile,sha256(acceptedBytes)]]);
for(const[file,hash]of [[capture.helper,capture.helperSha256],['baseline/hit-sustain/source-boundary.json',capture.sourceBoundarySha256],[capture.observations,capture.compressedSha256],[capture.positiveAssertions,capture.positiveAssertionsSha256]]){const absolute=path.join(root,file);assert.equal(sha256(fs.readFileSync(absolute)),hash,file);tracked.set(absolute,hash);}
const boundary=JSON.parse(fs.readFileSync('baseline/hit-sustain/source-boundary.json'));assert.equal(sha256(fs.readFileSync('baseline/source-lock.json')),boundary.sourceLockSha256);tracked.set(path.join(root,'baseline/source-lock.json'),boundary.sourceLockSha256);
const expected=gunzipSync(fs.readFileSync(capture.observations)),helper=fs.readFileSync(capture.helper,'utf8');assert.equal(sha256(expected),capture.observationsSha256);
const lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-sustain-observer-faults-')),game=path.join(directory,'game');materialize(null,lock,game);verifyReference(game,lock);
fs.symlinkSync(fs.realpathSync('.reference/node_modules'),path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
const file=path.join(game,'src/engine/world.ts'),bytes=fs.readFileSync(file),source=bytes.toString().replaceAll('\r\n','\n'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='World'),hit=world.members.find(n=>n.name?.getText(ast)==='resolveHit'),top=hit.body.statements;
assert.equal(top[26].expression.getText(ast),'hasDamage');const statements=top[26].thenStatement.statements;
const reviewed=JSON.parse(fs.readFileSync('baseline/hit-sustain/source-boundary.json'));for(const row of reviewed.statements)assert.equal(sha256(statements[row.index].getText(ast)),row.sha256);
const runtime=path.join(directory,'capture.ts');fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
const errors=data=>data.rows.flatMap(r=>r.steps.filter(s=>!s.error.$undefined).map(s=>[r.name,s.error.message]));const expectedErrors=errors(JSON.parse(expected)),results=[];let passed=false;
try{for(const fault of [['control',null],...sustainFaults]){
 const[name,index]=fault,changed=index===null?source:applySustainFault(source,ast,statements,fault);assert.equal(ts.createSourceFile(file,changed,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
 if(index!==null)fs.writeFileSync(file,changed);
 const out=path.join(directory,name+'.json'),log=fs.openSync(path.join(directory,name+'.txt'),'wx');
 try{execFileSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,out],{cwd:game,stdio:['ignore',log,log],timeout:180000,windowsHide:true});}finally{fs.closeSync(log);fs.writeFileSync(file,bytes);}
 const actual=fs.readFileSync(out),matches=actual.equals(expected),value=JSON.parse(actual);
 const compressed=gzipSync(actual,{level:9});assert(gunzipSync(compressed).equals(actual));fs.writeFileSync(out+'.gz',compressed,{flag:'wx'});fs.unlinkSync(out);
 const result={name,detected:name!=='control'&&!matches,observationsSha256:sha256(actual),compressedSha256:sha256(compressed),matches};results.push(result);
 assert.equal(matches,name==='control',name+' was not distinguished');assert.equal(value.courses,capture.courses);assert.deepEqual(errors(value),expectedErrors,'Unrelated exception: '+name);
 console.log('Verified sustain observer: '+name);
 }passed=true;
}finally{fs.writeFileSync(file,bytes);verifyReference(game,lock);for(const[file,hash]of tracked)assert.equal(sha256(fs.readFileSync(file)),hash,file);
 const report={passed,directory,game,originalRestored:true,expectedFilesRewritten:false,acceptanceSha256:sha256(acceptedBytes),courses:capture.courses,helperSha256:capture.helperSha256,expectedSha256:capture.observationsSha256,faults:results.filter(r=>r.detected).length,results};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-sustain-observer-verification.json',report);console.log({passed,directory,faults:report.faults});}
