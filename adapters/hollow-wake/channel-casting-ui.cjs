const {app,BrowserWindow}=require('electron'),{buildSync}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'channel-profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),180000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'channel-saves-'+process.pid)}),win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),results=[];
 const js=async code=>{const r=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(r?.qaError)throw Error(r.qaError);return r;};
 const capture=async name=>{await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  const data=buildSync({stdin:{contents:"export {SUPPORTS} from './data/supports';",resolveDir:path.resolve(__dirname,'../src'),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'channelData'}).outputFiles[0].text;
  await js(`${data}\nwindow.channelData=channelData;void 0;`);
  await js(`(()=>{
   __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
   const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
   for(const k of Object.keys(w.meta.attrs))w.meta.attrs[k]=50;
   for(const [slot,id]of ['arcane_missiles','surgewind','kindled_ruin','firebolt'].entries())if(__game.devGrantSkill(id,1,slot)!==slot)throw Error('Cannot grant '+id);
   const gem=w.grantSupportGemItem(w.localSeat,{def:channelData.SUPPORTS.gathered_casting,level:1});
   if(!gem||!w.socketSupport(gem.uid,'firebolt'))throw Error('Cannot socket Gathered Casting');
   w.recalcPlayer();p.setAttributes(w.meta.attrs);p.sheet.setBase('mana',1000);p.sheet.setBase('manaRegen',0);p.sheet.setBase('lifeRegen',0);p.sheet.setBase('poise',0);p.fillResources();
   let holding=-1,edge=-1;const aim={x:p.pos.x+120,y:p.pos.y};
   __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===holding),pressed=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim,held,edge:pressed};}});
   const payments=[],executions=[],finishes=[],pay=w.paySkillCost.bind(w),execute=w.executeSkill.bind(w),trigger=w.rollTriggers.bind(w);
   w.paySkillCost=(actor,inst,cost)=>{const before={mana:actor.mana,life:actor.life};const result=pay(actor,inst,cost);if(actor===p)payments.push({skill:inst.def.id,cost:{...cost},before,after:{mana:actor.mana,life:actor.life}});return result;};
   w.executeSkill=(actor,inst,at,opts)=>{if(actor===p)executions.push({skill:inst.def.id,mult:opts?.dmgMult??1,active:!!p.casting,recovery:p.useLock});return execute(actor,inst,at,opts);};
   w.rollTriggers=(actor,on,context)=>{if(actor===p&&on==='channelFinish')finishes.push(context.sourceInst.def.id);return trigger(actor,on,context);};
   const state=()=>({mana:p.mana,life:p.life,cast:p.casting?{skill:p.casting.inst.def.id,mode:p.casting.mode,held:p.casting.held,time:p.casting.channelTime,total:p.casting.total,baseMult:p.casting.baseMult,hitCap:!!p.casting.hitCap}:null,
    brims:[...(p.brims??[])].map(([id,b])=>({id,fill:b.fill})),payments:[...payments],executions:[...executions],finishes:[...finishes],fatal:__game.crash().fatal});
   const step=n=>{__game.step(n,16.7);return state();};
   const ready=slot=>{holding=-1;for(let n=0;n<1500;n++){__game.ui.hideAll();if(w.timeflow.scaleFor(p)>0&&p.canAct()&&w.skillUsable(p,p.skills[slot]))return;step(1);}throw Error('Not ready: '+JSON.stringify(state()));};
   window.channelQA={state,step,press:slot=>{ready(slot);holding=slot;edge=slot;return step(1);},release:()=>{holding=-1;return step(1);},
    waitPulse:(skill,n)=>{for(let i=0;i<600;i++){if(executions.filter(e=>e.skill===skill).length>=n)return state();step(1);}throw Error('Pulse not delivered: '+JSON.stringify(state()));},
    waitFill:(skill,fill)=>{for(let i=0;i<900;i++){if((p.brims?.get(skill)?.fill??0)>=fill)return state();step(1);}throw Error('Brim not earned: '+JSON.stringify(state()));},
    waitEnd:()=>{for(let i=0;i<900;i++){if(!p.casting){holding=-1;return state();}step(1);}throw Error('Cap not completed: '+JSON.stringify(state()));},
    dry:()=>{p.mana=0;return step(30);},refill:()=>{p.mana=1000;return state();},
    stun:()=>{p.applyStatus('stun',0,1,'channel-ui');if(!p.isStunned())throw Error('Stun refused');holding=-1;return step(1);},
   };
  })()`);
  await js('channelQA.step(180)');
  const press=await js('channelQA.press(0)');assert.equal(press.cast?.mode,'channel');assert.equal(press.payments.length,0);results.push({stage:'native-pressed-before-windup',...press});
  const pulses=await js("channelQA.waitPulse('arcane_missiles',2)");assert.equal(pulses.payments.length,2);assert(pulses.mana<press.mana);assert(pulses.executions.every(e=>e.active));results.push({stage:'two-earned-paid-pulses',...pulses});
  await capture('channel-pulses');const ended=await js('channelQA.release()');assert.equal(ended.cast,null);assert.equal(ended.payments.length,pulses.payments.length);results.push({stage:'pulse-channel-released',...ended});
  await js('channelQA.press(1)');const bank=await js("channelQA.waitFill('surgewind',.55)");assert.equal(bank.executions.filter(e=>e.skill==='surgewind').length,0);results.push({stage:'earned-persistent-brim',...bank});await capture('channel-brim');
  const full=await js("channelQA.waitFill('surgewind',1)");assert.equal(full.finishes.filter(s=>s==='surgewind').length,1);
  const payoff=await js('channelQA.release()');assert.equal(payoff.cast,null);assert.equal(payoff.executions.filter(e=>e.skill==='surgewind').length,1);assert.equal(payoff.executions.at(-1).active,false);assert((payoff.brims.find(b=>b.id==='surgewind')?.fill??0)===0);results.push({stage:'full-brim-completed-and-spent',...payoff});
  await js('channelQA.press(2)');const capped=await js('channelQA.waitEnd()');assert.equal(capped.finishes.filter(s=>s==='kindled_ruin').length,1);assert.equal(capped.executions.filter(e=>e.skill==='kindled_ruin').length,1);assert.equal(capped.executions.at(-1).active,false);results.push({stage:'native-cap-forced-payoff',...capped});
  await js('channelQA.press(3)');const gathered=await js("channelQA.waitFill('firebolt',.4)");assert.equal(gathered.cast?.mode,'channel');assert.equal(gathered.executions.filter(e=>e.skill==='firebolt').length,0);results.push({stage:'socketed-gather-bank',...gathered});await capture('channel-gather');
  const dry=await js('channelQA.dry()');assert.equal(dry.payments.length,gathered.payments.length);assert.equal(dry.executions.filter(e=>e.skill==='firebolt').length,0);results.push({stage:'held-input-without-pulse-funding',...dry});
  const spent=await js('channelQA.release()');assert.equal(spent.cast,null);assert.equal(spent.executions.filter(e=>e.skill==='firebolt').length,1);assert.equal(spent.executions.at(-1).active,false);results.push({stage:'bank-released-after-dry-hold',...spent});
  await js('channelQA.refill()');await js('channelQA.press(2)');await js('channelQA.step(15)');const cancelled=await js('channelQA.stun()');assert.equal(cancelled.cast,null);assert.equal(cancelled.executions.filter(e=>e.skill==='kindled_ruin').length,1);assert.equal(cancelled.finishes.filter(s=>s==='kindled_ruin').length,1);assert.equal(cancelled.fatal,null);results.push({stage:'stun-denies-second-cap-payoff',...cancelled});
  console.log('PASS: rendered native channels, earned pulse payments, full brim, capped release, Gathered Casting, dry hold and stun through ordinary input polling');
 }finally{fs.writeFileSync(path.join(dir,'channel-casting-ui.json'),JSON.stringify(results,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
