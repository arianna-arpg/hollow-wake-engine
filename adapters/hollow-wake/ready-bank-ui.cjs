// Controlled native controller operations, real World frames and actual Canvas
// paint. This is not physical-input, pixel-equivalence or device-performance QA.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'ready-bank-profile-'+process.pid));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
  const timeout=setTimeout(()=>{console.error('Ready bank renderer timed out');app.exit(1);},180000);
  const server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'ready-bank-saves-'+process.pid)});
  const win=new BrowserWindow({show:false,width:1280,height:800,useContentSize:true,webPreferences:{offscreen:true,backgroundThrottling:false}});
  const stages=[],near=(a,b)=>assert(Math.abs(a-b)<1e-4,`${a} != ${b}`);
  const js=async code=>{const value=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(value?.qaError)throw Error(value.qaError);return value;};
  const capture=async name=>{
    const {image,...facts}=await js(`readyBankQA.capture(${JSON.stringify(name)})`);stages.push(facts);
    fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(image.split(',')[1],'base64'),{flag:'wx'});
    assert.equal(facts.fatal,null);
    if(facts.hud&&facts.rect){
      assert.equal(facts.backgrounds.length,1,'Missing or duplicate bank background');
      assert.equal(facts.fills.length,1,'Missing or duplicate bank progress');
      assert.equal(facts.labels.length,1,'Missing or duplicate bank label');
      const {x,y,w}=facts.rect,k=facts.uiToCss,bg=facts.backgrounds[0],fill=facts.fills[0],label=facts.labels[0];
      for(const paint of [bg,fill]){near(paint.args[0],x/k);near(paint.args[1],y/k-46);near(paint.args[3],5);near(paint.alpha,1);}
      near(bg.args[2],w/k);near(fill.args[2],w/k*facts.hud.progress);
      assert.equal(label.args[0],'Next: '+facts.hud.hits+(facts.hud.hits===1?' hit':' hits'),'Bank hit label differs');
      near(label.args[1],(x+w/2)/k);near(label.args[2],y/k-50);near(label.alpha,1);
      assert.equal(label.font,'bold 9px Verdana');assert.equal(label.align,'center');
    }else{assert.equal(facts.backgrounds.length,0,'Stale bank background');assert.equal(facts.fills.length,0,'Stale bank progress');assert.equal(facts.labels.length,0,'Stale bank label');}
    return facts;
  };
  try{
    await win.loadURL('about:blank');win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');
    await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(performance,'now',{value:()=>20000,configurable:true});window.requestAnimationFrame=()=>0;"});
    await win.loadURL(server.url);assert.equal(await js('performance.now()'),20000);assert.equal(await js('requestAnimationFrame(()=>{})'),0);await js('__game.hydrated()');
    await js(`(()=>{
      __game.hold(true);__game.account().ledger.prologue_lived=1;__game.devStartRun('warrior');__game.ui.hideAll();
      const w=__game.world(),p=w.player,r=__game.renderer;
      w.zoneMap.qa_ready_bank={id:'qa_ready_bank',name:'Banked Orders Study',level:1,sky:'sheltered',size:{w:1800,h:1400},seed:745,
        theme:{floor:'#30343a',grid:'#353940',border:'#444b55',obstacle:'#444',obstacleEdge:'#555',accent:'#829fc2'},layout:[],objective:{kind:'safe'},exits:[],map:{x:9000,y:9000}};
      w.loadZone('qa_ready_bank');if(w.skyFront()!==null)throw Error('Expected sheltered weather');p.pos={x:900,y:760};w.actors=[p];w.walk=null;__game.step(120,25);
      w.actors=[p];w.projectiles=[];w.flashes=[];w.texts=[];w.zones=[];w.doodads=[];w.markDoodadsChanged();w.devIgnoreSkillAttributes=true;
      for(const[slot,id]of ['command_assault','command_recall','firebolt','cleave'].entries())if(__game.devGrantSkill(id,1,slot)!==slot)throw Error('Missing authored skill '+id);
      p.skills=p.skills.slice(0,4);const host=p.skills[0],recall=p.skills[1];host.treeNodes=['killing_signal'];
      p.sheet=new p.sheet.constructor();p.sheet.setSource('ready-bank-rig',[{stat:'life',kind:'override',value:1000},...['mana','energyShield','poise'].map(stat=>({stat,kind:'override',value:100})),
        ...['lifeRegen','lifeRegenPct','manaRegen','esRechargeRate','poiseRegenPct','critChance','addedCooldown'].map(stat=>({stat,kind:'override',value:0})),
        ...['attackSpeed','castSpeed','effectDuration','cooldownRecovery','healTaken'].map(stat=>({stat,kind:'override',value:1}))]);
      p.life=1000;p.mana=100;p.es=p.poise=40;p.esDelay=1000;p.reservedMana=0;p.useLock=0;
      p.statuses=[];p.buffs.clear();p.charges.clear();p.procCuePulses=[];p.procReadyAt.clear();p.procFiredAt.clear();p.cooldowns.clear();p.cooldownTotals.clear();
      __game.settings().lowLifePulse=false;__game.settings().poolBars='always';
      let seed=0xba4c,draws=0;Math.random=()=>{draws++;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};
      const body=new p.constructor('bank-recipient','player',{x:935,y:760});body.owner=p;body.tier=p.tier;
      const round=n=>Number(n.toFixed(6)),copy=x=>JSON.parse(JSON.stringify(x,(_k,v)=>typeof v==='number'?round(v):v));
      let frame=0,inHud=false,backgrounds=[],fills=[],labels=[];const start=w.time,events=[];
      const bank=()=>w.assaults.courts.get(p)?.bank??null,state=()=>({bank:bank(),hud:copy(p.assaultHud??null),clocks:copy([...p.cooldowns]),totals:copy([...p.cooldownTotals]),preparation:body.assaultPreparation?{hits:body.assaultPreparation.hits,remaining:round(body.assaultPreparation.until-w.time)}:null});
      __game.pilot({poll:()=>({dx:0,dy:0,aim:p.pos,held:p.skills.map(()=>false),edge:p.skills.map(()=>false)})});
      const hud=r.drawHudCluster;r.drawHudCluster=function(world,seat,...args){const before=inHud;inHud=seat.actor===p;try{return hud.call(this,world,seat,...args);}finally{inHud=before;}};
      const proto=CanvasRenderingContext2D.prototype;
      for(const method of ['fillRect','fillText']){const original=proto[method];proto[method]=function(...args){
        if(inHud&&this.canvas===r.canvas){const color=String(this.fillStyle),m=this.getTransform(),row={args:args.map(v=>typeof v==='number'?round(v):v),color,alpha:round(this.globalAlpha),transform:[m.a,m.b,m.c,m.d,m.e,m.f].map(round)};
          if(method==='fillRect'&&color==='#292516')backgrounds.push(row);
          if(method==='fillRect'&&color==='#efcc73')fills.push(row);
          if(method==='fillText'&&color==='#f2dda3'&&String(args[0]).startsWith('Next: '))labels.push({...row,font:this.font,align:this.textAlign});
        }return original.apply(this,args);};}
      const step=(n=1)=>{for(let i=0;i<n;i++){backgrounds=[];fills=[];labels=[];frame++;__game.step(1,25);}};
      const operation=(name,fn)=>{const before=state();fn();events.push({name,before,after:state(),frame});};
      window.readyBankQA={p,w,host,step,
        enable:yes=>{host.treeNodes=yes?['patient_signal','killing_signal']:['killing_signal'];step();},
        seedClock:()=>{p.cooldowns.set(host.def.id,8);p.cooldownTotals.set(host.def.id,8);step();},
        refund:amount=>{operation('refund:'+amount,()=>w.assaults.refund(p,host,amount));step();},
        command:isRecall=>{operation(isRecall?'recall':'command',()=>w.assaults.command(p,isRecall?recall:host,[body],isRecall));step();},
        price:added=>{p.sheet.setSource('bank-price',[{stat:'addedCooldown',kind:'override',value:added}]);step();},
        hold:()=>{if(!w.timeflow.hold({id:'ready-bank-ui',kind:'skill',scale:0}))throw Error('Hold refused');step();},
        release:()=>{w.timeflow.release('ready-bank-ui');step();},
        remove:()=>{p.skills=p.skills.filter(i=>i!==host);step();},
        capture:name=>{const index=p.skills.indexOf(host),rect=index<0?null:r.hudSlotRects.find(row=>row.slot===index);return{name,frame,clock:round(w.time-start),...state(),
          rect:rect?{x:rect.x,y:rect.y,w:rect.w,h:rect.h}:null,uiToCss:r.uiToCss,backgrounds,fills,labels,events:copy(events),draws,fatal:__game.crash().fatal,image:r.canvas.toDataURL('image/png')};}};step();
    })()`);
    const disabled=await capture('disabled');assert.equal(disabled.hud,null);
    await js('readyBankQA.enable(true)');const empty=await capture('enabled-empty');assert.deepEqual(empty.hud,{hits:1,progress:0});
    await js('readyBankQA.seedClock()');const running=await capture('running-clock');near(new Map(running.clocks).get('command_assault'),7.975);
    await js('readyBankQA.refund(2)');const reduced=await capture('running-refund');near(new Map(reduced.clocks).get('command_assault'),5.95);assert.equal(reduced.bank,0);
    await js('readyBankQA.refund(99)');const finished=await capture('finishing-refund');assert.equal(finished.bank,0);assert.equal(finished.clocks.length,0);
    await js('readyBankQA.refund(4)');const half=await capture('half-unit');assert.deepEqual(half.hud,{hits:1,progress:0.5});
    await js('readyBankQA.refund(4)');const unit=await capture('one-extra-hit');assert.deepEqual(unit.hud,{hits:2,progress:0});
    await js('readyBankQA.refund(9)');const carry=await capture('two-extra-fraction');assert.deepEqual(carry.hud,{hits:3,progress:0.125});assert.equal(carry.bank,17);
    await js('readyBankQA.command(true)');const recall=await capture('recall-preserves-credit');assert.equal(recall.bank,17);assert.equal(recall.preparation,null);
    await js('readyBankQA.command(false)');const spent=await capture('command-spends-credit');assert.equal(spent.bank,1);assert.equal(spent.preparation.hits,3);assert.deepEqual(spent.hud,{hits:1,progress:0.125});
    await js('readyBankQA.refund(31)');const full=await capture('full-capacity');assert.deepEqual(full.hud,{hits:5,progress:1});assert.equal(full.bank,32);
    await js('readyBankQA.refund(100)');const capped=await capture('capacity-retained');assert.equal(capped.bank,32);
    await js('readyBankQA.price(8)');const repriced=await capture('price-increased');assert.deepEqual(repriced.hud,{hits:3,progress:0});assert.equal(repriced.bank,32);
    await js('readyBankQA.command(false)');const spendRepriced=await capture('spend-new-price');assert.equal(spendRepriced.bank,0);assert.equal(spendRepriced.preparation.hits,3);
    await js('readyBankQA.refund(3)');const pricedFraction=await capture('new-price-fraction');assert.deepEqual(pricedFraction.hud,{hits:1,progress:0.1875});
    await js('readyBankQA.price(0)');const priceRestored=await capture('price-restored');assert.deepEqual(priceRestored.hud,{hits:1,progress:0.375});
    await js('readyBankQA.hold()');const stopped=await capture('world-paused');
    await js('readyBankQA.step(8)');const held=await capture('paused-credit-held');assert.equal(held.bank,3);near(held.clock,stopped.clock);assert.deepEqual(held.hud,stopped.hud);
    await js('readyBankQA.release()');const resumed=await capture('world-resumed');assert.equal(resumed.bank,3);assert(resumed.clock>held.clock);
    await js('readyBankQA.enable(false)');const off=await capture('policy-retired');assert.equal(off.hud,null);assert.equal(off.bank,0);assert.equal(off.preparation,null);
    await js('readyBankQA.enable(true)');const restored=await capture('policy-restored-empty');assert.deepEqual(restored.hud,{hits:1,progress:0});
    await js('readyBankQA.refund(4)');await capture('before-host-removal');
    await js('readyBankQA.remove()');const removed=await capture('host-removed');assert.equal(removed.hud,null);assert.equal(removed.bank,null);assert.equal(removed.rect,null);
    assert.deepEqual(removed.totals,running.totals);console.log('PASS: ready bank renderer scenarios; '+stages.length+' stages');
  }finally{fs.writeFileSync(path.join(dir,'ready-bank-ui.json'),JSON.stringify(stages,null,2)+'\n',{flag:'wx'});clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
