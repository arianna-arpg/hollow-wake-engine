// Exercise the editor mounted by the real game, sharing its actual content registry.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { startGameServer } = require('../launcher/server.cjs');
const dir = process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData', path.join(dir, 'grant-editor-profile-' + process.pid));
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const timeout = setTimeout(() => app.exit(1), 120000);
  const server = await startGameServer({ root: process.env.HOLLOW_WAKE_QA_DIST, savesDir: path.join(dir, 'grant-editor-saves-' + process.pid) });
  const win = new BrowserWindow({ show: false, width: 1400, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const js = async code => {
    const result = await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);
    if (result?.qaError) throw Error(result.qaError); return result;
  };
  const results=[];
  try {
    await win.loadURL(server.url + '?dev=editor');
    const ready = await js(`(() => {
      __game.account().ledger.prologue_lived=1;__game.devStartRun('warrior');__game.ui.hideAll();
      const w=__game.world();w.player.invulnerable=true;__game.ui.toggleTree();
      if(!window.__passiveEditor)throw Error('Actual editor did not mount');
      const id=[...w.meta.allocated][0];window.__passiveEditor.select(id);
      window.grantEditorQA={w,id,base:w.meta.attrs.vitality};
      window.grantEditorPanel=()=>[...document.body.children].find(el=>[...el.querySelectorAll('b')].some(b=>b.textContent==='Passive Editor'));
      window.grantEditorVitality=()=>[...grantEditorPanel().querySelectorAll('input[type=number]')].find(el=>el.previousElementSibling?.textContent==='vit');
      grantEditorQA.original=Number(grantEditorVitality().value);
      return {base:w.meta.attrs.vitality,original:grantEditorQA.original};
    })()`); results.push({stage:'ready',...ready});
    const edited=await js(`(() => {
      const q=grantEditorQA,input=grantEditorVitality();input.value=String(q.original+7);input.dispatchEvent(new Event('change',{bubbles:true}));
      q.w.recalcPlayer();return {vitality:q.w.meta.attrs.vitality,actor:q.w.player.attributeValues.vitality};
    })()`);assert.equal(edited.vitality,ready.base+7);assert.equal(edited.actor,edited.vitality);results.push({stage:'edit',...edited});
    const restored=await js(`(() => {
      const q=grantEditorQA,input=grantEditorVitality();input.value=String(q.original);input.dispatchEvent(new Event('change',{bubbles:true}));
      q.w.recalcPlayer();return q.w.meta.attrs.vitality;
    })()`);assert.equal(restored,ready.base);results.push({stage:'restore',vitality:restored});
    const created=await js(`(() => {
      const q=grantEditorQA;__passiveEditor.createNodeAt(7000,7000);
      const panel=grantEditorPanel(),line=[...panel.children].find(el=>el.firstElementChild?.textContent==='id');
      const id=line.querySelector('b').textContent;q.created=id;q.w.meta.allocated.add(id);
      const input=grantEditorVitality();input.value='11';input.dispatchEvent(new Event('change',{bubbles:true}));
      q.w.recalcPlayer();return {id,vitality:q.w.meta.attrs.vitality};
    })()`);assert.equal(created.vitality,ready.base+11);results.push({stage:'create-and-edit',...created});
    const removed=await js(`(() => {
      const q=grantEditorQA;[...grantEditorPanel().querySelectorAll('button')].find(b=>b.textContent.includes('Delete Node')).click();
      q.w.recalcPlayer();const vitality=q.w.meta.attrs.vitality;q.w.meta.allocated.delete(q.created);
      return {vitality,fatal:__game.crash().fatal};
    })()`);assert.equal(removed.vitality,ready.base);assert.equal(removed.fatal,null);results.push({stage:'delete-retired-selection',...removed});
    fs.writeFileSync(path.join(dir,'passive-grant-editor-ui.json'),JSON.stringify(results,null,2));
    fs.writeFileSync(path.join(dir,'passive-grant-editor-ui.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS: actual mounted editor refreshes grants after edit, restore, creation and deletion');
  } finally {clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
