import assert from 'node:assert/strict';
import ts from 'typescript';

/** Exact semantic locations; fingerprints are checked separately before edits. */
export function statusEffectsTree(source) {
  const input=source.replaceAll('\r\n','\n');
  const ast=ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0);
  const one=(nodes,label)=>{assert.equal(nodes.length,1,'Ambiguous status effect boundary: '+label);return nodes[0];};
  const world=one(ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),'World');
  const member=name=>one(world.members.filter(n=>n.name?.getText(ast)===name),name);
  const methods=Object.fromEntries(['transplantStatus','cleanseActor','ringAfflictions','shedStatusStack','ruptureBank','ruptureStatus','assaultDoomCull'].map(name=>[name,member(name)]));
  for(const n of Object.values(methods))assert(ts.isMethodDeclaration(n)&&n.body);
  const find=(parent,predicate,label)=>{const found=[];const visit=n=>{if(predicate(n))found.push(n);ts.forEachChild(n,visit);};visit(parent);return one(found,label);};
  const expired=find(member('update'),n=>ts.isIfStatement(n)&&n.expression.getText(ast)==='a.expiredStatuses.length','expiry');
  const siblings=expired.parent.statements,index=siblings.indexOf(expired);assert(index>=0);
  const zap=siblings[index+1],lash=siblings[index+2];
  assert(ts.isForOfStatement(zap)&&zap.getText(ast).includes('const zn = STATUS_DEFS[s.id]?.zapNearby;'));
  assert(ts.isForOfStatement(lash)&&lash.getText(ast).includes('const lo = STATUS_DEFS[s.id]?.lashOut;'));
  const death=member('kill').body.statements;
  const capture=one(death.filter(n=>n.getText(ast).startsWith('const propagatingAfflictions =')),'death capture');
  const detonate=death[death.indexOf(capture)+1];assert(ts.isIfStatement(detonate)&&detonate.expression.getText(ast)==='!silent');
  const spread=one(death.filter(n=>ts.isIfStatement(n)&&n.getText(ast).includes('for (const s of propagatingAfflictions)')),'death propagation');
  const proc=find(member('executeProc'),n=>ts.isCaseClause(n)&&n.expression.getText(ast)==="'status'",'proc application');
  return {input,ast,world,methods,phases:{expired,zap,lash,capture,detonate,spread,proc}};
}
