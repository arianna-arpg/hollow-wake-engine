import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {root, sha256} from './reference-utils.mjs';

export const parityDirectory = path.join(root, 'baseline/prototype-parity');
export const parityReference = path.join(root, '.artifacts/parity-reference');

export function sourceGit(directory, args, options = {}) {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG.*)$/i.test(key)) delete env[key];
  return execFileSync('git', ['-c', `safe.directory=${path.resolve(directory).replaceAll('\\', '/')}`, '-C', directory, ...args],
    {env, maxBuffer: 128 * 1024 * 1024, ...options});
}

export function readCommittedSource(directory, commit, paths) {
  assert(/^[a-f0-9]{40}$/.test(commit), 'A full immutable source revision is required');
  const names = sourceGit(directory, ['ls-tree', '-rz', '--name-only', commit, '--', ...paths]).toString().split('\0').filter(Boolean);
  assert(names.every(name => !/[\r\n]/.test(name)), 'Line breaks in source paths are unsupported');
  const stream = sourceGit(directory, ['cat-file', '--batch'], {input: names.map(name => `${commit}:${name}\n`).join('')});
  const files = new Map(); let at = 0;
  for (const name of names) {
    const end = stream.indexOf(10, at), header = stream.toString('utf8', at, end).split(' ');
    assert.equal(header[1], 'blob', name);
    const size = Number(header[2]); assert(Number.isSafeInteger(size) && size >= 0 && end + 2 + size <= stream.length);
    files.set(name, Buffer.from(stream.subarray(end + 1, end + 1 + size))); at = end + 2 + size;
  }
  assert.equal(at, stream.length); return files;
}

export function sourceDifference(previous, files) {
  return [...new Set([...Object.keys(previous), ...files.keys()])].sort().flatMap(file => {
    const bytes = files.get(file), after = bytes && sha256(bytes), before = previous[file];
    return before === after ? [] : [{file, change: !before ? 'added' : !after ? 'deleted' : 'changed',
      beforeSha256: before ?? null, afterSha256: after ?? null, bytes: bytes?.length ?? 0}];
  });
}

// No extraction occurs until every name, byte hash and file-set member is checked.
export function readParitySource(lock = JSON.parse(fs.readFileSync(path.join(parityDirectory, 'source-lock.json')))) {
  const archivePath = path.resolve(root, lock.sourceArchive.path);
  assert.equal(path.dirname(archivePath), parityDirectory);
  const archive = fs.readFileSync(archivePath); assert.equal(sha256(archive), lock.sourceArchive.sha256);
  const tar = gunzipSync(archive), files = new Map();
  for (let at = 0; at + 512 <= tar.length;) {
    if (tar[at] === 0) break;
    const field = (offset, length) => tar.toString('utf8', at + offset, at + offset + length).split('\0')[0];
    const name = [field(345, 155), field(0, 100)].filter(Boolean).join('/');
    const size = parseInt(field(124, 12).trim(), 8) || 0, type = field(156, 1);
    assert(Number.isSafeInteger(size) && size >= 0 && at + 512 + size <= tar.length);
    if (type === '0' || type === '') {
      assert(!name.startsWith('/') && !name.includes('\\') && !name.split('/').some(p => p === '..' || p === '.' || p.includes(':')));
      assert(!files.has(name), 'Duplicate source entry');
      const bytes = Buffer.from(tar.subarray(at + 512, at + 512 + size));
      assert.equal(sha256(bytes), lock.files[name], name); files.set(name, bytes);
    } else assert(['5', 'g'].includes(type), 'Unsupported source archive entry: ' + type);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  assert.deepEqual([...files.keys()].sort(), Object.keys(lock.files).sort()); return {lock, files};
}

export function prepareParityReference() {
  const {lock, files} = readParitySource();
  for (const [name, bytes] of files) {
    const file = path.join(parityReference, name);
    if (fs.existsSync(file)) assert.equal(sha256(fs.readFileSync(file)), lock.files[name], 'Modified parity source: ' + name);
    else {fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, bytes);}
  }
  return {directory: parityReference, lock};
}
