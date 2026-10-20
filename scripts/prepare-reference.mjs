import fs from 'node:fs';
import path from 'node:path';
import { root, materialize, verifyReference } from './reference-utils.mjs';

const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'), 'utf8'));
const destination = path.join(root, '.reference');
if (fs.existsSync(destination)) {
  verifyReference(destination, lock);
  console.log('Existing reference matches every pinned source hash.');
} else {
  const source = process.argv[2];
  materialize(source, lock, destination);
  verifyReference(destination, lock);
  console.log('Reference reconstructed and all hashes verified. Run npm ci --ignore-scripts in .reference before reference:verify.');
}
