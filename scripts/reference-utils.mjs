import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const selectedPaths = [
  'src', 'balance', 'scripts', 'launcher',
  'package.json', 'package-lock.json', 'tsconfig.json',
  'tsconfig.launcher.json', 'tsconfig.sim.json', 'LICENSE.md',
  'AGENTS.md', 'CLAUDE.md', 'CURRENT.md',
];
export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
export const git = (cwd, args) => execFileSync('git', ['-c', `safe.directory=${path.resolve(cwd).replaceAll('\\', '/')}`, '-C', cwd, ...args], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});
export function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
export function listFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${relative}`);
      return entry.isDirectory()
        ? listFiles(path.join(directory, entry.name), relative) : [relative];
    }).sort();
}
export function verifyReference(directory, lock) {
  for (const [file, hash] of Object.entries(lock.files)) {
    const actual = sha256(fs.readFileSync(path.join(directory, file)));
    if (actual !== hash) throw new Error(`Reference differs from pinned bytes: ${file}`);
  }
}
export function materialize(source, lock, destination) {
  if (fs.existsSync(destination)) throw new Error(`Destination already exists: ${destination}`);
  let archive;
  if (!source && lock.sourceArchive) {
    archive = path.join(root, lock.sourceArchive.path);
    if (sha256(fs.readFileSync(archive)) !== lock.sourceArchive.sha256) throw new Error('Source archive hash mismatch');
  } else {
    if (!source) throw new Error('No source checkout or portable archive was supplied');
    archive = path.join(root, '.cache', 'reference.tar');
    fs.mkdirSync(path.dirname(archive), { recursive: true });
    execFileSync('git', ['-c', `safe.directory=${path.resolve(source).replaceAll('\\', '/')}`, '-C', source, 'archive', '--format=tar', `--output=${archive}`,
      lock.commit, '--', ...lock.paths], { stdio: 'inherit' });
  }
  fs.mkdirSync(destination, { recursive: true });
  execFileSync('tar', ['-xf', archive, '-C', destination], { stdio: 'inherit' });
  for (const entry of lock.overlay) {
    const target = path.join(destination, entry.path);
    if (entry.deleted) {
      fs.rmSync(target);
    } else {
      const bytes = fs.readFileSync(path.join(root, 'baseline/overlay', entry.path));
      if (sha256(bytes) !== entry.sha256) throw new Error(`Overlay hash mismatch: ${entry.path}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
  }
}

export function captureArchive(source, lock) {
  const relative = 'baseline/source.tar.gz';
  const file = path.join(root, relative);
  if (fs.existsSync(file)) throw new Error('Source archive already exists');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execFileSync('git', ['-c', `safe.directory=${path.resolve(source).replaceAll('\\', '/')}`, '-C', source,
    'archive', '--format=tar.gz', `--output=${file}`, lock.commit, '--', ...lock.paths], { stdio: 'inherit' });
  const bytes = fs.readFileSync(file);
  return { path: relative, sha256: sha256(bytes), bytes: bytes.length,
    reason: 'Portable committed-source capsule; the pinned local revision need not be reachable from upstream.' };
}
