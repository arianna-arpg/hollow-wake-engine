const {app,BrowserWindow}=require('electron'),{buildSync}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'request-profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),180000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'request-saves-'+process.pid)}),win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),results=[];
 const js=async code=>{const result=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(result?.qaError)throw Error(result.qaError);return result;};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  const data=buildSync({stdin:{contents:"export {SKILLS} from './data/skills'; export {SUPPORTS} from './data/supports'; export {makeSkillInstance} from './engine/skills'; export {POWER_PROGRESSION,odysseyMilestoneKey} from './data/powerProgression';",resolveDir:path.resolve(__dirname,'../src'),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'requestData'}).outputFiles[0].text;
  await js(`${data}\nwindow.requestData=requestData;void 0;`);
  await js(`(()=>{
   __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
   const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
   for(const id of Object.keys(w.meta.baseAttrs))w.meta.baseAttrs[id]=50;w.recalcPlayer();
   const ids=['ruin','firebolt','shambler_horde'];
   for(const[slot,id]of ids.entries()){
    if(!w.meta.knownSkills.has(id)){const item=w.grantSkillGemItem(w.localSeat,requestData.makeSkillInstance(requestData.SKILLS[id],20,1));if(!item||!w.learnSkill(item.uid,w.localSeat))throw Error('Cannot learn '+id);}
    p.skills[slot]=w.meta.knownSkills.get(id);
   }
   const trigger=p.skills[1],replenish=p.skills[2];
   w.account.ledger[requestData.odysseyMilestoneKey(requestData.POWER_PROGRESSION.awakening.odysseyStage)]=1;
   w.account.memorySecondary.add('skill:shambler_horde');
   trigger.sockets[0]={def:requestData.SUPPORTS.cast_on_crit,level:1};
   replenish.level=20;w.pickTreeNode('shambler_horde','wandering_dead');
   if(!replenish.treeNodes?.includes('wandering_dead'))throw Error('Replenishment tree purchase failed: '+w.texts.map(t=>t.text).join('; '));
   w.recalcPlayer();p.fillResources();
   let edge=-1,activity=0,payments=0;const requests=[],aim={x:p.pos.x+120,y:p.pos.y};
   __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===edge),pressed=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim,held,edge:pressed};}});
   const acted=w.markSeatActed.bind(w);w.markSeatActed=(a)=>{if(a===p)activity++;return acted(a);};
   const pay=w.paySkillCost.bind(w);w.paySkillCost=(a,...args)=>{if(a===p)payments++;return pay(a,...args);};
   const use=w.useSkill.bind(w);w.useSkill=(a,i,...args)=>{
    const before={activity,payments,mana:a.mana,casting:a.casting};const result=use(a,i,...args);
    if(a===p)requests.push({id:i.def.id,result,activity:activity-before.activity,payments:payments-before.payments,manaChange:a.mana-before.mana,castUnchanged:a.casting===before.casting,paused:!!i.replenishmentPaused,triggerOff:!!i.state?.triggerOff});
    return result;
   };
   const step=n=>{__game.step(n,16.7);return {fatal:__game.crash().fatal,requests:[...requests]};};
   window.requestQA={step,seal:spec=>{w.zone={...w.zone,castSeal:spec};},press:slot=>{edge=slot;return step(1);},count:()=>requests.length};
  })()`);
  await js('requestQA.step(180)');
  for(const[stage,slot,sealed,flag,value]of [
   ['trigger-disarms',1,false,'triggerOff',true],['seal-blocks-trigger',1,true,'triggerOff',true],['trigger-rearms',1,false,'triggerOff',false],
   ['replenishment-pauses',2,false,'paused',true],['seal-blocks-replenishment',2,true,'paused',true],['replenishment-resumes',2,false,'paused',false],
  ]){
   await js(`requestQA.seal(${sealed?'{}':'undefined'})`);await js('requestQA.step(30)');
   const before=await js('requestQA.count()'),after=await js(`requestQA.press(${slot})`);
   assert.equal(after.fatal,null);assert.equal(after.requests.length,before+1,'Native input did not dispatch exactly one request');
   const row=after.requests.at(-1);assert.equal(row.id,slot===1?'firebolt':'shambler_horde');assert.equal(row.result,!sealed);assert.equal(row[flag],value);
   assert.equal(row.activity,!sealed&&slot===1?1:0);assert.equal(row.payments,0);assert.equal(row.manaChange,0);assert(row.castUnchanged);
   results.push({stage,...row});
  }
  await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(dir,'request-toggles.png'),(await win.webContents.capturePage()).toPNG());
  console.log('PASS: six native input stages preserve trigger/replenishment toggles, seal priority, activity and payment boundaries');
 }finally{fs.writeFileSync(path.join(dir,'skill-request-ui.json'),JSON.stringify(results,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
