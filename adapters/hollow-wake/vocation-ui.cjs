// Replay the visible offer and the Inventory passive-tree entry in an isolated game.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startGameServer}=require('../launcher/server.cjs');
const reports=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(reports,'profile'));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
  const server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(reports,'saves')});
  const win=new BrowserWindow({show:false,width:1400,height:1000,webPreferences:{offscreen:true,backgroundThrottling:false}});
  const timeout=setTimeout(()=>app.exit(1),120000);
  try{
    await win.loadURL(server.url);
    const result=await win.webContents.executeJavaScript(`(()=>{
      __game.account().ledger.prologue_lived=1;
      __game.devStartRun('warrior');const w=__game.world(),ui=__game.ui,hero=w.player;
      ui.hideAll();w.loadZone('lastlight');hero.invulnerable=true;hero.level=60;
      w.account.ledger.odyssey_stage_1=1;
      const giver=new hero.constructor('QA quartermaster','player',{...hero.pos});
      giver.defId='townsfolk_questgiver';giver.tier=hero.tier;w.actors.push(giver);
      const quest='voc_warbringer_1',root='voc_warbringer_root';
      const selector='.tree-node[data-node="'+root+'"]';
      function openTree(){
        ui.hideAll();ui.toggleInventory();
        const flap=document.querySelector('#inventory button[data-passiveflap]')??document.querySelector('button[data-passiveflap]');
        if(!flap)throw Error('Missing Inventory passive-tree button');
        flap.click();return document.querySelector('#passive-tree '+selector);
      }
      const before=openTree()===null;ui.hideAll();ui.showVocationMenu();
      const menu=document.getElementById('vocation-menu'),card=menu.querySelector('button[data-vocation-quest="'+quest+'"]');
      if(!card)throw Error('Missing Warbringer offer: '+menu.innerText);
      const label=card.textContent, title=card.closest('.skill-entry').querySelector('.name').textContent.trim();
      card.click();
      const active=w.activeQuests.filter(q=>q.questId===quest).length,closed=menu.classList.contains('hidden');
      // The independent chain oracle covers payout. Here the real public grant
      // isolates what the inventory and passive tree display after that payout.
      const granted=w.grantVocation('warbringer'),second=w.grantVocation('warbringer');
      const node=openTree(),allocated=node?.classList.contains('allocated')??false;
      return {before,label,title,active,closed,granted,second,treeNode:node?.dataset.node??null,allocated,
        character:[...w.meta.vocations],run:w.ledger.vocation_unlocked_warbringer,account:w.account.ledger.vocation_unlocked_warbringer,
        fatal:__game.crash().fatal};
    })()`);
    fs.writeFileSync(path.join(reports,'observations.json'),JSON.stringify(result,null,2)+'\n');
    assert.deepEqual([result.before,result.active,result.closed,result.granted,result.second,result.treeNode,result.allocated,result.run,result.account,result.fatal],
      [true,1,true,true,false,'voc_warbringer_root',true,1,1,null]);
    assert.deepEqual(result.character,['warbringer']);assert(result.title.includes('Warbringer'));assert(result.label.trim().length>0);
    console.log('PASS: quartermaster card, real menu action, Inventory flap and allocated vocation root');
  }finally{clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
