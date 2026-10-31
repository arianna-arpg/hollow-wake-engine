import assert from 'node:assert/strict';
import ts from 'typescript';

/** Locate the whole dispatcher and its two payload/identity methods, without editing. */
export function procDeliveryTree(source) {
  const input = source.replaceAll('\r\n', '\n');
  const ast = ts.createSourceFile('world.ts', input, ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0);
  const worlds = ast.statements.filter(n => ts.isClassDeclaration(n) && n.name?.text === 'World');
  assert.equal(worlds.length, 1);
  const methods = {};
  for (const name of ['executeProc', 'castProcPayload', 'heldSkillInst']) {
    const found = worlds[0].members.filter(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === name);
    assert.equal(found.length, 1, name);
    assert(found[0].body, name);
    methods[name] = found[0];
  }
  const switches = methods.executeProc.body.statements.filter(ts.isSwitchStatement);
  assert.equal(switches.length, 1);
  assert.equal(switches[0].expression.getText(ast), 'fx.type');
  const branches = {};
  for (const clause of switches[0].caseBlock.clauses) {
    assert(ts.isCaseClause(clause) && ts.isStringLiteral(clause.expression));
    assert(!branches[clause.expression.text]);
    branches[clause.expression.text] = clause;
  }
  assert.equal(Object.keys(branches).length, 22);
  assert.equal(methods.executeProc.body.statements.at(-1).getText(ast),
    'this.fireProcRiders(proc, caster, inst, target, depth);');
  return {input, ast, methods, branches};
}
