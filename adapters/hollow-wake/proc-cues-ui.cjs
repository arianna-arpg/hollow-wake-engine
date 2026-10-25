// Run probe_proccues and build first. Hidden renderer and disposable saves.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { startGameServer } = require('../launcher/server.cjs');
const dir = path.join(__dirname, 'reports'); fs.mkdirSync(dir, { recursive: true });
const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'proc-catalog.json'), 'utf8'));
const logfile = path.join(dir, 'proc-cues-ui.log'); fs.writeFileSync(logfile, 'START\n');
const log = v => fs.appendFileSync(logfile, JSON.stringify(v) + '\n');
const save = (name, url) => fs.writeFileSync(path.join(dir, 'proc-' + name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
app.setPath('userData', path.join(dir, 'proc-cues-profile-' + process.pid));
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const timeout = setTimeout(() => { log('TIMEOUT'); app.exit(1); }, 120000);
  const server = await startGameServer({ root: path.resolve(__dirname, '../dist'), savesDir: path.join(dir, 'proc-cues-saves-' + process.pid) });
  const win = new BrowserWindow({ show: false, width: 1500, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const run = async code => {
    const r = await win.webContents.executeJavaScript(`(()=>{try{return{value:eval(${JSON.stringify(code)})}}catch(e){return{error:e.stack??String(e)}}})()`);
    if (r.error) throw Error(r.error); return r.value;
  };
  async function capture(name) {
    const r = await run(`(()=>{
      const w=__game.world(),r=__game.renderer,labels=[],original=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){labels.push(String(text));return original.call(this,text,...args)};
      try{r.render(w)}finally{CanvasRenderingContext2D.prototype.fillText=original}
      const full=r.canvas.toDataURL('image/png'),canvas=document.createElement('canvas');
      const oldCanvas=r.canvas,oldCtx=r.ctx;canvas.width=oldCanvas.width;canvas.height=oldCanvas.height;
      r.canvas=canvas;r.ctx=canvas.getContext('2d');let hud;
      try{r.drawHud(w);hud=canvas.toDataURL('image/png')}finally{r.canvas=oldCanvas;r.ctx=oldCtx}
      return{full,hud,labels,fatal:__game.crash().fatal,rows:__game.snapshot().actors.find(a=>a.id===w.player.id).procCues??[],
        pulses:w.player.procCuePulses.length,runes:w.player.runes.length,fields:w.zones.length,buffs:w.player.buffs.size,ward:w.player.ward};
    })()`);
    const { full, hud, ...facts } = r; log({ name, ...facts }); save(name, full); save(name + '-hud', hud);
    assert.equal(r.fatal, null);
    assert.ok(!r.labels.some(t => /^(Hot Streak!|Reprisal!|Static Shrapnel!|Conflagration!|Hemorrhage POPS!)$/.test(t)));
    return r;
  }
  try {
    await win.loadURL(server.url);
    await run("window.requestAnimationFrame=()=>0;Object.defineProperty(navigator,'getGamepads',{value:()=>[]});__game.account().ledger.prologue_lived=1;__game.devStartRun('warrior');__game.ui.hideAll();__game.step(360);void 0;");
    await run(`(()=>{
      const w=__game.world(),p=w.player,base=p.skills.find(Boolean);
      w.zoneMap.qa_proc={id:'qa_proc',name:'Proving Ground',level:12,size:{w:1800,h:1400},seed:737,
        theme:{floor:'#30343a',grid:'#353940',border:'#444b55',obstacle:'#444',obstacleEdge:'#555',accent:'#829fc2'},layout:[],objective:{kind:'safe'},exits:[],map:{x:9000,y:9000}};
      w.loadZone('qa_proc');p.pos={x:900,y:760};__game.step(240);
      w.actors=[p];w.projectiles=[];w.flashes=[];w.texts=[];w.zones=[];w.doodads=[];w.walk=null;w.markDoodadsChanged();
      window.procSkills=Object.fromEntries(${JSON.stringify(catalog.skills)}.map(def=>[def.id,{...base,sockets:[],state:{},treeNodes:[],def:{...def,requirements:undefined,useTime:0}}]));
      window.procDefs=Object.fromEntries(${JSON.stringify(catalog.procs)}.map(def=>[def.id,def]));
      p.skills=Object.values(procSkills);p.buffs.clear();p.runes=[];p.statuses=[];p.procCuePulses=[];
      p.sheet.setSource('proc-rig',[{stat:'life',kind:'override',value:1000},{stat:'mana',kind:'override',value:10000},{stat:'critChance',kind:'override',value:0}]);p.fillResources();
      window.procPress=(id)=>{p.casting=null;p.useLock=0;p.reflexLock=0;p.cooldowns.clear();if(!w.useSkill(p,procSkills[id],{x:1060,y:760}))throw Error('refused '+id)};
      __game.settings().lowLifePulse=false;Object.defineProperty(performance,'now',{value:()=>20000,configurable:true});
    })()`);
    const idle = await capture('idle');
    // Grant and low-life setup are explicit. World.update earns the edge,
    // selects the authored proc and delivers its effect; no executeProc call.
    await run("(()=>{const w=__game.world(),p=w.player;p.sheet.setSource('sdk-ward-ui',[{stat:'proc_desperate_ward',kind:'flat',value:1}]);w.update(.01);p.life=100;})()");
    const wardBefore=await capture('ward-before');assert.equal(wardBefore.ward,0);
    const nativeWard=await run("(()=>{const w=__game.world(),p=w.player,random=Math.random,own=w.rollOwnProcs;let draws=0,lowLifeEvents=0;Math.random=()=>{draws++;return 0;};w.rollOwnProcs=function(owner,trigger,event){if(owner===p&&trigger==='condition'&&event?.condition==='lowLife')lowLifeEvents++;return own.call(this,owner,trigger,event);};try{w.update(.05);}finally{Math.random=random;w.rollOwnProcs=own;}return{ward:p.ward,maxLife:p.maxLife(),cooldownRemaining:Number(((p.procReadyAt.get('desperate_ward')??0)-w.time).toFixed(6)),lowLifeEvents,draws};})()");
    const wardEarned=await capture('ward-earned');assert.equal(nativeWard.ward,300);assert.equal(nativeWard.maxLife,1000);assert.equal(nativeWard.cooldownRemaining,20);assert.equal(nativeWard.lowLifeEvents,1);assert.equal(wardEarned.ward,300);assert(wardEarned.labels.includes('300'));assert.notEqual(wardBefore.hud,wardEarned.hud);
    fs.writeFileSync(path.join(dir,'native-ward.json'),JSON.stringify({...nativeWard,wardLabel:true,changedHud:true},null,2)+'\n');
    await run("(()=>{const w=__game.world(),p=w.player;p.sheet.setSource('sdk-ward-ui',[]);p.life=p.maxLife();p.ward=0;p.procCuePulses=[];w.flashes=[];w.texts=[];w.update(.01);})()");

    await run(`(()=>{
      const w=__game.world(),p=w.player;w.executeProc(procDefs.hot_streak,p,procSkills.firebolt,null);w.executeProc(procDefs.reprisal,p,procSkills.cleave,null);
      p.addBuff({type:'buff',id:'cold_payload',duration:8,maxStacks:3,stacksOnApply:3,mods:[],nextHit:{status:'chill'}});
      p.runes=['rime','arc','ember'];p.procCuePulses=[];
      for(const [i,profile] of ['fire','cold','lightning','chaos','physical'].entries()){
        const e=w.createMonster('zombie',1,'enemy');e.spawnedAt=-1;e.pos={x:700+i*100,y:600};e.addBuff({type:'buff',id:'material',duration:8,maxStacks:3,stacksOnApply:3,mods:[],storedCue:{profile},consumeOn:{on:'hit'}});w.actors.push(e);
      }
    })()`);
    const prepared = await capture('prepared'); assert.ok(prepared.rows.length >= 6); assert.notEqual(prepared.hud, idle.hud);
    await run("__game.world().player.consumeBuffStacks('cold_payload',1);__game.world().player.consumeBuffStacks('reprisal',1);void 0;");
    const spent = await capture('spent'); assert.ok(spent.rows.some(r => r.phase === 'release')); assert.notEqual(spent.hud, prepared.hud);
    await run("const w=__game.world(),p=w.player;p.applyStatus('hemorrhage',10,1,'qa');p.applyStatus('hemorrhage',5,1,'qa');w.update(0.01);void 0;");
    assert.ok((await capture('pop')).rows.some(r => r.phase === 'pop'));
    await run("__game.world().zone.theme.floor='#cbc3af';__game.world().zone.theme.grid='#c4bca8';__game.renderer.ground.zoneRef=null;for(let i=0;i<20;i++)__game.renderer.render(__game.world());void 0;");
    win.setContentSize(1000, 720); await new Promise(r => setTimeout(r, 150)); await run("window.dispatchEvent(new Event('resize'));void 0;");
    await capture('bright-small');
    await run("__game.world().player.runes=['ember','ember','ember'];procPress('invocation');void 0;");
    const invoked = await capture('invoked'); assert.equal(invoked.runes, 0); assert.ok(invoked.fields > 0 && invoked.rows.some(r => r.phase === 'invoke'));
    await run("const p=__game.world().player;for(const id of [...p.buffs.keys()])p.removeBuff(id);p.updateTimers(1);void 0;");
    assert.equal((await capture('expired')).rows.length, 0);
    await run("const p=__game.world().player;p.addBuff({type:'buff',id:'mirror_payload',duration:8,maxStacks:3,stacksOnApply:3,mods:[],nextHit:{status:'chill'}});const snap=__game.snapshot();p.buffs.clear();__game.applySnap(snap);void 0;");
    const mirrored=await capture('mirrored');assert.equal(mirrored.buffs,0);assert.ok(mirrored.rows.some(r=>r.id==='mirror_payload'&&r.count===3));assert.ok(mirrored.labels.includes('3'));
    log('PASS: stored materials and actual release/pop/invocation, matching host/mirror HUD, dark/bright and compact rendering');
    clearTimeout(timeout); win.destroy(); server.server.close(); app.exit(0);
  } catch (e) { log(e.stack ?? String(e)); clearTimeout(timeout); win.destroy(); server.server.close(); app.exit(1); }
});
