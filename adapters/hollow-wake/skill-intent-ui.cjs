const {app,BrowserWindow}=require('electron'),{buildSync}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'intent-profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),180000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'intent-saves-'+process.pid)}),win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),results=[];
 const js=async code=>{const result=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(result?.qaError)throw Error(result.qaError);return result;};
 const capture=async name=>{await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  const data=buildSync({stdin:{contents:"export {SKILLS} from './data/skills'; export {makeSkillInstance} from './engine/skills';",resolveDir:path.resolve(__dirname,'../src'),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'intentData'}).outputFiles[0].text;
  await js(`${data}\nwindow.intentData=intentData;void 0;`);
  await js(`(()=>{
   __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
   const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
   for(const id of Object.keys(w.meta.baseAttrs))w.meta.baseAttrs[id]=50;w.recalcPlayer();
   const ids=['trisect','scattergun','mimicry','ruin'];
   for(const[slot,id]of ids.entries()){
    if(!w.meta.knownSkills.has(id)){const item=w.grantSkillGemItem(w.localSeat,intentData.makeSkillInstance(intentData.SKILLS[id],1,1));if(!item||!w.learnSkill(item.uid,w.localSeat))throw Error('Cannot learn '+id);}
    p.skills[slot]=w.meta.knownSkills.get(id);
   }
   w.recalcPlayer();for(const[id,value]of Object.entries({mana:1000,manaRegen:0,manaRegenPct:0,lifeRegen:0,lifeRegenPct:0,poise:0}))p.sheet.setBase(id,value);p.fillResources();
   let edge=-1,holding=-1;const aim={x:p.pos.x+120,y:p.pos.y},payments=[],deliveries=[];
   __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===holding||i===edge),pressed=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim,held,edge:pressed};}});
   const pay=w.paySkillCost.bind(w);w.paySkillCost=(a,i,c)=>{const result=pay(a,i,c);if(a===p)payments.push(i.def.id);return result;};
   const execute=w.executeSkill.bind(w);w.executeSkill=(a,i,...args)=>{if(a===p)deliveries.push(i.def.id);return execute(a,i,...args);};
   const query=slot=>({face:w.slotFaceOf(p,p.skills[slot]).id,hud:w.skillUsable(p,p.skills[slot]),press:w.pressUsable(p,p.skills[slot])});
   const state=()=>({mana:p.mana,ammo:p.skillChargeBank(p.skills[1]).count,combo:p.skills[0].state,
    cast:p.casting?{id:p.casting.inst.def.id,mode:p.casting.mode}:null,payments:[...payments],deliveries:[...deliveries],fatal:__game.crash().fatal});
   const step=n=>{__game.step(n,16.7);return state();};
   window.intentQA={state,query,step,
    press:(slot,keep=-1)=>{holding=keep;edge=slot;return step(1);},
    ready:()=>{holding=-1;for(let n=0;n<1500;n++){__game.ui.hideAll();if(w.timeflow.scaleFor(p)>0&&p.canAct())return state();step(1);}throw Error('Body never ready');},
    seal:spec=>{w.zone={...w.zone,castSeal:spec};},
    seedAmmo:count=>{p.skillChargeBank(p.skills[1]).count=count;},
    seedMimic:skill=>{p.mimicBank=skill?[{sid:skill,src:'zombie',at:w.time}]:[];p.mimicSel=undefined;},
   };
  })()`);
  await js('intentQA.step(180)');await js('intentQA.ready()');
  assert.equal((await js('intentQA.query(0)')).face,'trisect');
  for(const[id,next]of [['trisect','bisect_cut'],['bisect_cut','trisect_finisher'],['trisect_finisher','trisect']]){
   await js('intentQA.ready()');const before=await js('intentQA.state()'),after=await js('intentQA.press(0)');
   assert.equal(after.payments.at(-1),id);assert.equal(after.payments.length,before.payments.length+1);
   assert.equal((await js('intentQA.query(0)')).face,next);results.push({stage:'native-combo-'+id,...after});
  }
  await js('intentQA.ready()');const complete=await js('intentQA.state()');
  for(const id of ['trisect','bisect_cut','trisect_finisher'])assert(complete.deliveries.includes(id));
  await capture('intent-combo');
  await js('intentQA.press(0)');await js('intentQA.ready()');assert.equal((await js('intentQA.query(0)')).face,'bisect_cut');
  await js('intentQA.step(180)');assert.equal((await js('intentQA.query(0)')).face,'trisect');
  results.push({stage:'combo-window-expires',...(await js('intentQA.state()'))});
  await js("intentQA.seedMimic(null)");assert.equal((await js('intentQA.query(2)')).press,false);
  await js("intentQA.seedMimic('ruin')");assert.equal((await js('intentQA.query(2)')).face,'ruin');
  const mimic=await js('intentQA.press(2)');assert.equal(mimic.cast?.id,'ruin');assert.equal(mimic.payments.at(-1),'ruin');
  results.push({stage:'native-mimic-selected-art',...mimic});await js('intentQA.ready()');await capture('intent-mimic');
  await js('intentQA.seedAmmo(0)');assert.equal((await js('intentQA.query(1)')).face,'reload_shells');
  // The host is open but its redirected payload is shut: actual dispatch must recheck.
  await js("intentQA.seal({mode:'open',shut:{ids:['reload_shells']}})");
  const before=await js('intentQA.state()'),refused=await js('intentQA.press(1,1)');
  assert.equal(refused.cast,null);assert.equal(refused.ammo,0);assert.deepEqual(refused.payments,before.payments);
  results.push({stage:'redirected-payload-sealed',...refused});
  await js('intentQA.seal(undefined)');await js('intentQA.ready()');
  const reload=await js('intentQA.press(1,1)');assert.equal(reload.cast?.id,'reload_shells');
  const loaded=await js('intentQA.step(80)');assert(loaded.ammo>0);assert.equal((await js('intentQA.query(1)')).face,'scattergun');
  results.push({stage:'native-reload-restores-face',...loaded});await capture('intent-reload');
  await js('intentQA.ready()');await js('intentQA.seal({})');
  const blockedQuery=await js('intentQA.query(3)');assert.equal(blockedQuery.hud,false);assert.equal(blockedQuery.press,false);
  const sealedBefore=await js('intentQA.state()'),sealedAfter=await js('intentQA.press(3)');
  assert.equal(sealedAfter.cast,null);assert.deepEqual(sealedAfter.payments,sealedBefore.payments);assert.equal(sealedAfter.fatal,null);
  results.push({stage:'sealed-native-press',query:blockedQuery,...sealedAfter});
  console.log('PASS: native input earns combo steps and expiry, selected mimic cast, reload face restoration and seal refusal');
 }finally{fs.writeFileSync(path.join(dir,'skill-intent-ui.json'),JSON.stringify(results,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
