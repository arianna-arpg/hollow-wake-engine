// Local integration entry point. Reuse the game's launcher, build checks and
// persistence, while explicitly selecting the canonical world branch.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, dialog } = require('electron');

// Explorer/automation can close inherited console pipes. A missing console is
// not a game failure; do not let the stock fatal logger recursively log EPIPE.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', error => {
    if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') throw error;
  });
}

const branch = 'codex/seamless-world-foundation';
const project = path.resolve(__dirname, '..');

try {
  const projectBranch = execFileSync('git', ['-C', project, 'branch', '--show-current'],
    { encoding: 'utf8', windowsHide: true }).trim();
  const candidate = projectBranch === branch ? project : path.join(project, '.claude', 'ownership.playable-foundation');
  if (!fs.existsSync(path.join(candidate, 'launcher', 'main.cjs'))) {
    throw new Error('The world playtest checkout is missing. Restore the existing ' + branch +
      ' branch to ' + candidate + ' before playing. No other build has been opened.');
  }
  const current = execFileSync('git', ['-C', candidate, 'branch', '--show-current'],
    { encoding: 'utf8', windowsHide: true }).trim();
  if (current !== branch) throw new Error('Expected ' + branch + ', found ' + current + '. No other build has been opened.');

  // The stock launcher intentionally resolves repo.branch to a checkout. Its
  // default is main, even when launched from an experimental worktree.
  // A private config prevents that silent redirect and remote update prompts.
  const configPath = path.join(candidate, 'launcher.config.local.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  const revision = execFileSync('git', ['-C', candidate, 'rev-parse', '--short', 'HEAD'],
    { encoding: 'utf8', windowsHide: true }).trim();
  const profile = path.join(candidate, 'saves', 'seamless-playtest-profile');
  fs.mkdirSync(profile, { recursive: true });
  Object.assign(config, {
    repo: { ...config.repo, branch },
    game: { ...config.game, title: 'Hollow Wake - Seamless World (' + revision + ')' },
    updates: { ...config.updates, checkOnLaunch: false, quiet: false },
    paths: { ...config.paths, saves: 'saves/seamless-playtest' },
    dev: { ...config.dev, developer: false, liveSource: false },
    launcher: { ...config.launcher, returnToLauncher: false },
  });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  app.setName('Hollow Wake World Playtest');
  app.setPath('userData', profile);
  // Keep the checkout/revision identity when the game's generic HTML title loads.
  app.on('browser-window-created', (_event, window) => {
    window.on('page-title-updated', event => event.preventDefault());
  });
  process.chdir(candidate);
  process.env.HOLLOW_WAKE_WORLDMASS = '1';
  delete process.env.HOLLOW_WAKE_STORAGE_SCOPE; // real disk saves in the isolated folder
  console.log('World playtest: ' + branch + ' at ' + revision);
  console.log('Saves: ' + path.join(candidate, config.paths.saves));
  require(path.join(candidate, 'launcher', 'main.cjs'));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (!process.argv.some(value => value.startsWith('--smoke-test'))) {
    dialog.showErrorBox('World playtest could not start', message);
  }
  app.exit(1);
}
