import fs from 'node:fs';
import path from 'node:path';

/** Locate the npm CLI for child processes that invoke Node directly. */
export function npmCli() {
  if (process.env.npm_execpath) return process.env.npm_execpath;
  const bin = path.dirname(process.execPath);
  const cli = 'node_modules/npm/bin/npm-cli.js';
  for (const candidate of [path.join(bin, cli), path.resolve(bin, '../lib', cli)]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    const launcher = path.join(directory, 'npm');
    if (!fs.existsSync(launcher)) continue;
    const file = fs.realpathSync(launcher);
    if (path.basename(file) === 'npm-cli.js') return file;
  }
  throw new Error('Cannot locate npm. Run the check through an npm script.');
}
