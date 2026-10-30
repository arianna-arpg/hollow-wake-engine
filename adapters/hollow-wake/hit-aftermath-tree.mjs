import assert from 'node:assert/strict';
import ts from 'typescript';

/** Locate the whole remaining resolver continuation, without changing it.
 * Original and installed shapes differ only at already-extracted capabilities. */
export function hitAftermathTree(source,original=false){
  const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0,'Invalid World source');
  const worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1);
  const world=worlds[0],methods=world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(ast)===(original?'resolveHit':'continueLandedHit'));assert.equal(methods.length,1);
  const method=methods[0],top=[...method.body.statements];assert.equal(top.length,original?63:28,'Unreviewed continuation shape');
  const damaging=top[original?26:0];assert(ts.isIfStatement(damaging)&&damaging.expression.getText(ast)==='hasDamage');assert(ts.isBlock(damaging.thenStatement));
  const inner=[...damaging.thenStatement.statements];assert.equal(inner.length,original?66:19,'Unreviewed damaging phase shape');
  const remainder=inner.slice(original?50:3),tail=top.slice(original?27:1);assert.equal(remainder.length,16);
  assert(remainder[0].getText(ast).startsWith('if (dealt > 0 && target.volatile'));
  assert(remainder.at(-1).getText(ast).startsWith('if (depth === 0)'));
  assert(tail[0].getText(ast).startsWith('if (dealt > 0)'));
  assert(tail.at(-1).getText(ast).includes("this.rollTriggers(caster, 'meleeHit'"));
  return {input,ast,world,method,top,damaging,inner,remainder,tail};
}
