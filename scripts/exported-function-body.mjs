import assert from 'node:assert/strict';
import ts from 'typescript';

/** Locate only an exported callable's body, never nearby strings or exports.
 * Used by fault injectors; unsupported or ambiguous declarations fail closed. */
export function exportedFunctionBody(source, name) {
  const ast = ts.createSourceFile('runtime.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, 'Invalid mutation source');
  const matches = [];
  for (const statement of ast.statements) {
    if (!statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      assert(statement.body, 'Exported function needs a body');
      matches.push(statement.body);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
        assert(statement.declarationList.flags & ts.NodeFlags.Const, 'Callable binding must be const');
        assert.equal(statement.declarationList.declarations.length, 1, 'One callable per statement');
        assert(declaration.initializer && ts.isFunctionExpression(declaration.initializer), 'Expected named function expression');
        assert.equal(declaration.initializer.name?.text, name, 'Callable name differs from export');
        matches.push(declaration.initializer.body);
      }
    }
  }
  assert.equal(matches.length, 1, 'Missing or ambiguous exported function: ' + name);
  return {start: matches[0].getStart(ast), end: matches[0].end};
}
