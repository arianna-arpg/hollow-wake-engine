const {app,BrowserWindow}=require('electron'),{buildSync}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'admission-profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),180000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'admission-saves-'+process.pid)}),win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),results=[];
 const js=async code=>{const result=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(result?.qaError)throw Error(result.qaError);return result;};
 const capture=async name=>{await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  const data=buildSync({stdin:{contents:"export {SKILLS} from './data/skills'; export {makeSkillInstance} from './engine/skills';",resolveDir:path.resolve(__dirname,'../src'),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'admissionData'}).outputFiles[0].text;
  await js(`${data}\nwindow.admissionData=admissionData;void 0;`);
  await js(`(()=>{
   __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
   const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
   for(const id of Object.keys(w.meta.baseAttrs))w.meta.baseAttrs[id]=50;w.recalcPlayer();
   const ids=['ruin','life_flask','shield_up','phalanx_thrust'];
   for(const [slot,id]of ids.entries()){
    if(!w.meta.knownSkills.has(id)){const item=w.grantSkillGemItem(w.localSeat,admissionData.makeSkillInstance(admissionData.SKILLS[id],1,1));if(!item||!w.learnSkill(item.uid,w.localSeat))throw Error('Cannot learn '+id);}
    p.skills[slot]=w.meta.knownSkills.get(id);
   }
   w.recalcPlayer();for(const[id,value]of Object.entries({mana:1000,manaRegen:0,manaRegenPct:0,lifeRegen:0,lifeRegenPct:0,poise:0}))p.sheet.setBase(id,value);p.fillResources();
   let holding=-1,edge=-1;const aim={x:p.pos.x+120,y:p.pos.y},payments=[];
   __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===holding||i===edge),pressed=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim,held,edge:pressed};}});
   const pay=w.paySkillCost.bind(w);w.paySkillCost=(a,i,c)=>{const result=pay(a,i,c);if(a===p)payments.push(i.def.id);return result;};
   const state=()=>({mana:p.mana,life:p.life,flasks:p.charges.get('flask_life')??0,reflexLock:p.reflexLock,useLock:p.useLock,
    cast:p.casting?{id:p.casting.inst.def.id,mode:p.casting.mode}:null,payments:[...payments],fatal:__game.crash().fatal});
   const step=n=>{__game.step(n,16.7);return state();};
   const query=slot=>({actor:p.canUse(p.skills[slot]),hud:w.skillUsable(p,p.skills[slot]),press:w.pressUsable(p,p.skills[slot])});
   window.admissionQA={state,step,query,
    press:(slot,keep=-1)=>{holding=keep;edge=slot;return step(1);},
    ready:()=>{holding=-1;for(let n=0;n<1500;n++){__game.ui.hideAll();if(w.timeflow.scaleFor(p)>0&&p.canAct())return state();step(1);}throw Error('Body never ready');},
    seed:(life,mana,flasks)=>{p.life=life==='full'?p.maxLife():p.maxLife()-100;p.mana=mana==='full'?p.maxMana():0;p.es=0;p.charges.set('flask_life',flasks);return state();},
   };
  })()`);
  await js('admissionQA.step(180)');await js('admissionQA.ready()');await js("admissionQA.seed('full','full',2)");
  const full=await js('admissionQA.query(1)');assert.equal(full.actor,false);results.push({stage:'full-pool-thirst-refusal',query:full});
  await js("admissionQA.seed('hurt','full',2)");assert.equal((await js('admissionQA.query(1)')).actor,true);
  const cast=await js('admissionQA.press(0)');results.push({stage:'native-ordinary-cast-start',...cast});assert.equal(cast.cast?.id,'ruin');
  const reflex=await js('admissionQA.press(1)');assert.equal(reflex.cast?.id,'ruin');assert.equal(reflex.flasks,1);assert(reflex.reflexLock>0);assert(reflex.payments.includes('life_flask'));
  results.push({stage:'native-reflex-preserves-cast',...reflex});await capture('admission-reflex');
  const repeat=await js('admissionQA.press(1)');assert.equal(repeat.flasks,1);assert.equal(repeat.payments.filter(id=>id==='life_flask').length,1);results.push({stage:'repeated-reflex-refused',...repeat});
  await js('admissionQA.ready()');await js("admissionQA.seed('full',0,2)");
  const broke=await js('admissionQA.query(0)');assert.equal(broke.actor,false);assert.equal(broke.hud,true);results.push({stage:'hud-is-supplementary-to-price',query:broke});
  const before=await js('admissionQA.state()'),refused=await js('admissionQA.press(0)');assert.equal(refused.cast,null);assert.deepEqual(refused.payments,before.payments);
  await js("admissionQA.seed('full','full',2)");await js('admissionQA.ready()');assert.equal((await js('admissionQA.query(3)')).actor,false);
  const guard=await js('admissionQA.press(2,2)');assert.equal(guard.cast?.mode,'guard');
  // Let the ordinary entry recovery elapse while retaining the actual held input.
  await js('admissionQA.step(15)');assert.equal((await js('admissionQA.query(3)')).actor,true);
  const combo=await js('admissionQA.press(3,2)');assert.equal(combo.cast?.id,'shield_up');assert(combo.payments.includes('phalanx_thrust'));assert.equal(combo.fatal,null);
  results.push({stage:'guard-combo-keeps-native-hold',...combo});await capture('admission-guard-combo');
  console.log('PASS: mounted HUD and native input preserve thirst, reflex locks, cast continuity, cost refusal and guard combinations');
 }finally{fs.writeFileSync(path.join(dir,'skill-admission-ui.json'),JSON.stringify(results,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
