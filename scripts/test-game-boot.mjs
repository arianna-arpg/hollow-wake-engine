// Run the original npm-smoke entry with only its install/profile/save locations isolated.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root, sha256, listFiles, writeJSON } from './reference-utils.mjs';
const argument = name => { const index = process.argv.indexOf(name); assert.ok(index >= 0 && process.argv[index + 1], `${name} required`); return path.resolve(process.argv[index + 1]); };
const game = argument('--game'), dist = argument('--dist'), electron = argument('--electron');
assert.ok(fs.existsSync(path.join(dist, 'index.html')));
const snapshot = () => Object.fromEntries(listFiles(path.join(game, 'launcher')).map(file => [file, sha256(fs.readFileSync(path.join(game, 'launcher', file)))]));
const before = snapshot(), output = fs.mkdtempSync(path.join(root, '.artifacts/game-boot-'));
fs.cpSync(path.join(game, 'launcher'), path.join(output, 'launcher'), { recursive: true, errorOnExist: true, force: false });
fs.cpSync(dist, path.join(output, 'dist'), { recursive: true, errorOnExist: true, force: false });
fs.copyFileSync(path.join(game, 'launcher.config.json'), path.join(output, 'launcher.config.json'));
const pkg = JSON.parse(fs.readFileSync(path.join(game, 'package.json')));
assert.equal(pkg.scripts.smoke, 'electron . --smoke-test=game');
writeJSON(path.join(output, 'package.json'), { ...pkg, main: 'isolated-smoke.cjs' });
fs.writeFileSync(path.join(output, 'isolated-smoke.cjs'), "const {app}=require('electron'); const path=require('node:path'); app.setPath('userData',path.join(__dirname,'profile')); app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu'); require('./launcher/main.cjs');\n");
let passed = false;
try {
  const text = execFileSync(electron, [output, '--smoke-test=game'], { cwd: output, encoding: 'utf8', stdio: 'pipe', windowsHide: true, timeout: 120000 });
  fs.writeFileSync(path.join(output, 'smoke.txt'), text);
  assert.ok(text.includes('SMOKE game OK'), 'Original launcher smoke must report success');
  assert.deepEqual(snapshot(), before, 'Launcher source changed');
  passed = true;
  console.log(text);
} catch (error) { fs.writeFileSync(path.join(output, 'smoke.txt'), String(error.stdout ?? '') + '\n' + String(error.stderr ?? error)); throw error; }
finally {
  const report = { game, dist, output, passed, launcherSha256: before, scope: 'Original game smoke assertions in an isolated install; no source or real save changes' };
  writeJSON(path.join(output, 'verification.json'), report);
  writeJSON(path.join(root, '.artifacts/game-boot-verification.json'), report);
}
