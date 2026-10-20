// Run after the adventure-region probe and a production build. Isolated, hidden.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { startGameServer } = require('../launcher/server.cjs');
const dir = path.join(__dirname, 'reports');
const fixtures = JSON.parse(fs.readFileSync(path.join(dir, 'adventure-fixtures.json'), 'utf8'));
app.setPath('userData', path.join(dir, 'adventure-ui-profile-' + process.pid));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const timer = setTimeout(() => app.exit(1), 90000);
  const server = await startGameServer({ root: path.resolve(__dirname, '../dist'), savesDir: path.join(dir, 'adventure-ui-saves-' + process.pid) });
  const win = new BrowserWindow({ show: false, width: 1400, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  try {
    await win.loadURL(server.url);
    const setup = await win.webContents.executeJavaScript(`(() => {
      Object.defineProperty(navigator, 'getGamepads', { value: () => [] });
      __game.account().ledger.prologue_lived = 1;
      __game.devStartRun('warrior'); __game.ui.hideAll();
      const w = __game.world(); w.player.level = 10;
      const fixture = ${JSON.stringify(fixtures[0])};
      for (const z of fixture) w.zoneMap[z.id] = z;
      const root = fixture.find(z => z.id === z.complex.root);
      w.loadZone(root.id); w.update = () => {};
      const board = w.bountyBoardsHere().find(b => b.id === root.id);
      if (!board) throw Error('missing local board');
      Object.assign(w.player.pos, board.pos);
      w.armBountyBoard(root.id);
      __game.ui.showBounties(undefined, root.id); __game.step(2);
      return { board: root.id, offers: w.bountyOffers.filter(p => p.boardId === root.id).map(p => p.kind) };
    })()`);
    assert(setup.offers.includes('passage'));
    for (const [width, height] of [[1400,1000], [1000,720]]) {
      win.setContentSize(width, height);
      await new Promise(r => setTimeout(r, 250));
      const result = await win.webContents.executeJavaScript(`(() => {
        const p = document.getElementById('bounty-menu'), r = p.getBoundingClientRect();
        return { text: p.innerText, rect: [r.x,r.y,r.width,r.height], scroll: p.scrollWidth, client: p.clientWidth };
      })()`);
      assert(result.text.includes('Open: The buried parish'));
      assert(result.text.includes('Return to this board'));
      assert(result.rect[0] >= -1 && result.rect[0] + result.rect[2] <= width + 1);
      assert(result.scroll <= result.client + 1);
      fs.writeFileSync(path.join(dir, 'adventure-board-' + width + '.png'), (await win.webContents.capturePage()).toPNG());
      fs.writeFileSync(path.join(dir, 'adventure-board-' + width + '.json'), JSON.stringify(result, null, 2));
    }
    win.setContentSize(1400, 1000);
    for (const [index, stage] of [[0, 'market'], [4, 'crypts'], [2, 'groves'], [3, 'pass']]) {
      await win.webContents.executeJavaScript(`(() => {
        __game.ui.hideAll();
        const w = __game.world(), fixture = ${JSON.stringify(fixtures[index])};
        for (const z of fixture) w.zoneMap[z.id] = z;
        const zone = fixture.find(z => z.complex.stage === ${JSON.stringify(stage)});
        w.loadZone(zone.id);
        const d = zone.locale.districts.find(d => d.id !== zone.locale.entrance);
        if (d) Object.assign(w.player.pos, { x: d.at[0] * zone.size.w, y: d.at[1] * zone.size.h });
        __game.step(2);
      })()`);
      await new Promise(r => setTimeout(r, 300));
      fs.writeFileSync(path.join(dir, 'adventure-' + stage + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    assert.deepEqual(errors, []);
    console.log('PASS local region board at two resolutions, commission copy, four rendered terrain families, no browser errors');
  } finally { clearTimeout(timer); win.destroy(); server.server.close(); app.quit(); }
}).catch(e => { console.error(e); app.exit(1); });
