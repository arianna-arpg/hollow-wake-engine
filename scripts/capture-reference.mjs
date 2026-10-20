// Explicit, one-time capture. Normal verification never updates accepted evidence.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, selectedPaths, git, sha256, writeJSON, listFiles, materialize, verifyReference, captureArchive } from './reference-utils.mjs';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/capture-reference.mjs <game-checkout>');
const lockFile = path.join(root, 'baseline/source-lock.json');
if (fs.existsSync(lockFile)) throw new Error('A reference is already pinned; create a reviewed baseline revision instead.');
const commit = git(source, ['rev-parse', 'HEAD']).trim();
const changed = git(source, ['diff', '--name-only', commit, '--', ...selectedPaths]).trim().split(/\r?\n/).filter(Boolean);
const untracked = git(source, ['ls-files', '--others', '--exclude-standard', '--', ...selectedPaths]).trim().split(/\r?\n/).filter(Boolean);
const overlay = [...new Set([...changed, ...untracked])].sort().map(file => {
  const input = path.join(source, file);
  if (!fs.existsSync(input)) return { path: file, deleted: true };
  const bytes = fs.readFileSync(input);
  const output = path.join(root, 'baseline/overlay', file);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, bytes);
  return { path: file, sha256: sha256(bytes), bytes: bytes.length, untracked: untracked.includes(file) };
});
const lock = {
  schemaVersion: 1,
  upstream: 'https://github.com/arianna-arpg/arpg-game-world.git',
  commit,
  branchAtCapture: git(source, ['branch', '--show-current']).trim(),
  capturedAt: new Date().toISOString(),
  explanation: 'Immutable committed source plus exact relevant working-tree overlay. No saves, personal settings, media, credentials, or unrelated worktrees.',
  node: process.version,
  paths: selectedPaths,
  overlay,
  files: {},
};
const destination = path.join(root, '.reference');
lock.sourceArchive = captureArchive(source, lock);
materialize(source, lock, destination);
for (const file of listFiles(destination)) {
  lock.files[file] = sha256(fs.readFileSync(path.join(destination, file)));
}
// Detect concurrent edits in the captured inputs before accepting the snapshot.
for (const entry of overlay) {
  const file = path.join(source, entry.path);
  if (entry.deleted ? fs.existsSync(file) : sha256(fs.readFileSync(file)) !== entry.sha256) {
    throw new Error(`Source changed during capture: ${entry.path}`);
  }
}
if (git(source, ['rev-parse', 'HEAD']).trim() !== commit) throw new Error('HEAD changed during capture.');
const changedAfter = git(source, ['diff', '--name-only', commit, '--', ...selectedPaths]).trim().split(/\r?\n/).filter(Boolean);
const untrackedAfter = git(source, ['ls-files', '--others', '--exclude-standard', '--', ...selectedPaths]).trim().split(/\r?\n/).filter(Boolean);
if (JSON.stringify([...new Set([...changedAfter, ...untrackedAfter])].sort()) !== JSON.stringify(overlay.map(x => x.path))) {
  throw new Error('The source file set changed during capture.');
}
verifyReference(destination, lock);
writeJSON(lockFile, lock);
fs.copyFileSync(path.join(destination, 'LICENSE.md'), path.join(root, 'LICENSE.md'));
// Local reuse only: production and packed-consumer tests must not depend on this junction.
fs.symlinkSync(path.join(path.resolve(source), 'node_modules'), path.join(destination, 'node_modules'), 'junction');
fs.symlinkSync(path.join(path.resolve(source), 'node_modules'), path.join(root, 'node_modules'), 'junction');
const version = execFileSync(process.execPath, ['-p', "require('typescript/package.json').version"], { cwd: source, encoding: 'utf8' }).trim();
console.log(JSON.stringify({ commit, files: Object.keys(lock.files).length, overlayFiles: overlay.length, typescript: version }));
