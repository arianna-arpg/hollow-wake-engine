import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';
import {procDeliveryTree} from './proc-delivery-tree.mjs';

const accepted = JSON.parse(fs.readFileSync(path.join(root, 'baseline/proc-delivery/acceptance.json')));
const bytes = fs.readFileSync(path.join(root, accepted.sourceBoundary));
assert.equal(sha256(bytes), accepted.sourceBoundarySha256);
const boundary = JSON.parse(bytes);
export function renderProcCasting(source, preflight = false) {
  const {input, ast, methods} = procDeliveryTree(source);
  assert(!/\b(?:engineProcCasting|bindProcCasting)\b/.test(input), 'Proc casting binding collision');
  for (const name of ['castProcPayload', 'heldSkillInst']) {
    assert.equal(sha256(methods[name].getText(ast)), boundary.maps[preflight ? 'original' : 'predecessor'].methods[name].sha256,
      'Unreviewed proc casting: ' + name);
  }
  if (preflight) return source;
  const imports = ast.statements.filter(ts.isImportDeclaration);
  const edits = [
    {start: imports.at(-1).end, end: imports.at(-1).end, text: "\nimport {bindProcCasting} from './procCasting';"},
    {start: methods.castProcPayload.getStart(ast), end: methods.castProcPayload.getStart(ast), text: 'private readonly engineProcCasting = bindProcCasting(this);\n  '},
    {start: methods.castProcPayload.body.getStart(ast), end: methods.castProcPayload.body.end,
      text: '{\n    return this.engineProcCasting.cast(caster, inst, target, depth, cast, aim);\n  }'},
    {start: methods.heldSkillInst.body.getStart(ast), end: methods.heldSkillInst.body.end,
      text: '{\n    return this.engineProcCasting.held(actor, skillId);\n  }'},
  ].sort((a, b) => a.start - b.start);
  let output = input;
  for (const edit of edits.reverse()) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  assert.equal(ts.createSourceFile('world.ts', output, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0);
  return source.includes('\r\n') ? output.replaceAll('\n', '\r\n') : output;
}
export const procCastingDecision = 'Delegate proc payload casting and held-skill identity through synchronous generic geometry, RNG and delivery ports';
export function integrateProcCasting(game, write = true) {
  const target = 'src/engine/procCasting.ts';
  assert(!fs.existsSync(path.join(game, target)), 'Proc casting binding already exists');
  const output = renderProcCasting(fs.readFileSync(path.join(game, 'src/engine/world.ts'), 'utf8'), !write);
  const binding = fs.readFileSync(path.join(root, 'adapters/hollow-wake/procCasting.ts'));
  if (write) {
    fs.writeFileSync(path.join(game, 'src/engine/world.ts'), output);
    fs.writeFileSync(path.join(game, target), binding, {flag: 'wx'});
  }
  return {files: ['src/engine/world.ts', target], decision: procCastingDecision};
}
