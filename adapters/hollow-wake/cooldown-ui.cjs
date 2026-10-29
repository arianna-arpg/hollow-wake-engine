// Actual renderer and World frames. Controlled state and resolved contacts are
// explicit; this course does not claim physical-input or device performance.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'cooldown-profile-'+process.pid));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
  const timeout=setTimeout(()=>{console.error('Cooldown renderer timed out');app.exit(1);},180000);
  const server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'cooldown-saves-'+process.pid)});
  const win=new BrowserWindow({show:false,width:1280,height:800,useContentSize:true,webPreferences:{offscreen:true,backgroundThrottling:false}});
  const stages=[],near=(a,b)=>assert(Math.abs(a-b)<1e-4,`${a} != ${b}`);
  const js=async code=>{const value=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(value?.qaError)throw Error(value.qaError);return value;};
  const clock=(facts,id)=>new Map(facts.clocks).get(id);
  const capture=async name=>{
    const {image,...facts}=await js(`cooldownQA.capture(${JSON.stringify(name)})`);stages.push(facts);
    fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(image.split(',')[1],'base64'),{flag:'wx'});
    assert.equal(facts.fatal,null);assert.equal(facts.slots.length,4);
    let expectedPaint=0;
    for(const slot of facts.slots){
      const {x,y,w}=slot.rect,k=facts.uiToCss,cd=clock(facts,slot.face);
      const paints=facts.shades.filter(row=>Math.abs(row.args[0]-(x/k+4))<1e-4&&Math.abs(row.args[1]-(y/k+4))<1e-4);
      if(cd!==undefined&&slot.total>0){expectedPaint++;assert.equal(paints.length,1,'Missing or duplicate cooldown shade: '+slot.face);const paint=paints[0];
        near(paint.args[2],w/k-8);near(paint.args[3],(w/k-8)*Math.max(0,Math.min(1,cd/slot.total)));near(paint.alpha,1);
      }else assert.equal(paints.length,0,'Stale cooldown shade: '+slot.face);
    }
    assert.equal(facts.shades.length,expectedPaint,'Unexpected cooldown paint');
    const cues=facts.cues.filter(c=>c.phase!=='stored').slice(-3);
    for(const cue of cues){
      assert.equal(cue.profile,'mend');const glyphs=facts.glyphs.filter(row=>row.color===cue.color);
      assert.equal(glyphs.length,3,'Expected three actual HUD proc glyphs');
      for(const glyph of glyphs){near(glyph.alpha,cue.remaining);near(glyph.path[0].args[2],2.45);near(glyph.path[0].args[3],3.5);}
    }
    assert.equal(facts.glyphs.length,cues.length*3,'Stale or missing proc glyph');return facts;
  };
  try{
    await win.loadURL('about:blank');win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');
    await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(performance,'now',{value:()=>20000,configurable:true});window.requestAnimationFrame=()=>0;"});
    await win.loadURL(server.url);assert.equal(await js('performance.now()'),20000);assert.equal(await js('requestAnimationFrame(()=>{})'),0);await js('__game.hydrated()');
    await js(`(()=>{
      __game.hold(true);__game.account().ledger.prologue_lived=1;__game.devStartRun('warrior');__game.ui.hideAll();
      const w=__game.world(),p=w.player,r=__game.renderer;
      w.zoneMap.qa_cooldown={id:'qa_cooldown',name:'Cooldown Study',level:1,sky:'sheltered',size:{w:1800,h:1400},seed:744,
        theme:{floor:'#30343a',grid:'#353940',border:'#444b55',obstacle:'#444',obstacleEdge:'#555',accent:'#829fc2'},layout:[],objective:{kind:'safe'},exits:[],map:{x:9000,y:9000}};
      w.loadZone('qa_cooldown');if(w.skyFront()!==null)throw Error('Expected sheltered weather');p.pos={x:900,y:760};w.actors=[p];w.walk=null;__game.step(120,25);
      w.actors=[p];w.projectiles=[];w.flashes=[];w.texts=[];w.zones=[];w.doodads=[];w.markDoodadsChanged();w.devIgnoreSkillAttributes=true;
      for(const [slot,id]of ['quickstep','firebolt','time_dilation','cleave'].entries())if(__game.devGrantSkill(id,1,slot)!==slot)throw Error('Missing authored skill '+id);
      p.skills=p.skills.slice(0,4);p.sheet=new p.sheet.constructor();
      p.sheet.setSource('cooldown-ui-rig',[{stat:'life',kind:'override',value:1000},...['mana','energyShield','poise'].map(stat=>({stat,kind:'override',value:100})),
        ...['lifeRegen','lifeRegenPct','manaRegen','esRechargeRate','poiseRegenPct','critChance'].map(stat=>({stat,kind:'override',value:0})),
        ...['attackSpeed','castSpeed','effectDuration','cooldownRecovery','healTaken'].map(stat=>({stat,kind:'override',value:1}))]);
      p.life=1000;p.mana=100;p.es=p.poise=40;p.esDelay=1000;p.reservedMana=0;p.useLock=0;
      p.statuses=[];p.buffs.clear();p.charges.clear();p.procCuePulses=[];p.procPopEvents=[];p.procReadyAt.clear();p.procFiredAt.clear();p.cooldowns.clear();p.cooldownTotals.clear();
      __game.settings().lowLifePulse=false;__game.settings().poolBars='always';
      let seed=0xc044,draws=0;Math.random=()=>{draws++;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};
      const round=n=>Number(n.toFixed(6)),copy=x=>JSON.parse(JSON.stringify(x,(_k,v)=>typeof v==='number'?round(v):v));
      let frame=0,edge=-1,inHud=false,canvasPath=[],shades=[],glyphs=[];
      const start=w.time,clock=()=>round(w.time-start),requests=[],dispatches=[],contacts=[],state=()=>({clocks:copy([...p.cooldowns]),totals:copy([...p.cooldownTotals])});
      __game.pilot({poll:(_actor,_world,dt)=>{if(dt!==.025)throw Error('Unexpected input delta: '+dt);const held=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim:p.pos,held,edge:[...held]};}});
      const update=p.update;p.update=function(dt,...args){if(![0,.0125,.025].includes(dt))throw Error('Unexpected actor delta: '+dt);return update.call(this,dt,...args);};
      const use=w.useSkill;w.useSkill=function(a,i,...args){const before=state(),result=use.call(this,a,i,...args);if(a===p)requests.push({id:i.def.id,before,after:state(),result,frame,clock:clock()});return result;};
      const proc=w.executeProc;w.executeProc=function(def,a,...args){const before=state(),result=proc.call(this,def,a,...args);if(a===p)dispatches.push({id:def.id,before,after:state(),frame,clock:clock()});return result;};
      const hud=r.drawHudCluster;r.drawHudCluster=function(world,seat,...args){const before=inHud;inHud=seat.actor===p;try{return hud.call(this,world,seat,...args);}finally{inHud=before;}};
      const proto=CanvasRenderingContext2D.prototype;
      for(const method of ['beginPath','closePath','arc','rect','moveTo','lineTo','quadraticCurveTo','ellipse','stroke','fillRect']){const original=proto[method];proto[method]=function(...args){
        if(inHud&&this.canvas===r.canvas){const color=String(method==='stroke'?this.strokeStyle:this.fillStyle),row={args:args.map(v=>typeof v==='number'?round(v):v),color,alpha:round(this.globalAlpha)};
          if(method==='beginPath')canvasPath=[];
          if(['closePath','arc','rect','moveTo','lineTo','quadraticCurveTo','ellipse'].includes(method))canvasPath.push({method,args:row.args});
          if(method==='fillRect'&&color==='rgba(0, 0, 0, 0.65)')shades.push(row);
          if(method==='stroke'&&this.lineWidth===1.5&&canvasPath.length===1&&canvasPath[0].method==='ellipse'&&Math.abs(canvasPath[0].args[2]-2.45)<.00001){const m=this.getTransform();glyphs.push({...row,path:copy(canvasPath),transform:[m.a,m.b,m.c,m.d,m.e,m.f].map(round)});}
        }return original.apply(this,args);};}
      const step=(n=1)=>{for(let i=0;i<n;i++){shades=[];glyphs=[];frame++;__game.step(1,25);}};
      const seedClocks=()=>{p.cooldowns=new Map([['quickstep',8],['firebolt',6],['cleave',4],['__unslotted',2]]);p.cooldownTotals=new Map([['quickstep',10],['firebolt',8],['cleave',4],['__unslotted',2]]);p.procCuePulses=[];};
      const apply=(fx,extra={})=>w.executeProc({id:'__cooldown_ui',name:'Clock study',color:'#78b9d4',trigger:'hit',effect:{type:'cooldown',...fx},...extra},p,p.skills[0],null,0);
      const press=slot=>{for(let i=0;p.useLock>0||p.casting;i++){if(i>1200)throw Error('Cast readiness timeout');step();}edge=slot;step();};
      window.cooldownQA={p,w,step,seedClocks,apply,press,
        hold:scale=>{if(!w.timeflow.hold({id:'cooldown-ui',kind:'skill',scale}))throw Error('Hold refused');},release:()=>w.timeflow.release('cooldown-ui'),
        blockContact:()=>{let other=w.actors.find(a=>a.id==='cooldown-attacker');if(!other){other=new p.constructor('cooldown-attacker','enemy',{x:935,y:760});other.sheet=new p.sheet.constructor();other.sheet.setBase('life',1000);other.fillResources();other.tier=p.tier;w.actors.push(other);}
          const before=state();w.resolveHit(other,p.skills[3],p,1,0);contacts.push({before,after:state()});},
        capture:name=>({name,frame,clock:clock(),...state(),internal:copy([...p.procReadyAt]),
          slots:p.skills.map((inst,i)=>{const face=w.slotFaceOf(p,inst),rect=r.hudSlotRects.find(row=>row.slot===i);return{id:inst.def.id,face:face.id,total:p.cooldownTotals.get(face.id)??face.cooldown,rect:{x:rect.x,y:rect.y,w:rect.w,h:rect.h}};}),
          uiToCss:r.uiToCss,shades,glyphs,cues:copy(__game.snapshot().actors.find(a=>a.id===p.id).procCues??[]),pulses:copy(p.procCuePulses),
          requests:copy(requests),dispatches:copy(dispatches),contacts:copy(contacts),mana:round(p.mana),casting:p.casting?.inst.def.id??null,draws,
          fatal:__game.crash().fatal,image:r.canvas.toDataURL('image/png')})};step();
    })()`);
    await capture('ready');await js('cooldownQA.seedClocks();cooldownQA.step()');const initial=await capture('stamped-clocks');near(clock(initial,'quickstep'),7.975);
    await js("cooldownQA.apply({seconds:1,fraction:.25,tags:['movement']});cooldownQA.step()");const filtered=await capture('movement-reduced');near(clock(filtered,'quickstep'),7.975-1-7.975*.25-.025);near(clock(filtered,'firebolt'),clock(initial,'firebolt')-.025);assert.deepEqual(filtered.totals,initial.totals);
    await js('cooldownQA.apply({seconds:1,skills:[]});cooldownQA.step()');const noMatch=await capture('empty-ids-no-gain');near(noMatch.pulses[0].left,filtered.pulses[0].left-.025);
    await js('cooldownQA.step(24)');const expired=await capture('cue-expired-clock-runs');assert.equal(expired.cues.length,0);assert(expired.shades.length>0);
    await js("cooldownQA.apply({seconds:1,tags:[]});cooldownQA.step()");const allTags=await capture('empty-tags-slotted-only');near(clock(allTags,'__unslotted'),clock(expired,'__unslotted')-.025);near(clock(allTags,'firebolt'),clock(expired,'firebolt')-1-.025);
    await js("cooldownQA.apply({reset:true,skills:['__unslotted']});cooldownQA.step()");const unslotted=await capture('unslotted-reset');assert.equal(clock(unslotted,'__unslotted'),undefined);assert.equal(unslotted.pulses.filter(c=>c.id==='__cooldown_ui').length,1);
    await js("cooldownQA.apply({reset:true,skills:['quickstep']});cooldownQA.step()");const reset=await capture('movement-ready');assert.equal(clock(reset,'quickstep'),undefined);assert.equal(new Map(reset.totals).get('quickstep'),10);
    await js("cooldownQA.p.procCuePulses=[];cooldownQA.apply({seconds:-20,skills:['firebolt']});cooldownQA.step()");const extended=await capture('extension-clamped-shade');assert(clock(extended,'firebolt')>8);assert.equal(extended.cues.length,0);
    await js("cooldownQA.apply({seconds:1,skills:['firebolt']},{announceName:false});cooldownQA.step()");const silent=await capture('silent-reduction');near(clock(silent,'firebolt'),clock(extended,'firebolt')-1-.025);assert.equal(silent.cues.length,0);
    await js('cooldownQA.seedClocks();cooldownQA.apply({reset:true,exceptSelf:true});cooldownQA.step()');const except=await capture('reset-except-trigger');near(clock(except,'quickstep'),7.975);assert.equal(except.clocks.length,1);
    await js('cooldownQA.seedClocks();cooldownQA.hold(0);cooldownQA.apply({seconds:1});cooldownQA.step()');const stopped=await capture('world-paused');near(clock(stopped,'quickstep'),7);
    await js('cooldownQA.step(8)');const stoppedLater=await capture('paused-cue-held');assert.deepEqual(stoppedLater.clocks,stopped.clocks);near(stoppedLater.clock,stopped.clock);assert.deepEqual(stoppedLater.pulses,stopped.pulses);
    await js('cooldownQA.release();cooldownQA.hold(.5);cooldownQA.step(8)');const slowed=await capture('half-speed-clocks');near(clock(slowed,'quickstep'),6.9);near(slowed.clock-stoppedLater.clock,.1);near(slowed.pulses[0].left,stoppedLater.pulses[0].left-.2);
    await js('cooldownQA.release();cooldownQA.step(16)');const resumed=await capture('resumed-cue-expired');assert.equal(resumed.cues.length,0);near(clock(resumed,'quickstep'),6.5);
    await js('cooldownQA.seedClocks();cooldownQA.press(2)');const dilation=await capture('authored-time-dilation');const request=dilation.requests.at(-1);assert.equal(request.id,'time_dilation');assert(request.result);const before=new Map(request.before.clocks),after=new Map(request.after.clocks);near(after.get('quickstep'),before.get('quickstep')-2-before.get('quickstep')*.25);near(after.get('time_dilation'),16);assert.equal(dilation.dispatches.length,resumed.dispatches.length);
    await js("cooldownQA.apply({reset:true,skills:['quickstep']});cooldownQA.press(0)");let quick=await capture('quickstep-input-start');assert(quick.requests.at(-1).result);assert.equal(quick.requests.at(-1).id,'quickstep');
    await js('for(let i=0;cooldownQA.p.casting;i++){if(i>100)throw Error("Quickstep timeout");cooldownQA.step();}');quick=await capture('quickstep-stamped');assert(clock(quick,'quickstep')>0);near(new Map(quick.totals).get('quickstep'),8);
    await js("cooldownQA.p.buffs.clear();cooldownQA.seedClocks();cooldownQA.p.sheet.setBase('proc_stalwart_rhythm',1);cooldownQA.p.sheet.setBase('blockChance',1);cooldownQA.step();for(let i=0;!cooldownQA.p.procReadyAt.has('stalwart_rhythm');i++){if(i>=30)throw Error('No earned block proc');cooldownQA.blockContact();}cooldownQA.step()");const earned=await capture('block-earned-reduction');const proc=earned.dispatches.find(d=>d.id==='stalwart_rhythm');assert(proc);for(const[id,value]of proc.before.clocks)near(new Map(proc.after.clocks).get(id),value-1);assert(earned.cues.some(c=>c.id==='stalwart_rhythm'));assert.deepEqual(proc.after.totals,proc.before.totals);
    await js('cooldownQA.blockContact();cooldownQA.step()');const gated=await capture('block-internal-cooldown');assert.equal(gated.dispatches.filter(d=>d.id==='stalwart_rhythm').length,1);near(clock(gated,'quickstep'),clock(earned,'quickstep')-.025);
    await js('cooldownQA.w.actors=[cooldownQA.p];cooldownQA.step(24)');const final=await capture('block-cue-expired');assert.equal(final.cues.length,0);
    console.log('PASS: cooldown renderer scenarios; '+stages.length+' stages');
  }finally{fs.writeFileSync(path.join(dir,'cooldown-ui.json'),JSON.stringify(stages,null,2)+'\n',{flag:'wx'});clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
