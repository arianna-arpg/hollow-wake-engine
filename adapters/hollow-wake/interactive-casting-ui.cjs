const {app,BrowserWindow}=require('electron'),{buildSync}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'interactive-profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),150000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'interactive-saves-'+process.pid)}),win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),results=[];
 const js=async code=>{const r=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(r?.qaError)throw Error(r.qaError);return r;};
 const screenshot=async name=>{await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(dir,name),(await win.webContents.capturePage()).toPNG());};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  const data=buildSync({stdin:{contents:"export {SUPPORTS} from './data/supports';",resolveDir:path.resolve(__dirname,'../src'),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'interactiveData'}).outputFiles[0].text;
  await js(`${data}\nwindow.interactiveData=interactiveData;void 0;`);
  await js(`(()=>{
   __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
   const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
   for(const k of Object.keys(w.meta.attrs))w.meta.attrs[k]=50;
   for(const [slot,id]of ['transfixing_gaze','firebolt'].entries())if(__game.devGrantSkill(id,1,slot)!==slot)throw Error('Cannot grant '+id);
   const gem=w.grantSupportGemItem(w.localSeat,{def:interactiveData.SUPPORTS.perfect_draw,level:1});if(!gem||!w.socketSupport(gem.uid,'firebolt'))throw Error('Cannot socket actual Perfect Draw');
   w.recalcPlayer();p.setAttributes(w.meta.attrs);for(const [id,value]of Object.entries({mana:1000,manaRegen:0,lifeRegen:0,poise:0}))p.sheet.setBase(id,value);p.fillResources();
   const quarry=w.createMonster('zombie',1,'enemy');quarry.pos={x:p.pos.x+50,y:p.pos.y};quarry.tier=p.tier;quarry.brain=undefined;quarry.anchored=true;w.springAmbush(quarry,true);quarry.untargetable=false;quarry.sheet.setBase('life',10000);quarry.sheet.setBase('lifeRegen',0);quarry.fillResources();w.actors.push(quarry);
   let holding=-1,edge=-1;const aim={...quarry.pos};
   __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===holding),pressed=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim,held,edge:pressed};}});
   const payments=[],executions=[],pay=w.paySkillCost.bind(w),execute=w.executeSkill.bind(w);
   w.paySkillCost=(actor,inst,cost)=>{const result=pay(actor,inst,cost);if(actor===p)payments.push({skill:inst.def.id,cost:{...cost},mana:actor.mana,life:actor.life});return result;};
   w.executeSkill=(actor,inst,at,opts)=>{if(actor===p)executions.push({skill:inst.def.id,mult:opts?.dmgMult??1,active:!!p.casting,recovery:p.useLock});return execute(actor,inst,at,opts);};
   const state=()=>({mana:p.mana,life:p.life,cooldowns:[...p.cooldowns],cast:p.casting?{skill:p.casting.inst.def.id,mode:p.casting.mode,elapsed:p.casting.elapsed,total:p.casting.total,focusBroken:p.casting.focusBroken??false,pressUsed:p.casting.pressUsed??false,empowered:p.casting.empowered??1,baseMult:p.casting.baseMult}:null,quarry:{life:quarry.life,seen:quarry.statuses.some(s=>s.id==='seen')},payments:[...payments],executions:[...executions],fatal:__game.crash().fatal});
   const step=n=>{__game.step(n,16.7);return state();};
   const ready=slot=>{holding=-1;for(let n=0;n<1500;n++){__game.ui.hideAll();if(w.timeflow.scaleFor(p)>0&&p.canUse(p.skills[slot])&&w.skillUsable(p,p.skills[slot]))return;step(1);}throw Error('Cast not ready: '+JSON.stringify(state()));};
   window.interactiveQA={state,step,
    press:slot=>{ready(slot);aim.x=quarry.pos.x;aim.y=quarry.pos.y;holding=slot;edge=slot;return step(1);},
    fraction:value=>{for(let n=0;n<400;n++){if(p.casting&&p.casting.elapsed/p.casting.total>=value)return state();if(!p.casting)throw Error('Cast ended before requested fraction');step(1);}throw Error('Fraction not reached');},
    away:()=>{aim.x=quarry.pos.x+300;aim.y=quarry.pos.y;return state();},
    refocus:()=>{aim.x=quarry.pos.x;aim.y=quarry.pos.y;return state();},
    release:()=>{holding=-1;return step(1);},
    click:slot=>{edge=slot;return step(1);},
    finish:()=>{for(let n=0;n<400;n++){if(!p.casting){holding=-1;return state();}step(1);}throw Error('Cast did not finish');},
    stun:()=>{p.applyStatus('stun',0,1,'interactive-ui');if(!p.isStunned())throw Error('Stun fixture refused');holding=-1;return step(1);},
   };
  })()`);
  await js('interactiveQA.step(180)');
  const started=await js('interactiveQA.press(0)');assert.equal(started.cast?.mode,'concentration');assert.equal(started.payments.length,1);results.push({stage:'focus-started',...started});
  const held=await js('interactiveQA.fraction(.5)');assert(!held.cast.focusBroken);assert.equal(held.executions.length,0);results.push({stage:'focus-earned',...held});await screenshot('interactive-focus-held.png');
  await js('interactiveQA.away()');const broken=await js('interactiveQA.step(6)');assert(broken.cast?.focusBroken);assert(broken.cast.elapsed<held.cast.elapsed&&broken.cast.elapsed>0);results.push({stage:'focus-drains',...broken});
  await js('interactiveQA.refocus()');const completed=await js('interactiveQA.finish()');assert.equal(completed.executions.length,1);assert.equal(completed.executions[0].active,false);assert(completed.quarry.life<started.quarry.life&&completed.quarry.seen);results.push({stage:'focus-real-damage-and-mark',...completed});
  await js('interactiveQA.press(0)');await js('interactiveQA.fraction(.4)');const abandoned=await js('interactiveQA.release()');assert.equal(abandoned.cast,null);assert.equal(abandoned.executions.length,1);assert(abandoned.cooldowns.some(([id,value])=>id==='transfixing_gaze'&&value>0));assert.equal(abandoned.payments.length,2);results.push({stage:'focus-fizzle-keeps-payment',...abandoned});
  await js('interactiveQA.press(1)');const timing=await js('interactiveQA.fraction(.76)');assert.equal(timing.cast.mode,'perfect');const made=await js('interactiveQA.click(1)');assert(made.cast?.pressUsed);assert.equal(made.cast.empowered,1.7);results.push({stage:'perfect-input-earned',...made});await screenshot('interactive-perfect-earned.png');
  const payoff=await js('interactiveQA.finish()');assert.equal(payoff.executions.length,2);assert(Math.abs(payoff.executions[1].mult-made.cast.baseMult*1.7)<1e-10);assert.equal(payoff.executions[1].active,false);results.push({stage:'perfect-payoff',...payoff});
  await js('interactiveQA.press(1)');await js('interactiveQA.fraction(.2)');const early=await js('interactiveQA.click(1)');assert(early.cast?.pressUsed);assert.equal(early.cast.empowered,1);await js('interactiveQA.fraction(.78)');const retry=await js('interactiveQA.click(1)');assert.equal(retry.cast?.empowered,1);const plain=await js('interactiveQA.finish()');assert.equal(plain.executions.length,3);assert.equal(plain.executions[2].mult,early.cast.baseMult);results.push({stage:'early-attempt-remains-spent',...plain});
  await js('interactiveQA.press(0)');await js('interactiveQA.fraction(.3)');const interrupted=await js('interactiveQA.stun()');assert.equal(interrupted.cast,null);assert.equal(interrupted.executions.length,3);assert.equal(interrupted.payments.length,5);assert.equal(interrupted.fatal,null);results.push({stage:'stun-denies-focus-delivery',...interrupted});await screenshot('interactive-casting-ui.png');
  console.log('PASS: rendered input earns concentration, drains/refinds focus, deals damage and marks, fizzles, earns timing and spends misses, then interrupts');
 }finally{fs.writeFileSync(path.join(dir,'interactive-casting-ui.json'),JSON.stringify(results,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
