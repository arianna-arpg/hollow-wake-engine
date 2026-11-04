import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

/** Locate an existing service's conditional cue in the installed dispatcher.
 * Earlier service fixtures still exercise the same behavior at its new owner. */
export function procServiceSite(file, id) {
  const ast = ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const factory = ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createProcDelivery');
  const execute = factory?.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='execute');
  const dispatch = execute?.body.statements.find(ts.isSwitchStatement);
  assert.equal(dispatch?.expression.getText(ast),'kind');
  const clause = dispatch.caseBlock.clauses.find(n=>ts.isCaseClause(n)&&n.expression.text===id);
  assert(clause && clause.statements.length===2);
  const [conditional,exit] = clause.statements;
  assert(ts.isIfStatement(conditional)&&ts.isBreakStatement(exit));
  const call = conditional.expression.getText(ast), cue = conditional.thenStatement.getText(ast);
  assert(call.startsWith('ports.'+id+'('));assert.equal(cue,"ports.cue(caster, cue, 'gain', proc.id);");
  return {start:clause.getStart(ast),end:clause.end,statement:conditional.getText(ast),call,cue};
}
