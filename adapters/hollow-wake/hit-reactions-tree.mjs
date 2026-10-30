import assert from 'node:assert/strict';
import ts from 'typescript';

export function hitReactionsTree(source,original=false){
  const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0);
  const one=(rows,name)=>{assert.equal(rows.length,1,'Ambiguous hit reaction boundary: '+name);return rows[0];};
  const world=one(ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),'World'),name=original?'resolveHit':'continueLandedHit';
  const hit=one(world.members.filter(n=>n.name?.getText(ast)===name),name);assert(ts.isMethodDeclaration(hit)&&hit.body);
  const damage=hit.body.statements[original?26:0];assert(ts.isIfStatement(damage)&&ts.isBlock(damage.thenStatement));assert.equal(damage.expression.getText(ast),'hasDamage');
  const statements=damage.thenStatement.statements,offset=original?21:2,reactions=statements.slice(offset,offset+29);assert.equal(reactions.length,29);assert(statements.length>offset+29);
  assert.equal(reactions[0].getText(ast),'caster.lastCombatAt = this.time;');
  assert.equal(reactions.at(-1).getText(ast),'if (dealt > 0) this.bankDamageTakenTriggers(target, dealt, caster);');
  assert.match(statements[offset+29].getText(ast),/^if \(dealt > 0 && target\.volatile/);
  const prefix=input.slice(hit.getStart(ast),reactions[0].getFullStart()),suffix=input.slice(reactions.at(-1).end,hit.end),imports=ast.statements.filter(n=>ts.isImportDeclaration(n));
  return {input,ast,world,hit,damage,reactions,offset,prefix,suffix,imports};
}
