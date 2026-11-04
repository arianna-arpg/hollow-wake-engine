const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startGameServer}=require('../launcher/server.cjs');
const reports=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(reports,'profile'));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
async function play() {
  const g=window.__game,account=g.account(),ui=g.ui,requireElement=selector=>{
    const el=document.querySelector(selector);if(!el)throw Error('Missing '+selector);return el;
  };
  const wait=async (read,label)=>{for(let i=0;i<160;i++){const result=read();if(result)return result;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out at '+label);};
  await g.hydrated();
  account.ledger.prologue_lived=1;account.ledger.account_deaths=1;
  const openings={warrior:['cleave','carve'],magician:['firebolt','frostbolt'],rogue:['backstab','blowdart']};
  for(const id of Object.keys(openings))account.unlockedClassTiers.add('tier_'+id+'_novice');
  requireElement('#sm-start').click();
  const hub=await wait(()=>g.world().scene?.state.apps?.length&&g.world(),'Mu vessels');
  const row=hub.scene.state.apps.find(r=>r.rank==='awake'&&openings[r.classId]);
  if(!row)throw Error('No starter in the initial Mu hand');
  const vessel=hub.actors.find(a=>a.id===row.id),[base,alt]=openings[row.classId];
  Object.assign(hub.player.pos,vessel.pos);
  for(let i=0;i<240&&!ui.muCardOpen;i++)g.step(1);
  if(!ui.muCardOpen)throw Error('The vessel did not open its class card');
  const chip=()=>requireElement('#mu-card [data-kit-slot="'+base+'"]');
  const original=chip().dataset.skillId;chip().click();requireElement('[data-kit-pick="'+alt+'"]').click();const chosen=chip().dataset.skillId;
  const name=requireElement('#mu-char-name');name.value='  Ember  ';name.dispatchEvent(new Event('input',{bubbles:true}));
  requireElement('#mu-wake').click();
  const world=await wait(()=>g.world()!==hub&&g.world()?.localSeat?.meta?.name==='Ember'&&g.world(),'Wake');
  await wait(()=>!g.loading.active,'finish waking');
  const save=JSON.parse(localStorage.getItem('arpg_character_v1')??'null');if(!save)throw Error('Missing new run save');
  const before=account.unlockedClasses.has('ranger');account.ledger['deed:distant_projectile_hits']=180;
  ui.hideAll();ui.showAccountScreen();
  const pending=account.pendingClassUnlocks.has('ranger'),button=requireElement('[data-class-unlock="class_ranger"]');
  const label=button.textContent.trim();button.click();
  const active=account.unlockedClasses.has('ranger')&&!account.pendingClassUnlocks.has('ranger');
  return {id:row.classId,base,alt,original,chosen,heroClass:world.meta.classDef.id,heroName:world.meta.name,
    gameBar:world.player.skills.map(s=>s?.def.id??null),opening:world.meta.opening,
    savedOpening:save.opening,savedName:save.name,savedIdMatches:save.charId===world.meta.charId&&!!save.charId,
    remembered:account.kitPicks[row.classId],before,pending,label,active,buttonRemoved:!document.querySelector('[data-class-unlock="class_ranger"]'),
    supports:['perfect_draw','wandering_mark'].map(s=>account.unlockedSupports.has(s)),fatal:g.crash().fatal};
}
app.whenReady().then(async()=>{
 const server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(reports,'saves')});
 const win=new BrowserWindow({show:false,width:1400,height:1000,webPreferences:{offscreen:true,backgroundThrottling:false}});
 const timer=setTimeout(()=>app.exit(1),120000);
 try{
  await win.loadURL(server.url);
  const result=await win.webContents.executeJavaScript('('+play.toString()+')()');
  const waitDisk=async(file,predicate)=>{
    for(let i=0;i<160;i++){
      try{const value=JSON.parse(fs.readFileSync(path.join(reports,'saves',file)));if(predicate(value))return value;}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw Error('Missing committed disk state in '+file);
  };
  const account=await waitDisk('save_0.json',a=>a.unlockedClasses.includes('ranger')&&!a.pendingClassUnlocks.includes('ranger'));
  const saved=await waitDisk('save_1.json',s=>s.name==='Ember'&&s.opening.includes(result.alt));
  result.diskPick=account.kitPicks[result.id][result.base];assert.equal(result.diskPick,result.alt);
  await win.loadURL(server.url);
  const resumed=await win.webContents.executeJavaScript(`(async()=>{
    const g=window.__game;await g.hydrated();
    const button=document.getElementById('sm-continue');
    if(!button||button.disabled)throw Error('Disk character was unavailable from Continue');
    button.click();
    for(let i=0;i<160;i++){
      const w=g.world();if(w?.localSeat?.meta?.name==='Ember'&&!g.loading.active)
        return {id:w.meta.charId,opening:w.meta.opening,bar:w.player.skills.map(s=>s?.def.id??null),ranger:g.account().unlockedClasses.has('ranger')&&!g.account().pendingClassUnlocks.has('ranger'),fatal:g.crash().fatal};
      await new Promise(resolve=>setTimeout(resolve,50));
    }throw Error('Continue did not restore the character');
  })()`);
  result.resumedIdMatches=resumed.id===saved.charId;delete resumed.id;result.resumed=resumed;
  assert(result.resumedIdMatches&&resumed.ranger);assert.equal(resumed.fatal,null);assert.deepEqual(resumed.opening,result.opening);assert.deepEqual(resumed.bar,result.gameBar);
  fs.writeFileSync(path.join(reports,'observations.json'),JSON.stringify(result,null,2)+'\n');
  assert.deepEqual([result.heroClass,result.original,result.chosen,result.heroName,result.savedName,result.savedIdMatches,result.before,result.pending,result.active,result.buttonRemoved,result.fatal],
    [result.id,result.base,result.alt,'Ember','Ember',true,false,true,true,true,null]);
  assert(result.label);assert(result.gameBar.includes(result.alt));assert(result.opening.includes(result.alt));assert.deepEqual(result.opening,result.savedOpening);
  assert.equal(result.remembered[result.base],result.alt);assert.deepEqual(result.supports,[true,true]);console.log(result);
 }finally{clearTimeout(timer);win.destroy();server.server.close();app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});
