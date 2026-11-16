import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const files = fs.readdirSync('adapters/embedded').filter(name => name.startsWith('combat-') && name.endsWith('.mjs'))
  .map(name => 'adapters/embedded/' + name);
// This pass checks lexical scope only. Runtime TypeScript is checked by build;
// resolving its entire declaration graph here adds no lexical evidence.
const program = ts.createProgram(files, {allowJs: true, checkJs: true, noEmit: true, noResolve: true, target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true});
const missing = program.getSemanticDiagnostics().filter(d => [2304, 18004].includes(d.code));
assert.equal(missing.length, 0, missing.map(d => `${d.file?.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`).join('\n'));
console.log({passed: true, modules: files.length, unresolvedLexicalNames: 0});
