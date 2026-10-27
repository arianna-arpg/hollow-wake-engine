import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';

export function readRestorationExpectations() {
  const acceptanceFile='baseline/milestone-forty-three/acceptance.json';
  const acceptance=JSON.parse(fs.readFileSync(path.join(root,acceptanceFile)));
  assert.equal(acceptance.schemaVersion,1);assert.equal(acceptance.milestone,43);
  assert.equal(acceptance.courses,218);assert.equal(acceptance.expectedFailures,14);
  assert.equal(sha256(fs.readFileSync(path.join(root,acceptance.sourceLock))),acceptance.sourceLockSha256);
  assert.deepEqual(acceptance.fixtures.map(r=>[r.name,r.courses,r.expectedFailures]),[
    ['restoration',114,0],['invocation',15,0],['query-order',56,3],['world',10,0],['partial-failure',15,11],['pool-bases',8,0],
  ]);
  assert.equal(acceptance.helpers.length,6);
  assert.equal(new Set(acceptance.helpers.map(h=>h.file)).size,6);
  for(const h of acceptance.helpers)assert.equal(sha256(fs.readFileSync(path.join(root,h.file))),h.sha256);
  const records={};
  for(const key of ['sourceBoundaries','adapterContract','callerInventory']) {
    const row=acceptance[key],bytes=fs.readFileSync(path.join(root,row.file));
    assert.equal(sha256(bytes),row.sha256);records[key]=JSON.parse(bytes);
    assert.equal(records[key].source,acceptance.source);
  }
  const boundaries=records.sourceBoundaries,contract=records.adapterContract;
  assert.equal(boundaries.sourceLockSha256,acceptance.sourceLockSha256);
  assert.equal(contract.sourceLockSha256,acceptance.sourceLockSha256);
  assert.equal(contract.sourceBoundariesSha256,acceptance.sourceBoundaries.sha256);
  for(const graph of [boundaries.original,boundaries.predecessor])for(const owner of Object.values(graph))
    for(const member of Object.values(owner.members))assert.equal(sha256(member.source),member.sha256);
  for(const name of ['gainEs','gainPoise','maxEs','maxPoise','maxMana'])
    assert.equal(boundaries.original.actor.members[name].sha256,boundaries.predecessor.actor.members[name].sha256);
  assert.equal(boundaries.original.world.members.applyRestore.sha256,boundaries.predecessor.world.members.applyRestore.sha256);
  assert.equal(contract.worldMembers.executeProc.sha256,boundaries.predecessor.world.members.executeProc.sha256);
  const ast=ts.createSourceFile('boundary.ts','class Boundary {\n'+boundaries.predecessor.world.members.executeProc.source+'\n}',ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0);
  const method=ast.statements[0].members[0],switches=method.body.statements.filter(ts.isSwitchStatement);
  assert.equal(switches.length,1);const cases=switches[0].caseBlock.clauses;
  assert.equal(cases.length,22);assert(cases.every(n=>ts.isCaseClause(n)&&ts.isStringLiteral(n.expression)));
  assert.deepEqual(cases.map(n=>n.expression.text),Object.keys(contract.caseHashes));
  for(const clause of cases)assert.equal(sha256(clause.getText(ast)),contract.caseHashes[clause.expression.text]);
  const fixtures=new Map();
  for(const row of acceptance.fixtures) {
    assert(acceptance.helpers.some(h=>h.file===row.helper&&h.sha256===row.helperSha256));
    const compressed=fs.readFileSync(path.join(root,row.file));assert.equal(sha256(compressed),row.compressedSha256);
    const bytes=gunzipSync(compressed);assert.equal(bytes.length,row.bytes);assert.equal(sha256(bytes),row.fixtureSha256);
    const value=JSON.parse(bytes);assert.equal(value.courses,row.courses);assert.equal(value.rows.length,row.courses);
    assert.equal(value.rows.filter(r=>r.error!==undefined&&r.error!==null).length,row.expectedFailures);
    fixtures.set(row.name,{bytes,value});
  }
  assert.equal(fixtures.get('restoration').value.authored.length,23);
  return {acceptance,acceptanceFile,boundaries,contract,fixtures,helpers:acceptance.helpers,rows:acceptance.fixtures,courses:218};
}
