const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'event-profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),150000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'event-saves-'+process.pid)}),win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),results=[];
 const js=async code=>{const r=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(r?.qaError)throw Error(r.qaError);return r;};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  await js(`(()=>{
   __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
   const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
   for(const k of Object.keys(w.meta.attrs))w.meta.attrs[k]=50;
   for(const [i,id]of ['soul_harvest','grave_tide','life_flask','firebolt'].entries())if(__game.devGrantSkill(id,1,i)!==i)throw Error('Cannot grant '+id);
   w.recalcPlayer();p.setAttributes(w.meta.attrs);p.sheet.setBase('mana',1000);p.sheet.setBase('accuracy',5000);p.fillResources();
   p.charges.clear();p.chargeState.clear();p.chargeModCount.clear();p.gainEvents=[];
   let armed=-1,aim={x:p.pos.x+90,y:p.pos.y};
   __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===armed),edge=[...held];armed=-1;return{dx:0,dy:0,aim,held,edge};}});
   const state=()=>({souls:p.charges.get('soul')??0,gauge:p.skills[1].state??null,mana:p.mana,life:p.life,casting:p.casting?.inst.def.id??null,timeScale:w.timeflow.scaleFor(p),fatal:__game.crash().fatal});
   const resume=()=>{for(let n=0;n<300;n++){__game.ui.hideAll();__game.step(1,16.7);if(w.timeflow.scaleFor(p)>0)return;}throw Error('World input remained paused');};
   const ready=slot=>{resume();for(let n=0;n<120;n++){if(p.canUse(p.skills[slot])&&w.skillUsable(p,p.skills[slot]))return;__game.step(1,16.7);}throw Error('Not ready: '+slot+' '+JSON.stringify(state()));};
   window.resourceEventQA={state,step:n=>{__game.step(n,16.7);return state();},press:slot=>{ready(slot);armed=slot;__game.step(1,16.7);return state();},
    kill:()=>{ready(3);const z=w.createMonster('zombie',1,'enemy');z.pos={x:p.pos.x+90,y:p.pos.y};z.xpValue=0;z.sheet.setBase('life',1);z.sheet.setBase('moveSpeed',0);z.fillResources();w.actors.push(z);aim={...z.pos};armed=3;
     for(let n=0;n<180;n++){__game.step(1,16.7);if(z.dead)return{...state(),victimDead:true,victimId:z.id};}throw Error('Ordinary firebolt input did not kill fixture: '+JSON.stringify({state:state(),target:{life:z.life,pos:z.pos,dead:z.dead},hero:p.pos}));},
   };
  })()`);
  const empty=await js('resourceEventQA.state()');assert.equal(empty.souls,0);assert.equal(empty.gauge?.gauge??0,0);results.push({stage:'empty-banks',...empty});
  for(let i=1;i<=3;i++){
   const r=await js('resourceEventQA.kill()');assert.equal(r.victimDead,true);assert.equal(r.souls,i);assert.equal(r.gauge.gauge,i);assert.equal(r.fatal,null);results.push({stage:'credited-projectile-kill-'+i,...r});
  }
  // The death can commit after this tick's paint; render the resulting bank.
  await js('resourceEventQA.step(2)');
  fs.writeFileSync(path.join(dir,'resource-event-fed.png'),(await win.webContents.capturePage()).toPNG());
  const partial=await js('resourceEventQA.press(1)');assert.equal(partial.gauge.gauge,0);assert.equal(partial.gauge.gaugePower,.25);assert(partial.gauge.gaugeLock>11);results.push({stage:'feed-funded-partial-press',...partial});
  const locked=await js('resourceEventQA.kill()');assert(locked.gauge.gaugeLock>0);assert.equal(locked.gauge.gauge,0);results.push({stage:'credited-kill-during-lockout',...locked});
  await js('resourceEventQA.step(900)');const open=await js('resourceEventQA.kill()');assert.equal(open.gauge.gauge,1);assert.equal(open.fatal,null);results.push({stage:'credited-kill-after-lockout',...open});
  await js('resourceEventQA.step(2)');
  fs.writeFileSync(path.join(dir,'resource-event-ui.png'),(await win.webContents.capturePage()).toPNG());
  console.log('PASS: rendered ordinary firebolt input credits actual kills, feeds resource banks, pays a partial gauge and preserves lockout');
 }finally{
  fs.writeFileSync(path.join(dir,'resource-event-ui.json'),JSON.stringify(results,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();
 }
}).catch(error=>{console.error(error);app.exit(1);});
