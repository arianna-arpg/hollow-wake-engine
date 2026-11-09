import assert from 'node:assert/strict';
import ts from 'typescript';

/** Add passive observation to the pinned original probes; keep every original
 * assertion and command. The same renderer can observe an installed adapter. */
export function renderEquipmentSkillProbe(source, helperImport) {
  const ast = ts.createSourceFile('probe.ts', source, ts.ScriptTarget.Latest, true);
  const imports = ast.statements.filter(ts.isImportDeclaration);
  const arena = imports.find(node => node.moduleSpecifier.text === '../src/sim/arena');
  assert(arena);
  const text = arena.getText(ast); assert.equal(text.split('makeSimWorld').length, 2);
  const checks = ast.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .filter(node => node.name.getText(ast) === 'check');
  assert.equal(checks.length, 1); const check = checks[0].initializer;
  assert(ts.isArrowFunction(check) && ts.isBlock(check.body));
  const exits = ast.statements.filter(ts.isExpressionStatement).filter(node => node.getText(ast) === 'process.exit(failed === 0 ? 0 : 1);');
  assert.equal(exits.length, 1);
  const changes = [
    [arena.getStart(ast), arena.end, text.replace('makeSimWorld', 'makeSimWorld as originalMakeSimWorld')],
    [imports.at(-1).end, imports.at(-1).end, `\nimport {equipmentSkillObserver} from ${JSON.stringify(helperImport)};\nconst observation = equipmentSkillObserver();\nconst makeSimWorld = (...args: Parameters<typeof originalMakeSimWorld>) => observation.track(originalMakeSimWorld(...args));\n`],
    [check.body.statements.pos, check.body.statements.pos, '\n  observation.check(name, ok, detail);'],
    [exits[0].getStart(ast), exits[0].getStart(ast), 'observation.finish(process.argv[2], failed);\n']
  ];
  let output = source;
  for (const [start, end, replacement] of changes.sort((a, b) => b[0] - a[0])) output = output.slice(0, start) + replacement + output.slice(end);
  return output;
}
