import assert from 'node:assert/strict';
import ts from 'typescript';
export function hitLandingTree(source,original=false) {
  const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0);
  const one=(nodes,label)=>{assert.equal(nodes.length,1,'Ambiguous landing boundary: '+label);return nodes[0];};
  const world=one(ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),'World');
  const name=original?'resolveHit':'continuePreparedHit',hit=one(world.members.filter(n=>n.name?.getText(ast)===name),name);assert(ts.isMethodDeclaration(hit)&&hit.body);
  const offset=original?23:0,top=hit.body.statements,admission=top.slice(offset,offset+3),damage=top[offset+3];
  assert.equal(admission.length,3);assert(ts.isIfStatement(damage)&&ts.isBlock(damage.thenStatement));assert.equal(damage.expression.getText(ast),'hasDamage');
  const landing=damage.thenStatement.statements;assert(landing.length>18);assert(top.length>offset+4);
  const header=input.slice(hit.getStart(ast),hit.body.getStart(ast));
  const damageTail=input.slice(landing[18].getFullStart(),damage.thenStatement.end);
  const afterTail=input.slice(top[offset+4].getFullStart(),hit.body.end);
  const imports=ast.statements.filter(n=>ts.isImportDeclaration(n)),damageImport=one(imports.filter(n=>n.moduleSpecifier.text==='./damage'),'damage import');
  const perceptionImport=one(imports.filter(n=>n.moduleSpecifier.text==='./perception'),'perception import');
  return {input,ast,world,hit,top,admission,damage,landing,header,damageTail,afterTail,imports,damageImport,perceptionImport};
}
