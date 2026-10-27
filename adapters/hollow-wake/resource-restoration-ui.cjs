// Actual game frames, skill input, and controlled attack contacts. Never writes expected fixtures.
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {startGameServer} = require('../launcher/server.cjs');
const dir = process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData', path.join(dir, 'restoration-profile-' + process.pid));
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const timeout = setTimeout(() => { console.error('Restoration renderer harness timed out'); app.exit(1); }, 180000);
  const server = await startGameServer({root: process.env.HOLLOW_WAKE_QA_DIST, savesDir: path.join(dir, 'restoration-saves-' + process.pid)});
  const win = new BrowserWindow({show: false, width: 1280, height: 800, useContentSize: true, webPreferences: {offscreen: true, backgroundThrottling: false}});
  const stages = [];
  const js = async code => {
    const value = await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);
    if (value?.qaError) throw Error(value.qaError); return value;
  };
  const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);
  const procPaint = (facts, id) => {
    const cue = facts.cues.find(c => c.id === id && c.phase === 'gain'); assert(cue);
    const glyphs = facts.strokes.filter(c => c.color === cue.color && c.width === 1.5 && c.path.length === 1 && c.path[0].method === 'ellipse');
    assert.equal(glyphs.length, 3);
    for (const glyph of glyphs) { near(glyph.alpha, cue.remaining); near(glyph.path[0].args[2], 2.45); near(glyph.path[0].args[3], 3.5); near(glyph.transform[5], 630); }
  };
  const capture = async name => {
    const {image, ...facts} = await js(`restorationQA.capture(${JSON.stringify(name)})`);
    stages.push(facts);
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(image.split(',')[1], 'base64'));
    assert.equal(facts.fatal, null); assert.equal(facts.manaOrb.length, 1);
    const orb = facts.manaOrb[0]; near(orb[3], facts.mana / facts.maxMana); near(orb[8], facts.reservedMana / facts.maxMana);
    const fill = facts.manaPaint.find(c => c.method === 'fillRect' && c.color === '#2858b8');
    assert(fill); near(fill.args[3], orb[2] * 2 * facts.mana / facts.maxMana);
    assert(facts.manaPaint.some(c => c.method === 'fillText' && c.args[0] === String(Math.ceil(facts.mana))));
    const band = facts.manaPaint.find(c => c.method === 'fillRect' && c.color === 'rgba(140, 140, 150, 0.55)');
    if (facts.reservedMana > 0) { assert(band); near(band.args[3], orb[2] * 2 * facts.reservedMana / facts.maxMana); }
    const arc = (color, width) => facts.strokes.find(c => c.color === color && c.width === width && c.path.length === 1 && c.path[0].method === 'arc');
    if (facts.es > 0 || facts.esRecharging) {
      const shield = arc(facts.esRecharging ? '#8af0f0' : '#5ad8d8', 4); assert(shield, 'shield arc');
      near(shield.path[0].args[4] - shield.path[0].args[3], Math.PI * 2 * Math.min(1, facts.es / facts.maxEs));
    }
    const over = facts.poise > facts.maxPoise + .25;
    const color = facts.poiseBroken ? 'rgba(216, 176, 106, 0.35)' : over ? '#f4d494' : '#d8b06a';
    const poise = arc(color, 3); assert(poise, 'poise arc');
    near(poise.path[0].args[4] - poise.path[0].args[3], Math.PI * 2 * Math.min(1, facts.poise / facts.maxPoise));
    if (over) { const crest = arc(color, 1.5); assert(crest, 'overcharge crest'); near(crest.path[0].args[2], poise.path[0].args[2] + 3); near(crest.path[0].args[4] - crest.path[0].args[3], Math.PI * 2 * Math.min(1, facts.poise / facts.maxPoise - 1)); }
    return facts;
  };
  try {
    // Start with an integral frame timestamp and suppress the ambient animation
    // pump before module bootstrap. Native __game.step drives every frame below.
    // A post-bootstrap clock override leaves the private `last` timestamp
    // fractional, changing rounding when it crosses binary exponent boundaries.
    await win.loadURL('about:blank');
    console.log('Restoration renderer: blank document initialized');
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Page.enable');
    await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: "Object.defineProperty(performance,'now',{value:()=>20000,configurable:true});window.requestAnimationFrame=()=>0;",
    });
    console.log('Restoration renderer: startup clock installed');
    await win.loadURL(server.url);
    assert.equal(await js('performance.now()'), 20000, 'Startup clock was not installed');
    assert.equal(await js('requestAnimationFrame(()=>{})'), 0, 'Ambient frame pump was not suppressed');
    await js('__game.hydrated()');
    console.log('Restoration renderer: game hydrated');
    await js(`(()=>{
      __game.hold(true);__game.account().ledger.prologue_lived=1;__game.devStartRun('warrior');__game.ui.hideAll();
      const w=__game.world(),p=w.player,r=__game.renderer;
      w.zoneMap.qa_restoration={id:'qa_restoration',name:'Resource Restoration Study',level:1,sky:'sheltered',size:{w:1800,h:1400},seed:743,
        theme:{floor:'#30343a',grid:'#353940',border:'#444b55',obstacle:'#444',obstacleEdge:'#555',accent:'#829fc2'},layout:[],objective:{kind:'safe'},exits:[],map:{x:9000,y:9000}};
      w.loadZone('qa_restoration');if(w.skyFront()!==null)throw Error('Weather must be sheltered');p.pos={x:900,y:760};w.actors=[p];w.walk=null;__game.step(120,25);
      w.actors=[p];w.projectiles=[];w.flashes=[];w.texts=[];w.zones=[];w.doodads=[];w.markDoodadsChanged();w.devIgnoreSkillAttributes=true;
      for(const [slot,id] of ['mend','cleave'].entries())if(__game.devGrantSkill(id,1,slot)!==slot)throw Error('Missing authored skill '+id);
      p.skills=p.skills.slice(0,2);p.sheet=new p.sheet.constructor();
      const rig=()=>p.sheet.setSource('restoration-ui-rig',[
        {stat:'life',kind:'override',value:1000},...['mana','energyShield','poise'].map(stat=>({stat,kind:'override',value:100})),
        ...['lifeRegen','lifeRegenPct','manaRegen','esRechargeRate','poiseRegenPct','critChance'].map(stat=>({stat,kind:'override',value:0})),
        ...['attackSpeed','castSpeed','effectDuration','cooldownRecovery','healTaken','poiseRearmAt'].map(stat=>({stat,kind:'override',value:1}))]);rig();
      p.life=1000;p.mana=p.es=p.poise=40;p.esDelay=1000;p.esRecharging=false;p.poiseBroken=false;p.reservedMana=0;
      p.gainEvents=[];p.restoreGains=[];p.procCuePulses=[];p.procPopEvents=[];p.restoreStreams=[];p.statuses=[];p.buffs.clear();p.charges.clear();
      __game.settings().lowLifePulse=false;__game.settings().poolBars='always';Object.defineProperty(performance,'now',{value:()=>20000,configurable:true});
      let seed=0xc043,draws=0;Math.random=()=>{draws++;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};
      const round=n=>Number(n.toFixed(6)),copy=x=>JSON.parse(JSON.stringify(x,(_k,v)=>typeof v==='number'?round(v):v));
      let edge=-1,frame=0,inHud=false,inMana=false,canvasPath=[],manaOrb=[],manaPaint=[],strokes=[],fills=[],labels=[];
      const start=w.time,clock=()=>round(w.time-start),requests=[],gains=[],restores=[],dispatches=[],contacts=[];
      const pools=()=>({life:round(p.life),mana:round(p.mana),es:round(p.es),poise:round(p.poise),esJustFilled:p.esJustFilled,poiseBroken:p.poiseBroken});
      __game.pilot({poll:(_actor,_world,dt)=>{if(dt!==.025)throw Error('Unexpected input frame delta: '+dt);const held=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim:p.pos,held,edge:[...held]};}});
      const update=p.update;p.update=function(dt,...args){if(![0,.0125,.025].includes(dt))throw Error('Unexpected actor frame delta: '+dt);return update.call(this,dt,...args);};
      const use=w.useSkill;w.useSkill=function(a,i,...args){const result=use.call(this,a,i,...args);if(a===p)requests.push({skill:i.def.id,result,frame,clock:clock()});return result;};
      for(const method of ['gainEs','gainPoise']){const original=p[method];p[method]=function(amount){const before=pools(),result=original.call(this,amount);gains.push({method,amount:round(amount),result:round(result),before,after:pools(),frame,clock:clock()});return result;};}
      const restore=w.applyRestore;w.applyRestore=function(a,fx,...args){const before=pools(),result=restore.call(this,a,fx,...args);if(a===p)restores.push({resource:fx.resource,amount:fx.amount,before,after:pools(),events:copy(p.gainEvents),feeding:copy(p.restoreGains),frame,clock:clock()});return result;};
      const proc=w.executeProc;w.executeProc=function(def,a,...args){const before=pools(),result=proc.call(this,def,a,...args);if(a===p)dispatches.push({id:def.id,before,after:pools(),frame,clock:clock()});return result;};
      const hud=r.drawHudCluster;r.drawHudCluster=function(world,seat,...args){const before=inHud;inHud=seat.actor===p;try{return hud.call(this,world,seat,...args);}finally{inHud=before;}};
      const orb=r.drawOrb;r.drawOrb=function(...args){const before=inMana;inMana=inHud&&args[7]==='Mana';if(inMana)manaOrb.push(args.map(v=>typeof v==='number'?round(v):v));try{return orb.apply(this,args);}finally{inMana=before;}};
      const proto=CanvasRenderingContext2D.prototype;
      for(const method of ['beginPath','closePath','arc','rect','moveTo','lineTo','quadraticCurveTo','ellipse','stroke','fill','fillRect','fillText']){const original=proto[method];proto[method]=function(...args){
        if(inHud&&this.canvas===r.canvas){const row={method,args:args.map(v=>typeof v==='number'?round(v):v),color:String(method==='stroke'?this.strokeStyle:this.fillStyle),alpha:round(this.globalAlpha),width:round(this.lineWidth)};
          if(method==='beginPath')canvasPath=[];
          if(['closePath','arc','rect','moveTo','lineTo','quadraticCurveTo','ellipse'].includes(method))canvasPath.push({method,args:row.args});
          if(inMana)manaPaint.push(row);if(method==='fillText')labels.push({text:String(args[0]),color:String(this.fillStyle)});
          if(method==='stroke'||method==='fill'){const m=this.getTransform(),paint={...row,path:copy(canvasPath),transform:[m.a,m.b,m.c,m.d,m.e,m.f].map(round)};(method==='stroke'?strokes:fills).push(paint);}
        }return original.apply(this,args);};}
      const step=(n=1)=>{for(let i=0;i<n;i++){manaOrb=[];manaPaint=[];strokes=[];fills=[];labels=[];frame++;__game.step(1,25);}};
      const press=slot=>{const inst=p.skills[slot];for(let i=0;p.useLock>0||(p.cooldowns.get(inst.def.id)??0)>0;i++){if(i>=1200)throw Error('Skill readiness timeout');step();}edge=slot;step();};
      window.restorationQA={p,w,step,press,rig,hold:scale=>{if(!w.timeflow.hold({id:'restoration-ui',kind:'skill',scale}))throw Error('Hold refused');},release:()=>w.timeflow.release('restoration-ui'),
        restore:fx=>w.applyRestore(p,fx),
        blockContact:()=>{const other=new p.constructor('restoration-attacker','enemy',{x:935,y:760});other.sheet=new p.sheet.constructor();other.sheet.setBase('life',1000);other.fillResources();other.tier=p.tier;
          w.actors.push(other);p.sheet.setBase('proc_relic_guard_refrain',1);p.sheet.setBase('blockChance',1);
          for(let i=0;!dispatches.some(d=>d.id==='relic_guard_refrain');i++){if(i>=30)throw Error('No block proc');const before=pools();w.resolveHit(other,p.skills[1],p,1,0);contacts.push({before,after:pools()});}
          w.actors=[p];step();},
        capture:name=>({name,frame,clock:clock(),...pools(),maxMana:round(p.maxMana()),maxEs:round(p.maxEs()),maxPoise:round(p.maxPoise()),reservedMana:round(p.reservedMana),esDelay:round(p.esDelay),esRecharging:p.esRecharging,poiseDelay:round(p.poiseDelay),
          streams:copy(p.restoreStreams),feeding:copy(p.restoreGains),cues:copy(__game.snapshot().actors.find(a=>a.id===p.id).procCues??[]),
          manaOrb,manaPaint,strokes,fills,labels,requests:copy(requests),gains:copy(gains),restores:copy(restores),dispatches:copy(dispatches),contacts:copy(contacts),draws,
          fatal:__game.crash().fatal,image:r.canvas.toDataURL('image/png')})};step();
    })()`);
    const initial=await capture('initial');assert.equal(initial.mana,40);assert.equal(initial.es,40);assert.equal(initial.poise,40);
    await js('restorationQA.p.reservedMana=40;restorationQA.step()');await capture('mana-reserved');
    await js("restorationQA.restore({resource:'mana',amount:60});restorationQA.step()");const mana=await capture('mana-capped');assert.equal(mana.mana,60);assert.equal(mana.restores.at(-1).events.at(-1).n,20);assert(mana.feeding.some(g=>g.resource==='mana'));assert(mana.fills.some(c=>c.color==='#91b9f3'&&c.alpha>0));
    await js('restorationQA.step(20)');const expired=await capture('mana-cue-expired');assert.equal(expired.feeding.length,0);assert(!expired.fills.some(c=>c.color==='#91b9f3'));
    await js("restorationQA.restore({resource:'mana',amount:20});restorationQA.step()");const full=await capture('mana-full-no-cue');assert.equal(full.mana,60);assert.equal(full.feeding.length,0);assert.equal(full.restores.at(-1).events.length,0);
    await js("restorationQA.restore({resource:'mana',amount:-10});restorationQA.step()");const drain=await capture('signed-mana-restoration');assert.equal(drain.mana,50);assert.equal(drain.feeding.length,0);
    // Native stat metadata floors recharge at 1%/second even for a zero override.
    await js("restorationQA.p.esDelay=5;restorationQA.restore({resource:'es',amount:20,resetEsDelay:true});restorationQA.step()");const shield=await capture('shield-reset-recharge');assert.equal(shield.restores.at(-1).after.es,60);assert.equal(shield.es,60.025);assert.equal(shield.esRecharging,true);assert(shield.feeding.some(g=>g.resource==='es'));assert(shield.strokes.filter(c=>c.color==='#9ce5e8'&&c.alpha>0).length===6);assert(shield.strokes.some(c=>c.color==='rgba(90, 216, 216, 0.22)'&&c.width===4));
    await js("restorationQA.p.sheet.setSource('recharge',[{stat:'esRechargeRate',kind:'override',value:.2}]);restorationQA.step(40)");const recharged=await capture('shield-natural-recharge');assert.equal(recharged.es,80.025);assert.equal(recharged.gains.length,shield.gains.length);
    await js("restorationQA.p.sheet.removeSource('recharge');restorationQA.p.es=40;restorationQA.p.esDelay=1000;restorationQA.p.esRecharging=false;restorationQA.step()");await capture('shield-stream-start');
    await js("restorationQA.p.restoreStreams.push({resource:'es',remaining:30,perSec:15});restorationQA.step(40)");const flowing=await capture('shield-stream-growing');assert.equal(flowing.es,55);
    await js('restorationQA.hold(0);restorationQA.step(8)');const paused=await capture('shield-stream-paused');assert.equal(paused.es,55);assert.equal(paused.clock,flowing.clock);assert.deepEqual(paused.gains,flowing.gains);
    await js('restorationQA.release();restorationQA.hold(.5);restorationQA.step(40)');const slow=await capture('shield-stream-slowed');assert.equal(slow.es,62.5);near(slow.clock-paused.clock,.5);
    await js('restorationQA.release();restorationQA.step(20)');const ended=await capture('shield-stream-complete');assert.equal(ended.es,70);assert.equal(ended.streams.length,0);
    await js('restorationQA.p.poiseBroken=true;restorationQA.p.poiseDelay=5;restorationQA.step()');const broken=await capture('poise-broken');assert.equal(broken.poiseBroken,true);
    await js("restorationQA.restore({resource:'poise',amount:60});restorationQA.step()");const rearmed=await capture('poise-fed-rearmed');assert.equal(rearmed.restores.at(-1).after.poiseBroken,true);assert.equal(rearmed.poise,100);assert.equal(rearmed.poiseBroken,false);
    await js("restorationQA.p.sheet.setBase('poiseOvercharge',.5);restorationQA.restore({resource:'poise',amount:100});restorationQA.step()");const crest=await capture('poise-overcharged');assert.equal(crest.restores.at(-1).after.poise,150);assert.equal(crest.poise,149.5);
    await js("restorationQA.p.reservedMana=0;restorationQA.p.mana=20;restorationQA.p.sheet.setBase('proc_desperate_reserves',1);restorationQA.step()");await capture('spell-low-mana');
    await js('restorationQA.press(0)');const cast=await capture('spell-earned-mana');assert.equal(cast.mana,21);assert(cast.requests.at(-1).result);assert(cast.dispatches.some(d=>d.id==='desperate_reserves'));assert(cast.cues.some(c=>c.id==='desperate_reserves'&&c.phase==='gain'));procPaint(cast,'desperate_reserves');
    await js('restorationQA.p.poise=40;restorationQA.step()');await capture('block-contact-ready');
    await js('restorationQA.blockContact()');const block=await capture('block-earned-poise');assert(block.contacts.length>0);assert(block.dispatches.some(d=>d.id==='relic_guard_refrain'));assert(block.cues.some(c=>c.id==='relic_guard_refrain'&&c.phase==='gain'));const restored=block.dispatches.find(d=>d.id==='relic_guard_refrain');near(restored.after.poise-restored.before.poise,6);procPaint(block,'relic_guard_refrain');
    console.log('PASS: resource restoration renderer scenarios; '+stages.length+' stages');
  } finally {
    fs.writeFileSync(path.join(dir,'restoration-ui.json'),JSON.stringify(stages,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();
  }
}).catch(error=>{console.error(error);app.exit(1);});
