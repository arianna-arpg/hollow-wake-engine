const {app,BrowserWindow}=require('electron'),{buildSync}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'guard-profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),180000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'guard-saves-'+process.pid)}),win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),results=[];
 const js=async code=>{const r=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(r?.qaError)throw Error(r.qaError);return r;};
 const capture=async name=>{await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  const data=buildSync({stdin:{contents:"export {SUPPORTS} from './data/supports';",resolveDir:path.resolve(__dirname,'../src'),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'guardData'}).outputFiles[0].text;
  await js(`${data}\nwindow.guardData=guardData;void 0;`);
  await js(`(()=>{
   __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
   const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
   for(const k of Object.keys(w.meta.attrs))w.meta.attrs[k]=50;
   for(const [slot,id]of ['shield_up','spiked_bulwark','ice_shield','defiant_bulwark'].entries())if(__game.devGrantSkill(id,1,slot)!==slot)throw Error('Cannot grant '+id);
   for(const [skill,support]of [['shield_up','grafted_carapace'],['spiked_bulwark','answering_wall']]){
    const gem=w.grantSupportGemItem(w.localSeat,{def:guardData.SUPPORTS[support],level:1});if(!gem||!w.socketSupport(gem.uid,skill))throw Error('Cannot socket '+support);
   }
   w.recalcPlayer();p.setAttributes(w.meta.attrs);p.sheet.setBase('mana',1000);p.sheet.setBase('manaRegen',0);p.sheet.setBase('lifeRegen',0);p.sheet.setBase('poise',0);p.fillResources();
   const target=w.createMonster('zombie',1,'enemy');target.brain=undefined;target.aiCooldown=99999;target.tier=p.tier;target.pos={x:p.pos.x+40,y:p.pos.y};target.sheet.setBase('life',100000);target.fillResources();w.springAmbush(target,true);target.untargetable=false;w.actors.push(target);
   let holding=-1,edge=-1;const aim={x:p.pos.x+120,y:p.pos.y};
   __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===holding),pressed=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim,held,edge:pressed};}});
   const bashes=[],executions=[],bash=w.guardBash.bind(w),execute=w.executeSkill.bind(w);
   w.guardBash=(actor,inst,spec,payload)=>{const row={skill:inst.def.id,payload,active:!!actor.casting,recovery:actor.useLock,before:target.life};const result=bash(actor,inst,spec,payload);if(actor===p)bashes.push({...row,after:target.life});return result;};
   w.executeSkill=(actor,inst,at,opts)=>{if(actor===p)executions.push({skill:inst.def.id,active:!!p.casting});return execute(actor,inst,at,opts);};
   const state=()=>({mana:p.mana,cast:p.casting?{skill:p.casting.inst.def.id,mode:p.casting.mode,held:p.casting.held,time:p.casting.channelTime,shield:p.casting.shield,maxShield:p.casting.maxShield,line:p.casting.bashAt,arm:p.casting.bashArmAt}:null,shell:!!p.shellGuard,bashes:[...bashes],executions:[...executions],targetLife:target.life,targetStatuses:target.statuses.map(s=>s.id),fatal:__game.crash().fatal});
   const step=n=>{__game.step(n,16.7);return state();};
   const ready=slot=>{holding=-1;for(let n=0;n<1500;n++){__game.ui.hideAll();if(w.timeflow.scaleFor(p)>0&&p.canAct()&&w.skillUsable(p,p.skills[slot]))return;step(1);}throw Error('Not ready: '+JSON.stringify(state()));};
   window.guardQA={state,step,press:slot=>{ready(slot);target.pos={x:p.pos.x+40,y:p.pos.y};target.push=undefined;holding=slot;edge=slot;return step(1);},release:()=>{holding=-1;return step(1);},
    waitArm:()=>{for(let n=0;n<900;n++){if(p.casting&&p.casting.bashAt!==undefined&&p.casting.channelTime>=p.casting.bashArmAt)return state();step(1);}throw Error('Arm not earned');},
    waitPulse:()=>{for(let n=0;n<900;n++){if(executions.some(e=>e.skill==='taunt_pulse'))return state();step(1);}throw Error('No native guard pulse');},
    breakShield:()=>{const cs=p.casting;if(cs?.mode!=='guard')throw Error('No shield');const before=state();if(!w.tryGuardBlock(p,target,{...target.pos},cs.maxShield*2))throw Error('Native guard interception refused');holding=-1;return{before,after:state()};},
    stun:()=>{const count=bashes.length;p.applyStatus('stun',0,1,'guard-ui');if(!p.isStunned())throw Error('Stun refused');holding=-1;step(1);if(bashes.length!==count)throw Error('Interrupted guard bashed');return state();},
   };
  })()`);
  await js('guardQA.step(180)');
  const press=await js('guardQA.press(0)');assert.equal(press.cast?.mode,'guard');assert(press.shell);results.push({stage:'native-raised-with-grafted-shell',...press});
  const early=await js('guardQA.release()');assert.equal(early.cast,null);assert(!early.shell);assert.equal(early.bashes.length,0);results.push({stage:'early-release-denies-bash',...early});
  await js('guardQA.press(0)');const ready=await js('guardQA.waitArm()');assert(ready.cast.time>=ready.cast.arm);results.push({stage:'earned-native-readiness',...ready});await capture('guard-ready');
  const bashed=await js('guardQA.release()');assert.equal(bashed.cast,null);assert(!bashed.shell);assert.equal(bashed.bashes.length,1);assert(!bashed.bashes[0].active);assert(bashed.bashes[0].after<bashed.bashes[0].before);results.push({stage:'native-release-damages-target',...bashed});
  await js('guardQA.press(1)');const taught=await js('guardQA.waitArm()');assert(taught.cast.line!==undefined);results.push({stage:'socket-taught-bash-ready',...taught});await capture('guard-taught');
  const answer=await js('guardQA.release()');const taughtBashes=answer.bashes.filter(b=>b.skill==='spiked_bulwark');assert.equal(taughtBashes.length,1);assert(taughtBashes[0].after<taughtBashes[0].before);assert.equal(answer.cast,null);results.push({stage:'taught-bash-delivered',...answer});
  const ice=await js('guardQA.press(2)');assert(ice.cast.time<ice.cast.arm);const broken=await js('guardQA.breakShield()');assert(broken.before.cast.time<broken.before.cast.arm);assert.equal(broken.after.cast,null);const burst=broken.after.bashes.at(-1);assert.equal(burst.skill,'ice_shield');assert.equal(burst.payload,broken.before.cast.maxShield);assert.equal(burst.recovery,.3);assert(burst.after<burst.before);results.push({stage:'native-break-burst-before-arm',...broken});await capture('guard-break');
  await js('guardQA.press(3)');const pulse=await js('guardQA.waitPulse()');assert(pulse.targetStatuses.includes('taunted'));assert(pulse.executions.find(e=>e.skill==='taunt_pulse').active);results.push({stage:'held-component-pulse-taunts',...pulse});await capture('guard-pulse');await js('guardQA.release()');
  await js('guardQA.press(0)');await js('guardQA.step(15)');const cancelled=await js('guardQA.stun()');assert.equal(cancelled.cast,null);assert(!cancelled.shell);assert.equal(cancelled.fatal,null);results.push({stage:'stun-strips-shell-without-bash',...cancelled});
  console.log('PASS: rendered guard input, earned arm clock, native/taught release damage, real shield-break burst, held taunt pulse and stun cleanup');
 }finally{fs.writeFileSync(path.join(dir,'guard-casting-ui.json'),JSON.stringify(results,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
