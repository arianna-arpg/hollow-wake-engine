const {app,BrowserWindow}=require('electron'),{buildSync}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'charged-profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),150000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'charged-saves-'+process.pid)}),win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),results=[];
 const js=async code=>{const r=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(r?.qaError)throw Error(r.qaError);return r;};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  const data=buildSync({stdin:{contents:"export {SUPPORTS} from './data/supports';",resolveDir:path.resolve(__dirname,'../src'),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'chargedData'}).outputFiles[0].text;
  await js(`${data}\nwindow.chargedData=chargedData;void 0;`);
  await js(`(()=>{
   __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
   const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
   for(const k of Object.keys(w.meta.attrs))w.meta.attrs[k]=50;
   for(const [slot,id]of ['lightning_blast','firebolt'].entries())if(__game.devGrantSkill(id,1,slot)!==slot)throw Error('Cannot grant '+id);
   const gem=w.grantSupportGemItem(w.localSeat,{def:chargedData.SUPPORTS.overcharge,level:1});
   if(!gem||!w.socketSupport(gem.uid,'firebolt'))throw Error('Cannot socket actual Overcharge support');
   w.recalcPlayer();p.setAttributes(w.meta.attrs);p.sheet.setBase('mana',1000);p.sheet.setBase('manaRegen',0);p.sheet.setBase('lifeRegen',0);p.sheet.setBase('poise',0);p.fillResources();
   let holding=-1,edge=-1;const aim={x:p.pos.x+120,y:p.pos.y};
   __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===holding),pressed=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim,held,edge:pressed};}});
   const payments=[],executions=[],pay=w.paySkillCost.bind(w),execute=w.executeSkill.bind(w);
   w.paySkillCost=(actor,inst,cost)=>{const before={mana:actor.mana,life:actor.life};const result=pay(actor,inst,cost);if(actor===p)payments.push({skill:inst.def.id,cost:{...cost},before,after:{mana:actor.mana,life:actor.life}});return result;};
   w.executeSkill=(actor,inst,at,opts)=>{if(actor===p)executions.push({skill:inst.def.id,mult:opts?.dmgMult??1,active:!!p.casting,recovery:p.useLock});return execute(actor,inst,at,opts);};
   const state=()=>({mana:p.mana,life:p.life,cast:p.casting?{skill:p.casting.inst.def.id,mode:p.casting.mode,elapsed:p.casting.elapsed,total:p.casting.total,stage:p.casting.stage??0,baseMult:p.casting.baseMult}:null,payments:[...payments],executions:[...executions],fatal:__game.crash().fatal});
   const resume=()=>{for(let n=0;n<300;n++){__game.ui.hideAll();__game.step(1,16.7);if(w.timeflow.scaleFor(p)>0)return;}throw Error('World input remained paused');};
   const ready=slot=>{resume();for(let n=0;n<300;n++){if(p.canUse(p.skills[slot])&&w.skillUsable(p,p.skills[slot]))return;__game.step(1,16.7);}throw Error('Cast not ready: '+JSON.stringify(state()));};
   window.chargedQA={state,step:n=>{__game.step(n,16.7);return state();},
    press:slot=>{ready(slot);holding=slot;edge=slot;__game.step(1,16.7);return state();},
    release:()=>{holding=-1;__game.step(1,16.7);return state();},
    waitStage:n=>{for(let i=0;i<360;i++){if(p.casting?.stage===n)return state();__game.step(1,16.7);}throw Error('Stage not earned: '+JSON.stringify(state()));},
    dry:()=>{p.mana=0;for(let i=0;i<360;i++){__game.step(1,16.7);if(p.casting&&p.casting.elapsed===p.casting.total)return state();}throw Error('Unaffordable stage did not wait');},
    refill:()=>{p.mana=1000;return state();},
    stun:()=>{p.applyStatus('stun',0,1,'charged-ui');if(!p.isStunned())throw Error('Stun fixture refused');__game.step(1,16.7);holding=-1;return state();},
   };
  })()`);
  // Let the native arrival presentation finish so the held bar is visible.
  await js('chargedQA.step(180)');
  const start=await js('chargedQA.press(0)');assert.equal(start.cast?.mode,'charge');assert.equal(start.payments.length,1);assert.equal(start.executions.length,0);results.push({stage:'charge-pressed',...start});
  await js('chargedQA.step(30)');
  await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(dir,'charged-casting-held.png'),(await win.webContents.capturePage()).toPNG());
  const held=await js('chargedQA.state()');assert(held.cast.elapsed>0&&held.cast.elapsed<held.cast.total);results.push({stage:'charge-held',...held});
  const released=await js('chargedQA.release()');assert.equal(released.cast,null);assert.equal(released.executions.length,1);assert.equal(released.executions[0].active,false);
  const expected=(.5+(2.4-.5)*(held.cast.elapsed/held.cast.total))*held.cast.baseMult;
  assert(Math.abs(released.executions[0].mult-expected)<1e-10);results.push({stage:'charge-released',...released});
  const staged=await js('chargedQA.press(1)');assert.equal(staged.cast?.mode,'overcharge');assert.equal(staged.cast.stage,0);results.push({stage:'overcharge-pressed',...staged});
  const earned=await js('chargedQA.waitStage(2)');assert.equal(earned.payments.length,4);assert.equal(earned.executions.length,1);results.push({stage:'two-paid-stages',...earned});
  await js('chargedQA.step(2)');await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(dir,'charged-casting-stages.png'),(await win.webContents.capturePage()).toPNG());
  const dry=await js('chargedQA.dry()');assert.equal(dry.cast.stage,2);assert.equal(dry.payments.length,4);results.push({stage:'unaffordable-stage-waits',...dry});
  await js('chargedQA.refill()');const full=await js('chargedQA.waitStage(3)');assert.equal(full.payments.length,5);results.push({stage:'resumed-third-stage',...full});
  const payoff=await js('chargedQA.release()');assert.equal(payoff.cast,null);assert.equal(payoff.executions.length,2);assert.equal(payoff.executions[1].active,false);assert(Math.abs(payoff.executions[1].mult-2.2*full.cast.baseMult)<1e-10);results.push({stage:'staged-payoff',...payoff});
  await js('chargedQA.press(1)');const interrupted=await js('chargedQA.waitStage(1)');const cancelled=await js('chargedQA.stun()');assert.equal(cancelled.cast,null);assert.equal(cancelled.executions.length,2);assert.equal(cancelled.payments.length,interrupted.payments.length);assert.equal(cancelled.fatal,null);results.push({stage:'stun-keeps-payment-denies-payoff',...cancelled});
  await js('chargedQA.step(2)');await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(dir,'charged-casting-ui.png'),(await win.webContents.capturePage()).toPNG());
  console.log('PASS: rendered ordinary input holds/releases Charge and Overcharge, pays earned stages, waits when dry, resumes and respects stun');
 }finally{
  fs.writeFileSync(path.join(dir,'charged-casting-ui.json'),JSON.stringify(results,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();
 }
}).catch(error=>{console.error(error);app.exit(1);});
