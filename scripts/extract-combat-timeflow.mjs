import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256, writeJSON} from './reference-utils.mjs';
const file = 'src/engine/timeflow.ts', bytes = fs.readFileSync(path.join(root, '.reference', file));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
assert.equal(sha256(bytes), lock.files[file]);
const ast = ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true);
const names = ['TimeBody', 'ActorTimeFilter', 'TimeHudSpec', 'TimeHold', 'ChronoSpec'];
const declarations = names.map(name => {
  const node = ast.statements.find(n => ts.isInterfaceDeclaration(n) && n.name.text === name);
  assert(node, name); return node.getText(ast);
});
const node = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'Timeflow');
let source = node.getText(ast);
source = source.replace('export class Timeflow {', `export class CombatTimeflow {
  constructor(readonly status: (id: string) => {timeScale?: number} | undefined,
    readonly surfaces: Readonly<Record<string, {scale: number; kind?: string; hud?: TimeHudSpec}>> = {}) {}`);
source = source.replace('const spec = TIME_CFG.surfaces[id];', 'const spec = this.surfaces[id];')
  .replace('STATUS_DEFS[st.id]?.timeScale', 'this.status(st.id)?.timeScale')
  .replace('hold(h: TimeHold): boolean {', `hold(h: TimeHold): boolean {
    if (!h.id || !Number.isFinite(h.scale) || h.scale < 0 || h.duration !== undefined
      && (!Number.isFinite(h.duration) || h.duration < 0)) throw new RangeError('Invalid time hold');`)
  .replace('beginFrame(rawDt: number): number {', `beginFrame(rawDt: number): number {
    if (!Number.isFinite(rawDt) || rawDt < 0) throw new RangeError('Invalid raw frame duration');`);
const code = '// Mechanically extracted combat time rules; no menu, campaign or host imports.\n'
  + 'type Team = string;\n' + declarations.join('\n\n') + '\n\n' + source + '\n';
const output = 'src/combat-timeflow.ts';
const manifest = {schemaVersion: 1, sourceCommit: lock.commit, source: file, sourceSha256: sha256(bytes),
  output, outputSha256: sha256(code), changes: ['Inject status definitions and optional host surface rules',
    'Refuse invalid time and hold durations before mutation', 'Team is a host identifier']};
if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(path.join(root, output), 'utf8'), code);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'baseline/combat-timeflow-extraction.json'))), manifest);
} else {
  assert(!fs.existsSync(path.join(root, output)), 'Refusing to overwrite combat timeflow');
  fs.writeFileSync(path.join(root, output), code);
  writeJSON(path.join(root, 'baseline/combat-timeflow-extraction.json'), manifest);
}
console.log({passed: true, output});
