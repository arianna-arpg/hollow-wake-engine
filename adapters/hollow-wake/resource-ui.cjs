// A rendered resource course driven by the game's ordinary player-intent poll.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;app.setPath('userData',path.join(dir,'resources-profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),120000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'resources-saves-'+process.pid)}),win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),results=[];
 const js=async code=>{const r=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(r?.qaError)throw Error(r.qaError);return r;};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  await js(`(()=>{__game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
   for(const k of Object.keys(w.meta.attrs))w.meta.attrs[k]=50;
   for(const [i,id]of ['life_flask','grave_tide','bloodlust','hush_of_the_wake'].entries())if(__game.devGrantSkill(id,1,i)!==i)throw Error('Cannot grant '+id);
   w.recalcPlayer();p.setAttributes(w.meta.attrs);p.sheet.setBase('mana',1000);p.fillResources();p.skills[0].treeNodes=['red_ferment'];p.charges.clear();p.chargeState.clear();p.chargeModCount.clear();p.gainEvents=[];
   let armed=-1;__game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===armed),edge=[...held];armed=-1;return{dx:0,dy:0,aim:{x:p.pos.x+100,y:p.pos.y},held,edge};}});
   const state=()=>({charges:[...p.charges],life:p.life,maxLife:p.maxLife(),mana:p.mana,maxMana:p.maxMana(),gauge:p.skills[1].state??null,gaugeGate:p.unmetGate(p.skills[1])??null,buffs:[...p.buffs.keys()],draining:p.isChargeDraining('bloodlust'),useLock:p.useLock,reflexLock:p.reflexLock,timeScale:w.timeflow.scaleFor(p),uiBlocking:__game.ui.uiBlocking(),usable:p.skills.slice(0,4).map(i=>({id:i.def.id,actor:p.canUse(i),world:w.skillUsable(p,i),gate:p.unmetGate(i)})),fatal:__game.crash().fatal});
   const resume=()=>{for(let n=0;n<300;n++){__game.ui.hideAll();__game.step(1,16.7);if(w.timeflow.scaleFor(p)>0)return;}throw Error('World input stayed paused: '+JSON.stringify(state()));};
   window.resourceQA={state,press:slot=>{resume();armed=slot;__game.step(1,16.7);return state();},step:n=>{__game.step(n,16.7);return state();},waitReady:slot=>{resume();for(let n=0;n<120;n++){if(p.canUse(p.skills[slot])&&w.skillUsable(p,p.skills[slot]))return state();__game.step(1,16.7);}throw Error('Input never became ready: '+JSON.stringify(state()));}};})()`);
  const empty=await js('resourceQA.press(3)');assert.equal(empty.charges.find(([id])=>id==='wisp')?.[1]??0,0);assert(!empty.buffs.includes('hushed'));results.push({stage:'empty-wisp-refusal',...empty});
  // The real tick renders every frame and advances the owner's resource clocks.
  const banked=await js('resourceQA.step(1500)');assert.equal(banked.charges.find(([id])=>id==='wisp')?.[1],5);assert((banked.charges.find(([id])=>id==='flask_life')?.[1]??0)>0);results.push({stage:'equipped-clocks-bank-resources',...banked});
  await js('__game.world().player.life=__game.world().player.maxLife()/2');
  const hush=await js('resourceQA.press(3)');assert.equal(hush.charges.find(([id])=>id==='wisp')?.[1],0);await js('resourceQA.step(2)');const mended=await js('resourceQA.state()');assert(mended.buffs.includes('hushed'));results.push({stage:'intent-pays-wisp-and-delivers-buff',...mended});
  await js('__game.world().player.life=__game.world().player.maxLife()/4');
  results.push({stage:'wait-for-native-flask-readiness',...await js('resourceQA.waitReady(0)')});
  const flaskBefore=mended.charges.find(([id])=>id==='flask_life')?.[1]??0,drink=await js('resourceQA.press(0)');results.push({stage:'intent-drinks-tree-fed-flask',...drink});assert.equal(drink.charges.find(([id])=>id==='flask_life')?.[1],flaskBefore-1);
  await js('resourceQA.waitReady(2)');const blood=await js('resourceQA.press(2)');assert.equal(blood.draining,true);const before=blood.charges.find(([id])=>id==='bloodlust')?.[1];const burning=await js('resourceQA.step(90)');assert(burning.charges.find(([id])=>id==='bloodlust')?.[1]<before);results.push({stage:'intent-unleashes-draining-bank',...burning});
  // Seed an eligible already-credited feed total, then exercise real input,
  // payment, rendered lockout and the original unmet-gate readout.
  await js('(()=>{const p=__game.world().player;p.skills[1].state={gauge:3};resourceQA.waitReady(1);})()');
  const partial=await js('resourceQA.press(1)');assert.equal(partial.gauge.gauge,0);assert.equal(partial.gauge.gaugePower,.25);assert(partial.gauge.gaugeLock>11);assert(partial.gaugeGate);assert.equal(partial.fatal,null);results.push({stage:'partial-gauge-press-locks-bank',...partial});
  await js('resourceQA.step(2)');fs.writeFileSync(path.join(dir,'resource-ui.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(dir,'resource-ui.json'),JSON.stringify(results,null,2)+'\n');console.log('PASS: rendered player intents preserve resource refusal, regeneration, tree-fed payment, drain and partial gauge lockout');
 }finally{fs.writeFileSync(path.join(dir,'resource-ui-stages.json'),JSON.stringify(results,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
