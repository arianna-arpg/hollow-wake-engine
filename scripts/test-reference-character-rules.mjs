import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {root, listFiles, sha256, verifyReference, writeJSON} from './reference-utils.mjs';
import {readVocationFixture, prepareVocationObserver, checkVocationObserverTypes, captureVocationObserver} from './vocation-reference.mjs';

const ref = path.join(root, '.reference');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'baseline/character-rules/acceptance.json')));
const lockBytes = fs.readFileSync(path.join(root, 'baseline/source-lock.json'));
assert.equal(sha256(lockBytes), contract.sourceLockSha256);
const lock = JSON.parse(lockBytes);
verifyReference(ref, lock);

const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--game'));
const game = args.length ? fs.realpathSync(args[1]) : ref;
const protectedPaths = [path.join(game, 'src')];
if (game !== ref) protectedPaths.push(path.join(game, 'node_modules/@hollow-wake/engine'));
const snapshot = dir => Object.fromEntries(listFiles(dir).map(file => [file, sha256(fs.readFileSync(path.join(dir, file)))]));
const before = protectedPaths.map(snapshot);
fs.mkdirSync(path.join(root, '.artifacts'), {recursive:true});
const directory = fs.mkdtempSync(path.join(root, '.artifacts/reference-character-rules-'));
const runs = {};
let passed = false;
try {
  const entries = {};
  for (const [name, fixture] of Object.entries(contract.fixtures)) {
    for (const [qualified, digest] of Object.entries(fixture.methods)) {
      const [source, member] = qualified.split('#');
      const ast = ts.createSourceFile(source, fs.readFileSync(path.join(ref, 'src', source), 'utf8'), ts.ScriptTarget.Latest, true);
      const world = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'World');
      const declaration = world
        ? world.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === member)
        : ast.statements.find(n => (ts.isFunctionDeclaration(n) && n.name?.text === member) ||
          (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === member)));
      assert(declaration, qualified);
      assert.equal(sha256(declaration.getText(ast).replaceAll('\r\n','\n')), digest, qualified);
    }
    entries[name] = prepareVocationObserver(name, game, directory, contract.fixtures);
  }
  checkVocationObserverTypes(directory, Object.values(entries));
  for (const [name, entry] of Object.entries(entries)) {
    const run = captureVocationObserver(entry, directory, name+'-observations');
    assert(run.bytes.equals(readVocationFixture(name, contract.fixtures)), name+' observations differ from the frozen game');
    runs[name] = run.sha256;
  }
  passed = true;
} finally {
  protectedPaths.forEach((dir,i) => assert.deepEqual(snapshot(dir),before[i],dir));
  verifyReference(ref,lock);
  writeJSON(path.join(directory,'verification.json'), {passed,directory,game,runs});
  console.log({passed,directory,game,runs});
}
