import assert from 'node:assert/strict';
import ts from 'typescript';
export function hitPreparationTree(source) {
  const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0);
  const one=(values,label)=>{assert.equal(values.length,1,'Ambiguous preparation boundary: '+label);return values[0];};
  const world=one(ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),'World');
  const hit=one(world.members.filter(n=>n.name?.getText(ast)==='resolveHit'),'resolveHit');assert(ts.isMethodDeclaration(hit)&&hit.body);
  const top=hit.body.statements;assert(top.length>23);
  assert.equal(top[23].getText(ast),"const hasDamage = forceDamage || def.effects.some(e => e.type === 'damage');");
  const header=input.slice(hit.getStart(ast),hit.body.getStart(ast));
  const tail=input.slice(top[23].getFullStart(),hit.body.end);
  const imports=ast.statements.filter(n=>ts.isImportDeclaration(n));
  const retired=Object.fromEntries(['./victim','./tuning'].map(id=>[id,one(imports.filter(n=>n.moduleSpecifier.text===id),id)]));
  return {input,ast,world,hit,top,header,tail,imports,retired};
}
