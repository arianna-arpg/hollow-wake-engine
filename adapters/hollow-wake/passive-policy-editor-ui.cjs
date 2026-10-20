// Actual mounted editor, original World commands and isolated renderer/save directories.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { startGameServer } = require('../launcher/server.cjs');
const dir = process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData', path.join(dir, 'policy-editor-profile-' + process.pid));
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const timeout = setTimeout(() => app.exit(1), 120000);
  const server = await startGameServer({ root: process.env.HOLLOW_WAKE_QA_DIST, savesDir: path.join(dir, 'policy-editor-saves-' + process.pid) });
  const win = new BrowserWindow({ show: false, width: 1400, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const js = async code => {
    const result = await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);
    if (result?.qaError) throw Error(result.qaError); return result;
  };
  const results = [];
  const check = async (name, code, expected) => { const actual = await js(code); assert.deepEqual(actual, expected, name); results.push({ name, actual }); };
  try {
    await win.loadURL(server.url + '?dev=editor');
    await js(`(() => {
      __game.account().ledger.prologue_lived=1;__game.devStartRun('warrior');__game.ui.hideAll();
      const w=__game.world();w.player.invulnerable=true;w.loadZone('lastlight');
      w.player.pos={...w.fonts[0].pos};w.player.tier=w.fonts[0].tier??0;w.meta.passivePoints=10;
      __game.ui.toggleTree();if(!window.__passiveEditor)throw Error('Actual editor did not mount');
      const root=[...w.meta.allocated][0];window.policyEditorQA={w,root};
      window.policyPanel=()=>[...document.body.children].find(el=>[...el.querySelectorAll('b')].some(b=>b.textContent==='Passive Editor'));
      window.policyCreate=()=>{__passiveEditor.createNodeAt(7000,7000);return [...policyPanel().children].find(el=>el.firstElementChild?.textContent==='id').querySelector('b').textContent;};
      window.policyDelete=id=>{__passiveEditor.select(id);[...policyPanel().querySelectorAll('button')].find(b=>b.textContent.includes('Delete Node')).click();};
      policyEditorQA.a=policyCreate();policyEditorQA.b=policyCreate();
    })()`);
    await check('unlinked purchase refused', 'policyEditorQA.w.allocateNode(policyEditorQA.a)', false);
    await check('new link permits purchase', `(() => {const q=policyEditorQA;__passiveEditor.toggleLink(q.root,q.a);return q.w.allocateNode(q.a);})()`, true);
    await check('linked outer purchase', `(() => {const q=policyEditorQA;__passiveEditor.toggleLink(q.a,q.b);return q.w.allocateNode(q.b);})()`, true);
    await check('dependent branch protects refund', 'policyEditorQA.w.refundPassiveNode(policyEditorQA.a)', false);
    await check('outer refund', 'policyEditorQA.w.refundPassiveNode(policyEditorQA.b)', true);
    await check('unlink invalidates compiled adjacency', `(() => {const q=policyEditorQA;__passiveEditor.toggleLink(q.a,q.b);return q.w.allocateNode(q.b);})()`, false);
    await check('relink invalidates compiled adjacency', `(() => {const q=policyEditorQA;__passiveEditor.toggleLink(q.a,q.b);return q.w.allocateNode(q.b);})()`, true);
    await check('deleted saved node protects refund', `(() => {const q=policyEditorQA;policyDelete(q.b);return q.w.refundPassiveNode(q.a);})()`, false);
    await check('host removes retired allocation explicitly', `(() => {const q=policyEditorQA;q.w.meta.allocated.delete(q.b);return q.w.refundPassiveNode(q.a);})()`, true);
    await check('live state remains reusable', 'policyEditorQA.w.allocateNode(policyEditorQA.a)', true);
    await check('deleted class root preserves saved refusal', `(() => {const q=policyEditorQA;policyDelete(q.root);return q.w.refundPassiveNode(q.a);})()`, false);
    await check('no fatal renderer error', '__game.crash().fatal', null);
    fs.writeFileSync(path.join(dir, 'passive-policy-editor-ui.json'), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(dir, 'passive-policy-editor-ui.png'), (await win.webContents.capturePage()).toPNG());
    console.log('PASS: actual editor link, unlink, relink, node deletion and deleted class root preserve policy behavior');
  } finally { clearTimeout(timeout); win.destroy(); server.server.close(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
