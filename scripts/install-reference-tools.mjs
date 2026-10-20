import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, verifyReference } from './reference-utils.mjs';

const reference = path.join(root, '.reference');
const tooling = path.join(root, 'reference/tooling');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'), 'utf8'));
verifyReference(reference, lock);
const originalLock = JSON.parse(fs.readFileSync(path.join(reference, 'package-lock.json'), 'utf8'));
const tools = JSON.parse(fs.readFileSync(path.join(tooling, 'package.json'), 'utf8')).devDependencies;
for (const [id, version] of Object.entries(tools)) {
  if (originalLock.packages[`node_modules/${id}`]?.version !== version) throw new Error(`Reference tool version changed: ${id}`);
}
const modules = path.join(reference, 'node_modules');
const installed = path.join(tooling, 'node_modules');
if (fs.existsSync(modules) && (!fs.existsSync(installed) || fs.realpathSync(modules) !== fs.realpathSync(installed))) {
  throw new Error('Reference has unrelated node_modules; preserve it and use a fresh checkout for isolated tool installation.');
}
const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
execFileSync(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund',
  '--cache', path.join(root, '.cache/npm')], { cwd: tooling, stdio: 'inherit' });
if (!fs.existsSync(modules)) fs.symlinkSync(installed, modules, process.platform === 'win32' ? 'junction' : 'dir');
verifyReference(reference, lock);
console.log('Isolated reference tools installed at the exact top-level versions in the original lock; source bytes unchanged.');
