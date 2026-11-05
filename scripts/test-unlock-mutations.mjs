import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
import {faults} from './unlock-runtime-faults.mjs';
const accepted=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/unlock-package-latest.json')));assert(accepted.passed);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/unlock-mutations-')),consumer=path.join(directory,'consumer');
fs.cpSync(accepted.consumer,consumer,{recursive:true});
const hashes=directory=>Object.fromEntries(listFiles(directory).map(file=>[file,sha256(fs.readFileSync(path.join(directory,file)))]));
const before=hashes(consumer),controlBefore=hashes(accepted.consumer);
const results=[];let passed=false;
function run(label,file){
 const log=path.join(directory,label+'.txt'),fd=fs.openSync(log,'wx');let result;
 try{result=spawnSync(process.execPath,[file],{cwd:consumer,stdio:['ignore',fd,fd],windowsHide:true,timeout:120000});}finally{fs.closeSync(fd);}
 assert(!result.error,result.error?.message);assert.equal(result.signal,null);assert([0,1].includes(result.status));
 const text=fs.readFileSync(log,'utf8');return {status:result.status,text,sha256:sha256(text)};
}
try{
 for(const [group,rows]of Object.entries(faults)){
  const contracts=group==='memory'?'memory-rewards.test.mjs':group==='unlocks'?'unlock-lifecycle.test.mjs':'unlock-content.test.mjs';
  const observer=group==='memory'?'memory-consumer.mjs':'unlock-consumer.mjs';
  assert.equal(run(group+'-control-contracts',contracts).status,0);assert.equal(run(group+'-control-observations',observer).status,0);
  for(const row of rows){
   const [name,module,method,needle,replacement]=group==='content'?row:[row[0],group==='memory'?'memory-rewards':'unlock-lifecycle',...row.slice(1)];
   const target=path.join(consumer,'node_modules/@hollow-wake/engine/dist',module+'.js'),bytes=fs.readFileSync(target),source=bytes.toString();
   const ast=ts.createSourceFile(target,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),owner=ast.statements.find(ts.isClassDeclaration);
   const node=owner?owner.members.find(n=>method==='constructor'?ts.isConstructorDeclaration(n):ts.isMethodDeclaration(n)&&n.name.getText(ast)===method):
    ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===method);
   assert(node,name);const selected=node.getText(ast);let replaced;
   if(name==='predicate-read-order'){
    const clause=node.body.statements.find(ts.isSwitchStatement).caseBlock.clauses.find(n=>ts.isCaseClause(n)&&n.expression.text==='any');assert(clause);
    replaced=selected.replace(clause.getText(ast),"case 'any': return predicate.terms.map(term=>testUnlockPredicate(term,input)).some(Boolean);");
   }else if(name==='receipt-own-storage'){
    const statement=node.body.statements.find(n=>ts.isExpressionStatement(n)&&n.expression.getText(ast).startsWith('Object.defineProperty(account.memoryReceipts,'));assert(statement);
    replaced=selected.replace(statement.getText(ast),replacement);
   }else{
    assert(selected.includes(needle),name);if(group==='memory'||group==='content')assert.equal(selected.split(needle).length,2,name);
    replaced=name==='ordinary-currency-debit'?selected.replaceAll(needle,replacement):selected.replace(needle,replacement);
   }
   const changed=source.slice(0,node.getStart(ast))+replaced+source.slice(node.end);
   assert.notEqual(changed,source);assert.equal(ts.createSourceFile(target,changed,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
   fs.writeFileSync(target,changed);
   try{
    const contract=run(group+'-'+name+'-contracts',contracts),observation=run(group+'-'+name+'-observations',observer);
    assert([contract,observation].some(r=>r.status===1&&/AssertionError|ERR_ASSERTION/.test(r.text)),name+' survived or failed outside an outcome assertion');
    results.push({group,name,module,method,contractsStatus:contract.status,observationStatus:observation.status,contractsLogSha256:contract.sha256,observationLogSha256:observation.sha256});
   }finally{fs.writeFileSync(target,bytes);}
   writeJSON(path.join(directory,'progress.json'),{results});
  }
  assert.equal(run(group+'-restored-contracts',contracts).status,0);assert.equal(run(group+'-restored-observations',observer).status,0);
  console.log({group,detected:rows.length});
 }
 passed=true;
}finally{
 assert.deepEqual(hashes(consumer),before);assert.deepEqual(hashes(accepted.consumer),controlBefore);
 const report={passed,directory,archiveSha256:accepted.archives[0].sha256,results,sourceRestored:true,acceptedConsumerPreserved:true};
 writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/unlock-mutations-latest.json'),report);
 console.log({passed,directory,detected:results.length});
}
