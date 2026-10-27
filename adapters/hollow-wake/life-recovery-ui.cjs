// Native skill input and frame-driven healing; refill and block-proc events are controlled host inputs.
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {startGameServer} = require('../launcher/server.cjs');
const dir = process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData', path.join(dir, 'healing-profile-' + process.pid));
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const timeout = setTimeout(() => app.exit(1), 180000);
  const server = await startGameServer({root: process.env.HOLLOW_WAKE_QA_DIST, savesDir: path.join(dir, 'healing-saves-' + process.pid)});
  const win = new BrowserWindow({show: false, width: 1280, height: 800, useContentSize: true, webPreferences: {offscreen: true, backgroundThrottling: false}});
  const stages = [];
  const js = async code => {
    const value = await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);
    if (value?.qaError) throw Error(value.qaError); return value;
  };
  const capture = async name => {
    const {image, ...facts} = await js(`healingQA.capture(${JSON.stringify(name)})`);
    assert.equal(facts.fatal, null); assert.equal(facts.orb.length, 1);
    assert(facts.lifePaint.some(p => p.method === 'fillText' && p.args[0] === String(Math.ceil(facts.life))));
    const fill = facts.lifePaint.find(p => p.method === 'fillRect' && p.color === '#a82828');
    assert(fill); assert.equal(facts.orb[0][3], Number((facts.life / facts.maximum).toFixed(6)));
    assert(Math.abs(fill.args[3] - facts.orb[0][2] * 2 * facts.life / facts.maximum) < 1e-5);
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(image.split(',')[1], 'base64'));
    stages.push(facts); return facts;
  };
  try {
    await win.loadURL(server.url); await js('__game.hydrated()');
    await js(`(()=>{
      __game.hold(true);__game.account().ledger.prologue_lived=1;__game.devStartRun('warrior');__game.ui.hideAll();
      const w=__game.world(),p=w.player,r=__game.renderer;
      w.zoneMap.qa_healing={id:'qa_healing',name:'Life Recovery Study',level:1,sky:'sheltered',size:{w:1800,h:1400},seed:737,
        theme:{floor:'#30343a',grid:'#353940',border:'#444b55',obstacle:'#444',obstacleEdge:'#555',accent:'#829fc2'},layout:[],objective:{kind:'safe'},exits:[],map:{x:9000,y:9000}};
      w.loadZone('qa_healing');if(w.skyFront()!==null)throw Error('Weather must be sheltered');p.pos={x:900,y:760};w.actors=[p];w.walk=null;__game.step(120,25);
      w.actors=[p];w.projectiles=[];w.flashes=[];w.texts=[];w.zones=[];w.doodads=[];w.markDoodadsChanged();w.devIgnoreSkillAttributes=true;
      for(const [slot,id] of ['mend','greater_mending'].entries())if(__game.devGrantSkill(id,1,slot)!==slot)throw Error('Missing authored skill '+id);
      p.skills=p.skills.slice(0,2);if(p.skills[0].def.useTime!==0||p.skills[1].def.useTime!==1.1)throw Error('Authored timing changed');
      const rig=(regen=0)=>p.sheet.setSource('healing-ui-rig',[
        {stat:'life',kind:'override',value:1000},{stat:'mana',kind:'override',value:10000},
        ...['lifeRegenPct','manaRegen','energyShield','poise','critChance'].map(stat=>({stat,kind:'override',value:0})),
        ...['healPower','healTaken','attackSpeed','castSpeed','effectDuration','cooldownRecovery','proc_guarded_heart','procPower_guarded_heart'].map(stat=>({stat,kind:'override',value:1})),
        {stat:'lifeRegen',kind:'override',value:regen}]);rig();p.fillResources();p.lifeSealAt=undefined;p.reservedLife=0;
      __game.settings().lowLifePulse=false;Object.defineProperty(performance,'now',{value:()=>20000,configurable:true});
      let seed=0xc042,draws=0;Math.random=()=>{draws++;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};
      let edge=-1,frame=0,inLife=false,inHud=false,depth=0,active=null,orb=[],lifePaint=[],pulsePaint=[],labels=[];
      const start=w.time,requests=[],heals=[],dispatches=[],round=n=>Number(n.toFixed(6)),clock=()=>round(w.time-start);
      __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim:p.pos,held,edge:[...held]};}});
      const use=w.useSkill;w.useSkill=function(a,i,...args){const result=use.call(this,a,i,...args);if(a===p)requests.push({skill:i.def.id,result,frame,clock:clock()});return result;};
      const observed=p.onLifeHealed;p.onLifeHealed=function(amount,silent){heals.push({amount:round(amount),silent,life:round(this.life),ledger:round(this.healedSince),frame,clock:clock()});return observed?.call(this,amount,silent);};
      const proc=w.executeProc;w.executeProc=function(def,a,...args){if(a===p)dispatches.push({id:def.id,life:round(a.life),frame,clock:clock()});return proc.call(this,def,a,...args);};
      const hud=r.drawHudCluster;r.drawHudCluster=function(world,seat,...args){const before=inHud;inHud=seat.actor===p;try{return hud.call(this,world,seat,...args);}finally{inHud=before;}};
      const nativeOrb=r.drawOrb;r.drawOrb=function(...args){const before=inLife;inLife=inHud&&args[7]==='Life';if(inLife)orb.push(args.map(v=>typeof v==='number'?round(v):v));try{return nativeOrb.apply(this,args);}finally{inLife=before;}};
      const proto=CanvasRenderingContext2D.prototype,save=proto.save,restore=proto.restore,translate=proto.translate;
      proto.save=function(...args){if(inHud)depth++;return save.apply(this,args);};
      proto.restore=function(...args){if(inHud){if(active?.depth===depth)active=null;depth--;}return restore.apply(this,args);};
      proto.translate=function(x,y){if(inHud&&Math.abs(y-(r.uiH-170))<1e-6){active={depth,x:round(x),y:round(y),calls:[]};pulsePaint.push(active);}return translate.call(this,x,y);};
      for(const method of ['arc','fillRect','moveTo','lineTo','quadraticCurveTo','ellipse','fill','stroke','fillText']){const original=proto[method];proto[method]=function(...args){
        const row={method,args:args.map(v=>typeof v==='number'?round(v):v),color:method==='stroke'?this.strokeStyle:this.fillStyle,alpha:round(this.globalAlpha),width:round(this.lineWidth)};
        if(inLife)lifePaint.push(row);if(active)active.calls.push(row);if(method==='fillText')labels.push({text:String(args[0]),color:this.fillStyle});return original.apply(this,args);};}
      const step=(n=1)=>{for(let i=0;i<n;i++){orb=[];lifePaint=[];pulsePaint=[];labels=[];frame++;__game.step(1,25);}};
      const until=(test,label)=>{for(let i=0;i<1200;i++){if(test())return;step();}throw Error('Timeout: '+label);};
      const press=slot=>{const inst=p.skills[slot];until(()=>p.useLock<=0&&(p.cooldowns.get(inst.def.id)??0)<=0,'ready '+inst.def.id);edge=slot;step();};
      window.healingQA={step,press,rig,complete:()=>until(()=>!p.casting,'cast'),wound:life=>{p.life=life;step();},seal:level=>{p.lifeSealAt=level;},refill:()=>{p.refillLife();step();},
        hold:scale=>{if(!w.timeflow.hold({id:'healing-ui',kind:'skill',scale}))throw Error('Hold refused');},release:()=>w.timeflow.release('healing-ui'),
        blockEvent:()=>{p.procReadyAt.delete('guarded_heart');w.rollOwnProcs(p,'block',{});step();},
        capture:name=>({name,frame,clock:clock(),life:round(p.life),maximum:round(p.maxLife()),seal:p.lifeSealAt??null,ledger:round(p.healedSince),casting:p.casting?.inst.def.id??null,
          orb:[...orb],lifePaint:[...lifePaint],pulsePaint:pulsePaint.map(({depth,...row})=>row),labels:[...labels],
          cues:__game.snapshot().actors.find(a=>a.id===p.id).procCues?.map(c=>({...c,...(c.remaining===undefined?{}:{remaining:round(c.remaining)})}))??[],
          requests:[...requests],heals:[...heals],dispatches:[...dispatches],draws,fatal:__game.crash().fatal,image:r.canvas.toDataURL('image/png')})};step();
    })()`);
    const full=await capture('full');assert.equal(full.life,1000);
    await js('healingQA.wound(500)');const wounded=await capture('wounded');assert.equal(wounded.life,500);
    await js('healingQA.press(0)');const mend=await capture('mend-healed');assert.equal(mend.life,566);assert.equal(mend.casting,null);assert(mend.requests.at(-1).result);assert.equal(mend.heals.at(-1).silent,false);assert(mend.labels.some(l=>l.text==='+66'&&l.color==='#6fc06f'));
    await js('healingQA.press(1)');const casting=await capture('mending-casting');assert.equal(casting.casting,'greater_mending');assert.equal(casting.life,mend.life);
    await js('healingQA.complete()');const landed=await capture('mending-landed');assert.equal(landed.life,726);assert.equal(landed.casting,null);assert(landed.labels.some(l=>l.text==='+160'&&l.color==='#6fc06f'));
    await js('healingQA.wound(500);healingQA.seal(510);healingQA.press(0)');const clipped=await capture('sealed-clipped');assert.equal(clipped.life,510);assert(clipped.labels.some(l=>l.text.includes('sealed')));assert.equal(clipped.heals.at(-1).amount,10);
    await js('healingQA.refill()');const refill=await capture('refill-bypasses-seal');assert.equal(refill.life,1000);assert.equal(refill.seal,510);assert.equal(refill.heals.at(-1).silent,true);
    await js('healingQA.seal(undefined);healingQA.wound(500)');const beforeRegen=await capture('regen-start');
    await js('healingQA.rig(20);healingQA.step(4)');const regen=await capture('regen-growing');assert.equal(regen.life,502);assert(regen.heals.slice(beforeRegen.heals.length).every(h=>h.silent));
    await js('healingQA.hold(0);healingQA.step(8)');const paused=await capture('regen-paused');assert.equal(paused.life,regen.life);assert.equal(paused.clock,regen.clock);assert.deepEqual(paused.heals,regen.heals);
    await js('healingQA.release();healingQA.hold(.5);healingQA.step(8)');const slowed=await capture('regen-slowed');assert.equal(slowed.life,504);assert(Math.abs(slowed.clock-paused.clock-.1)<1e-6);
    await js('healingQA.release();healingQA.rig();healingQA.step(80);healingQA.wound(500)');await capture('proc-wounded');
    await js('healingQA.blockEvent()');const gain=await capture('proc-gained');assert.equal(gain.life,526);assert(gain.cues.some(c=>c.id==='guarded_heart'&&c.phase==='gain'));assert(gain.pulsePaint.some(p=>p.calls.some(c=>c.method==='stroke'&&c.alpha>0)));
    await js('healingQA.step(40)');const expired=await capture('proc-expired');assert.equal(expired.cues.length,0);assert.equal(expired.pulsePaint.length,0);
    await js('healingQA.wound(1000);healingQA.blockEvent()');const refused=await capture('proc-full');assert.equal(refused.life,1000);assert.equal(refused.cues.length,0);assert.equal(refused.pulsePaint.length,0);assert.equal(refused.dispatches.filter(d=>d.id==='guarded_heart').length,2);assert.deepEqual(refused.heals,expired.heals);
    assert.equal(stages.length,15);console.log('PASS: native healing input, clocks and controlled host events reach actual life-orb and proc-cue drawing');
  } finally {
    fs.writeFileSync(path.join(dir,'healing-ui.json'),JSON.stringify(stages,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();
  }
}).catch(error=>{console.error(error);app.exit(1);});
