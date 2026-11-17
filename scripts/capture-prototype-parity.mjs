// Explicit source revision, independent of the October acceptance fixtures.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {parityDirectory, sourceGit, readCommittedSource, sourceDifference, readParitySource} from './prototype-parity-tools.mjs';

const [directory, commit] = process.argv.slice(2);
assert(directory && /^[a-f0-9]{40}$/.test(commit ?? ''), 'Usage: node scripts/capture-prototype-parity.mjs <prototype> <full revision>');
assert(!fs.existsSync(path.join(parityDirectory, 'source-lock.json')), 'Parity source is already pinned');
const previousPath = path.join(root, 'baseline/source-lock.json'), previousBytes = fs.readFileSync(previousPath), previous = JSON.parse(previousBytes);
const files = readCommittedSource(directory, commit, previous.paths);
const changes = sourceDifference(previous.files, files);
const archive = path.join(parityDirectory, 'source.tar.gz');
assert(!fs.existsSync(archive), 'Refusing to replace a source capsule');
fs.mkdirSync(parityDirectory, {recursive: true});
sourceGit(directory, ['archive', '--format=tar.gz', '--output=' + archive, commit, '--', ...previous.paths]);
const archiveBytes = fs.readFileSync(archive);
const lock = {schemaVersion: 1, upstream: previous.upstream, commit,
  sourceDate: sourceGit(directory, ['show', '-s', '--format=%cI', commit]).toString().trim(),
  explanation: 'Explicit committed prototype revision. Working changes stay in their owning checkout. October fixtures remain immutable.',
  previous: {commit: previous.commit, lock: 'baseline/source-lock.json', sha256: sha256(previousBytes), includesFrozenOverlay: true},
  paths: previous.paths, overlay: [], files: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)])),
  sourceArchive: {path: 'baseline/prototype-parity/source.tar.gz', sha256: sha256(archiveBytes), bytes: archiveBytes.length}};
readParitySource(lock);
writeJSON(path.join(parityDirectory, 'source-lock.json'), lock);
const log = sourceGit(directory, ['log', '--no-merges', '--format=%H%x09%cI%x09%s', previous.commit + '..' + commit, '--', ...previous.paths])
  .toString().trim().split('\n').filter(Boolean).map(row => {const [revision, date, ...subject] = row.split('\t'); return {revision, date, subject: subject.join('\t')};});
writeJSON(path.join(parityDirectory, 'audit.json'), {schemaVersion: 1, status: 'classification-in-progress',
  previousSourceLockSha256: sha256(previousBytes), sourceCommit: commit, sourceLockSha256: sha256(JSON.stringify(lock, null, 2) + '\n'),
  scope: 'All captured source paths, including every src/ combat, character, Inventory, presentation and host file. Compare frozen overlay bytes, not only the base Git commit.',
  commits: log, changes});
console.log(JSON.stringify({source: commit, files: files.size, changedFiles: changes.length, commits: log.length, capsuleBytes: archiveBytes.length}));
