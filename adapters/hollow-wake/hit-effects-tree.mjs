import assert from 'node:assert/strict';
import ts from 'typescript';
export function hitEffectsTree(source) {
  const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0);
  const one=(values,label)=>{assert.equal(values.length,1,'Ambiguous hit effect boundary: '+label);return values[0];};
  const world=one(ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),'World');
  const hit=one(world.members.filter(n=>n.name?.getText(ast)==='resolveHit'),'resolveHit');assert(ts.isMethodDeclaration(hit)&&hit.body);
  const top=hit.body.statements;
  const effects=one(top.filter(n=>n.getText(ast)==='const effects = instanceEffects(inst);'),'effects');
  const at=top.indexOf(effects),challenge=top[at-1],loop=top[at+1];
  assert.equal(challenge.getText(ast),'this.challenges.beforeEffects(caster, inst, target, dealt, depth);');
  assert(ts.isForOfStatement(loop));assert.equal(loop.expression.getText(ast),'hitEffects?.length ? [...effects, ...hitEffects] : effects');
  const capture=one(top.filter(n=>n.getText(ast).startsWith('const hitStatusFrame =')),'status frame');
  const context=top[top.indexOf(capture)+1];assert.equal(context.getText(ast),'const {tags, durScale} = hitStatusFrame;');
  assert.equal(loop.statement.statements.length,1);
  const branches={};let branch=loop.statement.statements[0];
  while(branch){assert(ts.isIfStatement(branch));const match=branch.expression.getText(ast).match(/^fx\.type === '([^']+)'/);assert(match);assert(!branches[match[1]]);branches[match[1]]=branch.thenStatement;branch=branch.elseStatement;}
  assert.equal(Object.keys(branches).length,16);
  return {input,ast,world,hit,phases:{capture,context,challenge,effects,loop},branches};
}
