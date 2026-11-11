import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from './reference-utils.mjs';

// Compile the frozen predecessor in memory. Only its controller outputs are
// returned; no current build outputs or installed package files are changed.
export function sequenceContinuationControl(read) {
  const manifest = JSON.parse(read('baseline/sequence-continuation-control/acceptance.json'));
  const source = read(manifest.source).toString();
  assert.equal(sha256(source), manifest.sourceSha256);
  for (const [f, h] of Object.entries(manifest.dependencies)) assert.equal(sha256(read(f)), h, f);
  const config = ts.getParsedCommandLineOfConfigFile(path.join(root, 'tsconfig.json'), {},
    {...ts.sys, onUnRecoverableConfigFileDiagnostic: d => {throw Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));}});
  assert(config);
  const entry = path.join(root, 'src/attack-sequences.ts');
  const host = ts.createCompilerHost(config.options), originalRead = host.readFile.bind(host), emitted = new Map();
  host.readFile = f => path.resolve(f) === entry ? source : originalRead(f);
  host.writeFile = (file, contents) => {
    assert.equal(path.dirname(path.resolve(file)), path.join(root, 'dist'));
    const name = path.basename(file); assert(!emitted.has(name)); emitted.set(name, Buffer.from(contents));
  };
  const program = ts.createProgram([entry], config.options, host), errors = ts.getPreEmitDiagnostics(program);
  assert.equal(errors.length, 0, ts.formatDiagnostics(errors, {getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => '\n'}));
  assert(!program.emit().emitSkipped);
  const control = new Map();
  for (const [name, hash] of Object.entries(manifest.outputs)) {
    const bytes = emitted.get(name); assert(bytes); assert.equal(sha256(bytes), hash, 'Frozen control output changed: ' + name);
    control.set(name, bytes);
  }
  assert.equal(control.size, 3);
  return control;
}
