import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
import {root, sha256} from './reference-utils.mjs';
import {readParitySource} from './prototype-parity-tools.mjs';

// Read-only review of independently pinned declarations. Comments and formatting
// are normalized; expected observations and working source are never rewritten.
const [file, names, section] = process.argv.slice(2);
let name = names;
assert(file && name, 'Usage: review-prototype-declaration.mjs src/path.ts Class.method [caster-effects]');
const {files} = readParitySource();
const previous = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const printer = ts.createPrinter({removeComments:true});
function render(bytes) {
  if (!bytes) return '// absent\n';
  const ast = ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true);
  let selected;
  for (const node of ast.statements) {
    if (ts.isClassDeclaration(node)) {
      if (name.startsWith(node.name.text + '.')) selected = node.members.find(m =>
        (ts.isConstructorDeclaration(m) ? 'constructor' : m.name?.getText(ast)) === name.slice(node.name.text.length + 1));
    } else if (ts.isVariableStatement(node)) selected ??= node.declarationList.declarations.find(n => n.name.getText(ast) === name);
    else if (node.name?.getText(ast) === name) selected = node;
  }
  if (!selected) return '// absent\n';
  if (section && section !== 'death') {
    assert.equal(section, 'caster-effects');
    selected = selected.body.statements.find(n => ts.isForOfStatement(n) && n.expression.getText(ast) === 'instanceEffects(inst)');
    assert(selected);
  }
  return printer.printNode(ts.EmitHint.Unspecified, selected, ast) + '\n';
}
const before = previous.files[file] ? fs.readFileSync(path.join(root, '.reference', file)) : undefined;
if (before) assert.equal(sha256(before), previous.files[file]);
const temporary = fs.mkdtempSync(path.join(root, '.artifacts/parity-review-owned-'));
try {
  const a = path.join(temporary, 'october.ts'), b = path.join(temporary, 'november.ts');
  for (name of names.split(',')) {
  const beforeText=render(before);fs.writeFileSync(a,beforeText);
  if(section==='death')name='World.runDeath';
  const afterText=render(files.get(file));
  assert(beforeText!=='// absent\n'||afterText!=='// absent\n','Unknown declaration: '+name);
  fs.writeFileSync(b,afterText);
  const result = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--no-color', '--unified=3', a, b], {encoding:'utf8',maxBuffer:16*1024*1024});
  assert([0,1].includes(result.status), result.stderr || result.error?.message);
  process.stdout.write('\n'+file+':'+name+'\n'+result.stdout.split('\n').filter(line=>!line.startsWith('diff --git')&&!line.startsWith('index ')&&!line.startsWith('--- ')&&!line.startsWith('+++ ')).join('\n'));
  }
} finally { fs.rmSync(temporary, {recursive:true,force:true}); }
