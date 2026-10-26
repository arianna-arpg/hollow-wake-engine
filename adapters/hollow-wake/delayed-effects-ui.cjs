// Native input, authored skill/procs and actual frame paint; isolated browser only.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'delayed-profile-'+process.pid));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),180000),server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'delayed-saves-'+process.pid)});
 const win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}}),stages=[];
 const js=async code=>{const r=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(r?.qaError)throw Error(r.qaError);return r;};
 const capture=async name=>{const {image,...facts}=await js(`delayedQA.capture(${JSON.stringify(name)})`);assert.equal(facts.fatal,null);assert.equal(facts.enemyRequests,0);fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(image.split(',')[1],'base64'));stages.push(facts);return facts;};
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  await js(`(()=>{
   __game.hold(true);__game.account().ledger.prologue_lived=1;__game.devStartRun('cleric');__game.ui.hideAll();
   const w=__game.world(),p=w.player,r=__game.renderer;
   w.zoneMap.qa_delayed={id:'qa_delayed',name:'Delayed Effect Study',level:1,size:{w:1800,h:1400},seed:737,
    theme:{floor:'#30343a',grid:'#353940',border:'#444b55',obstacle:'#444',obstacleEdge:'#555',accent:'#829fc2'},layout:[],objective:{kind:'safe'},exits:[],map:{x:9000,y:9000}};
   w.loadZone('qa_delayed');p.pos={x:900,y:760};w.actors=[p];w.walk=null;__game.step(120,25);
   w.actors=[p];w.projectiles=[];w.flashes=[];w.texts=[];w.zones=[];w.doodads=[];w.markDoodadsChanged();
   const inst=p.skills[0];if(inst?.def.id!=='sanctified_strike'||inst.def.useTime!==.7)throw Error('Expected the unchanged Cleric starter skill');
   p.sheet.setSource('delayed-ui-rig',[
    {stat:'life',kind:'override',value:1000},{stat:'mana',kind:'override',value:1000},
    {stat:'lifeRegen',kind:'override',value:0},{stat:'manaRegen',kind:'override',value:0},
    {stat:'wardDecay',kind:'override',value:0},{stat:'critChance',kind:'override',value:0},
    {stat:'accuracy',kind:'override',value:1e6},{stat:'proc_radiant_reprisal',kind:'override',value:1},
    {stat:'proc_radiant_cascade',kind:'override',value:1}]);
   p.fillResources();p.life=500;p.ward=0;p.es=0;p.poise=0;
   const enemy=w.createMonster('zombie',1,'enemy');enemy.brain={move:{pace:0}};enemy.skills=[];enemy.spawnedAt=-1;enemy.pos={x:945,y:760};enemy.tier=p.tier;
   enemy.sheet.setSource('delayed-ui-target',[{stat:'life',kind:'override',value:1000000},{stat:'lifeRegen',kind:'override',value:0}]);enemy.life=1000000;w.actors.push(enemy);
   __game.settings().lowLifePulse=false;Object.defineProperty(performance,'now',{value:()=>20000,configurable:true});
   let seed=0xc040,draws=0;Math.random=()=>{draws++;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};
   let edge=false,frame=0,paint=[],active=null,enemyRequests=0;const start=w.time,requests=[],effects=[],heals=[];
   const round=n=>Number(n.toFixed(6)),clock=()=>round(w.time-start),select=f=>(f.radius===120&&f.color==='#ffe8b0'||f.radius===70&&f.color==='#ffd890')&&(f.maxLife===.5||f.maxLife===.3);
   __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>edge&&i===0),pressed=[...held];edge=false;return{dx:0,dy:0,aim:enemy.pos,held,edge:pressed};}});
   const use=w.useSkill;w.useSkill=function(a,i,...args){const result=use.call(this,a,i,...args);if(a===p)requests.push({skill:i.def.id,result,clock:clock()});if(a===enemy)enemyRequests++;return result;};
   const execute=w.executeProc;w.executeProc=function(proc,...args){const result=execute.call(this,proc,...args);if(proc.effect.type==='delayedBurst')effects.push({id:proc.id,clock:clock()});return result;};
   const heal=p.healBy;p.healBy=function(amount,silent){const rate=this.sheet.get('healTaken'),landed=heal.call(this,amount,silent);if(!silent)heals.push({amount,rate:round(rate),landed:round(landed),clock:clock()});return landed;};
   const draw=r.drawFlash;r.drawFlash=function(f){const prior=active;if(select(f)){active={radius:f.radius,color:f.color,phase:f.edgeFrac?'warning':'impact',life:round(f.life),calls:[]};paint.push(active);}else active=null;try{return draw.call(this,f);}finally{active=prior;}};
   for(const method of ['arc','stroke','fill']){const original=CanvasRenderingContext2D.prototype[method];CanvasRenderingContext2D.prototype[method]=function(...args){if(active)active.calls.push({method,alpha:round(this.globalAlpha),...(method==='arc'?{x:round(args[0]),y:round(args[1]),radius:round(args[2])}:{width:round(this.lineWidth)})});return original.apply(this,args);};}
   const step=(n=1)=>{for(let i=0;i<n;i++){paint=[];frame++;__game.step(1,25);}return w.pendingBursts.length;};
   const until=queued=>{for(let i=0;i<80;i++){step();if((w.pendingBursts.length>0)===queued)return;}throw Error('Delayed queue did not reach '+queued);};
   window.delayedQA={step,press:()=>{edge=true;step();},until,hold:scale=>{if(!w.timeflow.hold({id:'delayed-ui',scale,kind:'skill'}))throw Error('Hold refused');},release:()=>w.timeflow.release('delayed-ui'),depart:()=>{w.loadZone('lastlight');__game.ui.hideAll();step();},capture:name=>({
    name,frame,enemyRequests,clock:clock(),zone:w.zone.id,life:round(p.life),enemyLife:round(enemy.life),enemyPresent:w.actors.includes(enemy),mana:round(p.mana),casting:p.casting?.inst.def.id??null,
    pending:w.pendingBursts.map(b=>({due:round(b.when-w.time),radius:b.fx.radius,at:b.at,depth:b.depth,tier:b.tier})),
    flashes:w.flashes.filter(select).map(f=>({radius:f.radius,color:f.color,life:round(f.life),maxLife:f.maxLife,edgeFrac:f.edgeFrac??null})),
    paint,requests:[...requests],effects:[...effects],heals:[...heals],draws,fatal:__game.crash().fatal,image:r.canvas.toDataURL('image/png')})};
   step();
  })()`);
  const idle=await capture('idle');assert.equal(idle.pending.length,0);
  await js('delayedQA.press()');const casting=await capture('casting');assert.equal(casting.casting,'sanctified_strike');assert.equal(casting.requests.length,1);assert(casting.requests[0].result);assert.equal(casting.pending.length,0);
  await js('delayedQA.until(true)');const warning=await capture('warning');assert.equal(warning.pending.length,2);assert(warning.enemyLife<idle.enemyLife);assert.equal(warning.life,idle.life);
  const assertWarnings=facts=>{assert.equal(facts.paint.length,2);for(const f of facts.paint){assert.equal(f.phase,'warning');assert(f.calls.some(c=>c.method==='arc'&&Math.abs(c.radius-f.radius*.97)<1e-6));assert(f.calls.some(c=>c.method==='stroke'&&c.alpha>0&&Math.abs(c.width-Math.max(3,f.radius*.06))<1e-6));}};assertWarnings(warning);
  await js('delayedQA.hold(0);delayedQA.step(10)');const paused=await capture('paused');assert.equal(paused.clock,warning.clock);assert.deepEqual(paused.pending,warning.pending);assert.deepEqual(paused.flashes,warning.flashes);assert.equal(paused.life,warning.life);assert.equal(paused.enemyLife,warning.enemyLife);assertWarnings(paused);
  await js('delayedQA.release();delayedQA.hold(.5);delayedQA.step(8)');const slowed=await capture('slowed');assert(Math.abs(slowed.clock-warning.clock-.1)<1e-6);assert.equal(slowed.pending.length,2);assert.equal(slowed.life,warning.life);assertWarnings(slowed);
  await js('delayedQA.release();delayedQA.until(false)');const impact=await capture('impact');assert.equal(impact.pending.length,0);assert.deepEqual(impact.heals.slice(warning.heals.length).map(h=>h.amount),[4,8]);assert(impact.life>warning.life);assert(Math.abs(impact.life-warning.life-impact.heals.reduce((sum,h)=>sum+h.landed,0))<.000002);assert(impact.enemyLife<warning.enemyLife);assert.equal(impact.paint.length,2);for(const f of impact.paint){assert.equal(f.phase,'impact');assert(f.calls.some(c=>c.method==='fill'&&c.alpha>0));}
  await js('delayedQA.step(16)');const expired=await capture('expired');assert.equal(expired.flashes.length,0);assert.equal(expired.paint.length,0);
  await js('delayedQA.press();delayedQA.until(true)');const departing=await capture('departing-warning');assert.equal(departing.pending.length,2);assert.equal(departing.requests.length,2);assertWarnings(departing);
  await js('delayedQA.depart();delayedQA.step(32)');const departed=await capture('departed');assert.equal(departed.zone,'lastlight');assert.equal(departed.enemyPresent,false);assert.equal(departed.enemyLife,departing.enemyLife);assert.equal(departed.pending.length,0);assert.equal(departed.paint.length,0);assert.equal(departed.flashes.length,0);assert(departed.clock>departing.clock+.5);
  console.log('PASS: native casts earn two delayed warnings, pause/slow progression, painted impacts and zone-departure cancellation');
 }finally{fs.writeFileSync(path.join(dir,'delayed-effects-ui.json'),JSON.stringify(stages,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
