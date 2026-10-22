import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { root, sha256 } from '../../scripts/reference-utils.mjs';

export const requestWorld = 'src/engine/world.ts';
const lf = source => source.replaceAll('\r\n', '\n');
function request(source) {
  const ast = ts.createSourceFile(requestWorld, source, ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0, 'Invalid request source');
  const worlds = ast.statements.filter(node => ts.isClassDeclaration(node) && node.name?.text === 'World');
  assert.equal(worlds.length, 1);
  const methods = worlds[0].members.filter(node => node.name?.getText(ast) === 'useSkill');
  assert.equal(methods.length, 1);
  return { ast, method: methods[0] };
}

export function renderRequestWorld(source, reference) {
  const current = lf(source), original = lf(reference);
  assert(!/\b(?:sdkSkillRequest|sdkRequestResult|SkillRequest)\b/.test(current), 'Request already integrated or binding collision');
  const { ast, method } = request(current), baseline = request(original);
  const acceptance = JSON.parse(fs.readFileSync(path.join(root, 'baseline/milestone-thirty-three/acceptance.json')));
  const count = acceptance.sourceBoundary.prefix.statements;
  const statements = method.body.statements, expected = baseline.method.body.statements;
  assert(statements.length > count && expected.length > count);
  assert.equal(current.slice(method.getStart(ast), method.body.getStart(ast)),
    original.slice(baseline.method.getStart(baseline.ast), baseline.method.body.getStart(baseline.ast)), 'Unreviewed request signature');
  const start = statements[0].getFullStart(), end = statements[count - 1].end;
  const prefix = original.slice(expected[0].getFullStart(), expected[count - 1].end);
  assert.equal(sha256(prefix), acceptance.sourceBoundary.prefix.normalizedSha256, 'Original request prefix changed');
  assert.equal(current.slice(start, end), prefix, 'Unreviewed request preflight');
  assert(statements[count].getText(ast).startsWith(acceptance.sourceBoundary.endsBefore), 'Unreviewed request continuation boundary');
  const ports = lf(fs.readFileSync(path.join(root, 'adapters/hollow-wake/skill-request-ports.txt'), 'utf8')).trimEnd();
  const edits = [
    { start, end, text: "\n    const sdkRequestResult = this.sdkSkillRequest.preflight(caster, inst, aim, seatPress);\n    if (sdkRequestResult !== 'continue') return sdkRequestResult;" },
    { start: method.getStart(ast), end: method.getStart(ast), text: ports + '\n\n  ' },
    { start: ast.statements.filter(ts.isImportDeclaration).at(-1).end, end: ast.statements.filter(ts.isImportDeclaration).at(-1).end,
      text: "\nimport {SkillRequest} from '@hollow-wake/engine/casting/request';" },
  ];
  let output = current;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  assert.equal(request(output).ast.parseDiagnostics.length, 0);
  return output;
}

export function integrateSkillRequest(game, write = true) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
  const reference = fs.readFileSync(path.join(root, '.reference', requestWorld));
  assert.equal(sha256(reference), lock.files[requestWorld]);
  const file = path.join(game, requestWorld), source = fs.readFileSync(file, 'utf8');
  const text = renderRequestWorld(source, reference.toString()).replaceAll('\n', source.includes('\r\n') ? '\r\n' : '\n');
  if (write) fs.writeFileSync(file, text);
  return { files: [requestWorld] };
}
