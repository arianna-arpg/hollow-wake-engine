import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {root} from './reference-utils.mjs';

const builds = new Map();
const trees = new Map();
const require = createRequire(import.meta.url);
let compiler;
// Native evidence readers hash Git blobs without installing JavaScript tools.
const typeScript = () => compiler ??= require('typescript');
const git = (args, input) => execFileSync('git', args, {
  cwd: root, input, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
});

/** Compile actual immutable source blobs using their pinned TypeScript version.
 * The virtual tree never reads today's src/dist or writes a checkout, worktree,
 * dependency installation or generated file. Expected hashes are not inputs. */
function historicalTree(sourceRef) {
  assert(/^[a-f0-9]{40}$/.test(sourceRef), 'Expected an immutable source commit');
  if (trees.has(sourceRef)) return trees.get(sourceRef);
  const names = git(['ls-tree', '-r', '--name-only', sourceRef, '--', 'src', 'tsconfig.json', 'package.json', 'package-lock.json'])
    .toString().trim().split(/\r?\n/).filter(Boolean);
  assert(names.includes('tsconfig.json') && names.includes('package-lock.json') && names.some(name => name.startsWith('src/')));
  const bytes = git(['cat-file', '--batch'], names.map(name => sourceRef + ':' + name).join('\n') + '\n');
  const files = new Map(); let offset = 0;
  for (const name of names) {
    assert(!name.includes('\0') && !name.includes(':') && !name.split('/').includes('..'));
    const end = bytes.indexOf(10, offset); assert(end >= offset);
    const match = /^([a-f0-9]{40}) blob (\d+)$/.exec(bytes.subarray(offset, end).toString()); assert(match, name);
    const size = Number(match[2]); offset = end + 1;
    assert(offset + size < bytes.length && bytes[offset + size] === 10, name);
    files.set(name, bytes.subarray(offset, offset + size)); offset += size + 1;
  }
  assert.equal(offset, bytes.length);
  trees.set(sourceRef, files); return files;
}

/** Source hashes use original blob bytes, including their original line endings. */
export function historicalSourceBytes(sourceRef, name) {
  return historicalTree(sourceRef).get(name);
}

export function historicalTypeScript(sourceRef) {
  assert(/^[a-f0-9]{40}$/.test(sourceRef), 'Expected an immutable source commit');
  if (builds.has(sourceRef)) return builds.get(sourceRef);
  const ts = typeScript();
  const files = historicalTree(sourceRef);
  const version = JSON.parse(files.get('package-lock.json')).packages['node_modules/typescript'].version;
  assert.equal(ts.version, version, 'Historical TypeScript compiler version differs');
  const output = compileTypeScriptTree(new Map([...files].map(([name, bytes]) => [name, bytes.toString('utf8')])), sourceRef);
  builds.set(sourceRef, output); return output;
}

/** In-memory compiler boundary, also used by deliberate source-fault controls. */
export function compileTypeScriptTree(files, identity) {
  const ts = typeScript();
  assert(/^[a-zA-Z0-9_-]+$/.test(identity), 'Invalid virtual build identity');
  const virtual = path.join(root, '.artifacts', 'historical-typescript-virtual-' + identity);
  const normalize = name => {
    const absolute = path.resolve(name).replaceAll('\\', '/');
    return ts.sys.useCaseSensitiveFileNames ? absolute : absolute.toLowerCase();
  };
  const prefix = normalize(virtual) + '/';
  const sources = new Map([...files].map(([name, text]) => [normalize(path.join(virtual, name)), text]));
  const directories = new Set([normalize(virtual)]);
  for (const name of sources.keys()) for (let parent = path.dirname(name); normalize(parent).startsWith(prefix); parent = path.dirname(parent)) directories.add(normalize(parent));
  // Only the installed compiler's own libraries are physical inputs. Even an
  // import escaping the virtual root must not read today's source or packages.
  const compilerRoot = normalize(path.dirname(path.dirname(ts.getDefaultLibFilePath({}))));
  const compilerFile = file => normalize(file).startsWith(compilerRoot + '/');
  const readFile = file => sources.get(normalize(file)) ?? (compilerFile(file) ? ts.sys.readFile(file) : undefined);
  const fileExists = file => sources.has(normalize(file)) || (compilerFile(file) && ts.sys.fileExists(file));
  const config = ts.parseConfigFileTextToJson('tsconfig.json', files.get('tsconfig.json')); assert(!config.error);
  assert.deepEqual(config.config.include, ['src']);
  assert.equal(config.config.exclude, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames, readFile, fileExists,
    readDirectory: (_dir, extensions) => [...files.keys()].filter(name => name.startsWith('src/') && extensions.some(ext => name.endsWith(ext))).map(name => path.join(virtual, name)),
  }, virtual);
  assert.deepEqual(parsed.errors, []);
  assert.equal(normalize(parsed.options.rootDir), normalize(path.join(virtual, 'src')));
  assert.equal(normalize(parsed.options.outDir), normalize(path.join(virtual, 'dist')));
  const host = ts.createCompilerHost(parsed.options);
  host.readFile = readFile; host.fileExists = fileExists;
  host.directoryExists = name => directories.has(normalize(name)) || ((normalize(name) === compilerRoot || compilerFile(name)) && ts.sys.directoryExists(name));
  host.getDirectories = name => [...directories].filter(child => normalize(path.dirname(child)) === normalize(name));
  host.getCurrentDirectory = () => virtual;
  host.getSourceFile = (name, options) => {
    const source = readFile(name); return source === undefined ? undefined : ts.createSourceFile(name, source, options, true);
  };
  const output = new Map();
  host.writeFile = (name, text, bom) => {
    const relative = path.relative(virtual, name).replaceAll('\\', '/');
    assert(relative.startsWith('dist/') && !relative.split('/').includes('..'));
    output.set(relative, Buffer.from((bom ? '\uFEFF' : '') + text));
  };
  const program = ts.createProgram(parsed.fileNames, parsed.options, host);
  const errors = ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  assert.deepEqual(errors, [], 'Historical source did not type-check');
  const emitted = program.emit(); assert(!emitted.emitSkipped && emitted.diagnostics.length === 0);
  assert(output.size > 0); return output;
}
