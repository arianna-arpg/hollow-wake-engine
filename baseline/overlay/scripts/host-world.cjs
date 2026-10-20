// Host the same continuous surface as Play World, with a local-only front door.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execFile } = require('node:child_process');
const http = require('node:http');
const branch = 'codex/seamless-world-foundation';
const project = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
// The simulation installs a browser fetch shim; use actual Node HTTP here.
const read = url => new Promise((resolve, reject) => {
  const request = http.get(url, response => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => { body += chunk; });
    response.on('end', () => resolve({ code: response.statusCode, body }));
    response.on('error', reject);
  });
  request.setTimeout(10000, () => request.destroy(new Error('Local host did not respond')));
  request.on('error', reject);
});

async function main() {
  const at = dir => execFileSync('git', ['-C', dir, 'branch', '--show-current'],
    { encoding: 'utf8', windowsHide: true }).trim();
  const candidate = at(project) === branch ? project : path.join(project, '.claude', 'ownership.playable-foundation');
  if (!fs.existsSync(path.join(candidate, 'server', 'nativeShardHost.ts')) || at(candidate) !== branch) {
    throw new Error('Restore the ' + branch + ' checkout before hosting. See PLAYTEST.md.');
  }
  if (!fs.existsSync(path.join(candidate, 'dist', 'index.html'))) {
    throw new Error('Open Play World.cmd once to prepare the current client, then host again.');
  }
  process.chdir(candidate);
  require('tsx/cjs');
  const { ShardHost } = require(path.join(candidate, 'server', 'shardHost.ts'));
  const shard = new ShardHost({ worldmass: true, open: process.argv.includes('--open'), ...(check ? { seed: 1231 } : {}), name: 'Hollow Wake - Unbroken Wilds',
    saveDir: check ? null : path.join(candidate, 'saves', 'hosted-seamless-playtest') });
  let closing = false;
  const close = async (code = 0, persist = true) => {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => process.exit(code || 3), 8000);
    timeout.unref();
    try { await shard.stop({ persist }); }
    catch (error) { console.error(error); code ||= 3; }
    clearTimeout(timeout);
    process.exitCode = code;
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.once(signal, () => { console.log('Saving and closing the world...'); void close(); });
  }
  shard.onBroken = () => { void close(2, false); };
  try {
    await shard.ready();
    const port = await shard.listen(check ? 0 : 8791, '127.0.0.1');
    shard.net.clientDir = path.join(candidate, 'dist');
    if (check) shard.status(); // expose a failed status read instead of polling an empty response
    shard.start();
    const url = 'http://127.0.0.1:' + port + '/';
    console.log('Local seamless world is ready: ' + url);
    console.log('Keep this window open. Press Ctrl+C here to save and stop.');
    if (check) {
      let status;
      for (let attempt = 0; attempt < 100; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        status = JSON.parse((await read(url + 'status')).body);
        if (status && status.ticks > 0) break;
      }
      if (!status) throw new Error('Host status unavailable: ' + JSON.stringify(shard.status()));
      if (status.world !== 'the Unbroken Wilds' || status.zone !== 'worldmass_expedition' || status.broken || status.faults !== 0) {
        throw new Error('Unexpected host state: ' + JSON.stringify(status));
      }
      const client = await read(url);
      if (client.code !== 200 || !client.body.includes('start-menu')) throw new Error('Game client was not served');
      console.log('HOST PLAYTEST CHECK PASS: continuous world, no faults, client served');
      await close(0, false);
    } else if (!process.argv.includes('--no-open')) {
      execFile('powershell.exe', ['-NoProfile', '-Command', "Start-Process '" + url + "'"],
        { windowsHide: true }, error => { if (error) console.error('Open the address above in your browser. ' + error.message); });
    }
  } catch (error) {
    await close(1, false);
    throw error;
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
