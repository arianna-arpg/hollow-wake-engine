import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';

export function cooldownTree(source){
  const ast=ts.createSourceFile('world.ts',source,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0,'Invalid cooldown source');
  const owners=ast.statements.filter(node=>ts.isClassDeclaration(node)&&node.name?.text==='World');assert.equal(owners.length,1,'Ambiguous cooldown owner');
  const methods=owners[0].members.filter(node=>ts.isMethodDeclaration(node)&&node.name?.getText(ast)==='executeProc');assert.equal(methods.length,1,'Ambiguous cooldown method');
  const method=methods[0];assert(method.body,'Invalid cooldown method');const switches=method.body.statements.filter(ts.isSwitchStatement);
  assert.equal(switches.length,1,'Ambiguous cooldown switch');assert.equal(switches[0].expression.getText(ast),'fx.type','Unreviewed cooldown discriminator');
  const cases=switches[0].caseBlock.clauses;assert(cases.every(node=>ts.isCaseClause(node)&&ts.isStringLiteral(node.expression)),'Invalid cooldown cases');
  const matching=cases.filter(node=>node.expression.text==='cooldown');assert.equal(matching.length,1,'Ambiguous cooldown branch');
  return {ast,owner:owners[0],method,cases,clause:matching[0]};
}
export function readCooldownExpectations(){
  const acceptanceFile='baseline/cooldowns/acceptance.json',acceptance=JSON.parse(fs.readFileSync(path.join(root,acceptanceFile)));
  assert.equal(acceptance.schemaVersion,1);assert.equal(acceptance.capability,'proc-cooldown');assert.equal(acceptance.courses,75);assert.equal(acceptance.expectedFailures,10);assert.equal(acceptance.authoredInputs,12);
  assert.equal(sha256(fs.readFileSync(path.join(root,acceptance.sourceLock))),acceptance.sourceLockSha256);
  assert.deepEqual(acceptance.fixtures.map(row=>[row.name,row.courses,row.expectedFailures]),[['rules',31,3],['live',34,7],['world',10,0]]);
  assert.equal(acceptance.helpers.length,3);assert.equal(new Set(acceptance.helpers.map(row=>row.file)).size,3);
  for(const row of acceptance.helpers)assert.equal(sha256(fs.readFileSync(path.join(root,row.file))),row.sha256,'Changed original helper: '+row.file);
  const boundaryBytes=fs.readFileSync(path.join(root,acceptance.sourceBoundary.file));assert.equal(sha256(boundaryBytes),acceptance.sourceBoundary.sha256);
  const boundary=JSON.parse(boundaryBytes);assert.equal(boundary.source,acceptance.source);assert.equal(boundary.sourceLockSha256,acceptance.sourceLockSha256);
  for(const owner of [boundary.original,boundary.predecessor]){
    assert.equal(sha256(owner.methodSource),owner.methodSha256);const tree=cooldownTree('class World {\n'+owner.methodSource+'\n}');
    assert.equal(tree.cases.length,22);assert.deepEqual(tree.cases.map(node=>node.expression.text),Object.keys(owner.caseHashes));
    for(const node of tree.cases)assert.equal(sha256(node.getText(tree.ast)),owner.caseHashes[node.expression.text]);
    assert.equal(tree.clause.getText(tree.ast),owner.cooldownSource);
  }
  assert.equal(boundary.original.cooldownSource,boundary.predecessor.cooldownSource);
  const fixtures=new Map();
  for(const row of acceptance.fixtures){
    assert(acceptance.helpers.some(helper=>helper.file===row.helper&&helper.sha256===row.helperSha256));
    const compressed=fs.readFileSync(path.join(root,row.file));assert.equal(sha256(compressed),row.compressedSha256);
    const bytes=gunzipSync(compressed);assert.equal(bytes.length,row.bytes);assert.equal(sha256(bytes),row.fixtureSha256);
    const value=JSON.parse(bytes);assert.equal(value.courses,row.courses);assert.equal(value.rows.length,row.courses);
    assert.equal(value.rows.filter(item=>item.failure||item.stages?.some(stage=>stage.failure)).length,row.expectedFailures);
    fixtures.set(row.name,{bytes,value});
  }
  const authored=fixtures.get('live').value.authored;assert.equal(authored.length,12);assert.equal(new Set(authored.map(row=>row.id)).size,12);
  return {acceptance,acceptanceFile,boundary,fixtures,helpers:acceptance.helpers,rows:acceptance.fixtures,courses:75};
}
