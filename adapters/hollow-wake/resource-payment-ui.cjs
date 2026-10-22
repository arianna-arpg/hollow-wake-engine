const {app,BrowserWindow}=require('electron'),{buildSync}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'payment-profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),180000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'payment-saves-'+process.pid)}),win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),results=[];
 const js=async code=>{const r=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(r?.qaError)throw Error(r.qaError);return r;};
 const capture=async name=>{await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  const data=buildSync({stdin:{contents:"export {SKILLS} from './data/skills'; export {makeSkillInstance} from './engine/skills';",resolveDir:path.resolve(__dirname,'../src'),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'paymentData'}).outputFiles[0].text;
  await js(`${data}\nwindow.paymentData=paymentData;void 0;`);
  await js(`(()=>{
   __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
   const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
   for(const id of Object.keys(w.meta.baseAttrs))w.meta.baseAttrs[id]=50;w.recalcPlayer();
   const ids=['overclock','convocation','blood_mortgage','sanguine_burst'];
   for(const [slot,id]of ids.entries()){
    if(!w.meta.knownSkills.has(id)){const item=w.grantSkillGemItem(w.localSeat,paymentData.makeSkillInstance(paymentData.SKILLS[id],1,1));if(!item||!w.learnSkill(item.uid,w.localSeat))throw Error('Cannot learn '+id);}
    p.skills[slot]=w.meta.knownSkills.get(id);
   }
   w.recalcPlayer();p.sheet.setBase('mana',1000);p.sheet.setBase('manaRegen',0);p.sheet.setBase('manaRegenPct',0);p.sheet.setBase('lifeRegen',0);p.sheet.setBase('lifeRegenPct',0);p.fillResources();
   let holding=-1,edge=-1;const aim={x:p.pos.x+120,y:p.pos.y};
   __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===holding),pressed=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim,held,edge:pressed};}});
   const payments=[],pay=w.paySkillCost.bind(w);
   w.paySkillCost=(a,inst,cost)=>{const before={mana:a.mana,life:a.life};const result=pay(a,inst,cost);if(a===p)payments.push({skill:inst.def.id,cost:{...cost},before,after:{mana:a.mana,life:a.life},manaDebt:p.overdrive.mana?.debt??0,lifeDebt:p.overdrive.life?.debt??0});return result;};
   const state=()=>({mana:p.mana,life:p.life,reservedMana:p.reservedMana,reservedLife:p.reservedLife,
    manaLoan:p.overdrive.mana?{debt:p.overdrive.mana.debt,idle:p.overdrive.mana.idle}:null,lifeLoan:p.overdrive.life?{debt:p.overdrive.life.debt,idle:p.overdrive.life.idle}:null,
    active:[...p.activeAuras.keys()],cast:p.casting?.inst.def.id??null,payments:[...payments],fatal:__game.crash().fatal});
   const step=n=>{__game.step(n,16.7);return state();};
   const ready=slot=>{holding=-1;for(let n=0;n<1200;n++){__game.ui.hideAll();if(w.timeflow.scaleFor(p)>0&&p.canAct()&&!p.cooldowns.has(ids[slot]))return;step(1);}throw Error('Not ready: '+JSON.stringify(state()));};
   window.paymentQA={state,step,
    press:slot=>{ready(slot);holding=slot;edge=slot;const result=step(1);holding=-1;return result;},
    finish:()=>{for(let n=0;n<600;n++){if(!p.casting)return state();step(1);}throw Error('Cast did not finish');},
    emptyMana:()=>{p.mana=0;p.es=0;return state();},
    seedBlood:()=>{const cost=p.skillCost(p.skills[3]);if(!(cost.life>0))throw Error('No life price');p.life=Math.max(.1,cost.life*.5);return cost;},
    repay:lane=>{holding=-1;if(lane==='life')p.sheet.setBase('lifeRegen',8);for(let n=0;n<3000;n++){if(p.overdrive[lane]?.debt===0)return state();step(1);}throw Error('Debt did not repay: '+JSON.stringify(state()));},
    unlearn:id=>w.unlearnSkill(id,w.localSeat),
   };
  })()`);
  await js('paymentQA.step(180)');await js('paymentQA.press(0)');const activated=await js('paymentQA.finish()');assert.equal(activated.manaLoan?.debt,0);results.push({stage:'native-mana-loan-activated',...activated});
  await js('paymentQA.emptyMana()');await js('paymentQA.press(1)');const borrowed=await js('paymentQA.finish()');assert(borrowed.manaLoan.debt>0);assert.equal(borrowed.reservedMana,borrowed.manaLoan.debt);results.push({stage:'input-cast-borrows-mana',...borrowed});
  const locked=await js('paymentQA.press(0)');assert(locked.manaLoan.debt>0);assert(locked.active.includes('overclock'));assert.equal(await js("paymentQA.unlearn('overclock')"),false);results.push({stage:'debt-locks-toggle-and-unlearning',...locked});await capture('payment-mana-debt');
  const settled=await js("paymentQA.repay('mana')");assert.equal(settled.manaLoan.debt,0);assert.equal(settled.reservedMana,0);results.push({stage:'earned-mana-repayment',...settled});
  await js('paymentQA.press(0)');const off=await js('paymentQA.finish()');assert.equal(off.manaLoan,null);assert.equal(await js("paymentQA.unlearn('overclock')"),true);results.push({stage:'repaid-loan-can-be-removed',...off});
  await js('paymentQA.press(2)');await js('paymentQA.finish()');const cost=await js('paymentQA.seedBlood()');await js('paymentQA.press(3)');const blood=await js('paymentQA.finish()');assert.equal(blood.lifeLoan.debt,cost.life);assert.equal(blood.reservedLife,cost.life);const charge=blood.payments.findLast(p=>p.skill==='sanguine_burst');assert.equal(charge.before.life,charge.after.life);results.push({stage:'whole-life-price-borrowed-through-input',...blood});await capture('payment-life-debt');
  const paid=await js("paymentQA.repay('life')");assert.equal(paid.lifeLoan.debt,0);assert.equal(paid.reservedLife,0);assert(paid.life>blood.life);assert.equal(paid.fatal,null);results.push({stage:'earned-life-repayment-and-regeneration',...paid});await capture('payment-repaid');
  console.log('PASS: mounted game input activates loans, borrows mana/whole life prices, enforces debt locks and earns repayment before removal');
 }finally{fs.writeFileSync(path.join(dir,'resource-payment-ui.json'),JSON.stringify(results,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
