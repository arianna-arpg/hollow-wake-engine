import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root, listFiles} from './reference-utils.mjs';

// Expected installed output comes from the source manifest, never the consumer.
// Keep this intentionally narrow: a new packaging rule needs explicit review.
export function packageRuntimeFiles(sourceRoot = root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json')));
  assert(Array.isArray(manifest.files) && manifest.files.includes('dist'));
  const excluded = [];
  for (const entry of manifest.files) {
    if (entry === 'dist') continue;
    const match = /^!dist\/([a-z][a-z0-9-]*)\.\*$/.exec(entry);
    if (match) excluded.push(match[1] + '.');
    else assert(!entry.includes('dist') && !entry.startsWith('!'), 'Unsupported runtime packaging rule: ' + entry);
  }
  const files = listFiles(path.join(sourceRoot, 'dist'));
  for (const prefix of excluded) assert(files.some(file => file.startsWith(prefix)), 'Unbuilt internal module: ' + prefix);
  const published = files.filter(file => !excluded.some(prefix => file.startsWith(prefix)));
  for (const value of Object.values(manifest.exports)) {
    const targets = typeof value === 'string' ? [value] : Object.values(value);
    for (const target of targets) if (target.startsWith('./dist/')) {
      assert(published.includes(target.slice(7)), 'Public export excluded or unbuilt: ' + target);
    }
  }
  return published;
}
