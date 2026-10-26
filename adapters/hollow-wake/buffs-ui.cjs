// Native input and frame-driven buff observations. Disposable browser only.
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {startGameServer} = require('../launcher/server.cjs');
const dir = process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData', path.join(dir, 'buff-profile-' + process.pid));
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const timeout = setTimeout(() => app.exit(1), 180000);
  const server = await startGameServer({root: process.env.HOLLOW_WAKE_QA_DIST, savesDir: path.join(dir, 'buff-saves-' + process.pid)});
  const win = new BrowserWindow({show: false, width: 1280, height: 800, useContentSize: true, webPreferences: {offscreen: true, backgroundThrottling: false}}), stages = [];
  const js = async code => {
    const result = await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);
    if (result?.qaError) throw Error(result.qaError); return result;
  };
  const capture = async name => {
    const {image, ...facts} = await js(`buffQA.capture(${JSON.stringify(name)})`);
    assert.equal(facts.fatal, null); assert.equal(facts.enemyRequests, 0);
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(image.split(',')[1], 'base64'));
    stages.push(facts); return facts;
  };
  const hover = async id => {
    const point = await js(`buffQA.hoverPoint(${JSON.stringify(id)})`);
    await js(`__game.renderer.canvas.dispatchEvent(new MouseEvent('mousemove',{clientX:${point.x},clientY:${point.y},bubbles:true}));buffQA.step()`);
  };
  const buff = (facts, id) => facts.buffs.find(b => b.id === id);
  try {
    await win.loadURL(server.url); await js('__game.hydrated()');
    await js(`(()=>{
      __game.hold(true);__game.account().ledger.prologue_lived=1;__game.devStartRun('warrior');__game.ui.hideAll();
      const w=__game.world(),p=w.player,r=__game.renderer;
      w.zoneMap.qa_buffs={id:'qa_buffs',name:'Buff Lifecycle Study',level:1,sky:'sheltered',size:{w:1800,h:1400},seed:737,
        theme:{floor:'#30343a',grid:'#353940',border:'#444b55',obstacle:'#444',obstacleEdge:'#555',accent:'#829fc2'},layout:[],objective:{kind:'safe'},exits:[],map:{x:9000,y:9000}};
      w.loadZone('qa_buffs');if(w.skyFront()!==null)throw Error('Test arena must shelter weather');p.pos={x:900,y:760};w.actors=[p];w.walk=null;__game.step(120,25);
      w.actors=[p];w.projectiles=[];w.flashes=[];w.texts=[];w.zones=[];w.doodads=[];w.markDoodadsChanged();w.devIgnoreSkillAttributes=true;
      for(const [slot,id] of ['war_cry','deep_carve','flame_imbuement'].entries())if(__game.devGrantSkill(id,1,slot)!==slot)throw Error('Missing native skill '+id);
      if(p.skills[0].def.useTime!==.5||p.skills[1].def.useTime!==.6||p.skills[2].def.useTime!==.4)throw Error('Authored timing changed');
      p.sheet.setSource('buff-ui-rig',[
        ...['life','mana'].map(stat=>({stat,kind:'override',value:10000})),
        ...['lifeRegen','manaRegen','energyShield','poise','critChance'].map(stat=>({stat,kind:'override',value:0})),
        ...['attackSpeed','castSpeed','effectDuration','cooldownRecovery'].map(stat=>({stat,kind:'override',value:1})),
        {stat:'accuracy',kind:'override',value:1e6}]);p.fillResources();
      const enemy=w.createMonster('zombie',1,'enemy');enemy.brain={move:{pace:0}};enemy.skills=[];enemy.spawnedAt=-1;enemy.pos={x:945,y:760};enemy.tier=p.tier;
      enemy.sheet.setSource('buff-ui-target',[{stat:'life',kind:'override',value:1000000},{stat:'lifeRegen',kind:'override',value:0}]);enemy.life=1000000;w.actors.push(enemy);
      __game.settings().lowLifePulse=false;Object.defineProperty(performance,'now',{value:()=>20000,configurable:true});
      let seed=0xc041,draws=0;Math.random=()=>{draws++;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};
      let edge=-1,frame=0,enemyRequests=0,inHud=false,depth=0,active=null,paint=[],readout=[],pips=[];
      const start=w.time,requests=[],events=[],round=n=>Number(n.toFixed(6)),clock=()=>round(w.time-start);
      const state=()=>[...p.buffs].map(([id,b])=>({id,stacks:b.stacks,remaining:round(b.remaining),expiries:b.expiries?.map(round)??null}));
      __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim:enemy.pos,held,edge:[...held]};}});
      const use=w.useSkill;w.useSkill=function(a,i,...args){const result=use.call(this,a,i,...args);if(a===p)requests.push({skill:i.def.id,result,frame,clock:clock()});if(a===enemy)enemyRequests++;return result;};
      const grant=p.addBuff;p.addBuff=function(...args){const result=grant.apply(this,args);events.push({kind:'grant',frame,id:args[0].id,buffs:state()});return result;};
      const spend=p.consumeBuffStacks;p.consumeBuffStacks=function(...args){const result=spend.apply(this,args);events.push({kind:'spend',frame,id:args[0],count:args[1]??1,buffs:state()});return result;};
      const hud=r.drawHudCluster;r.drawHudCluster=function(world,seat,...args){const before=inHud;inHud=seat.actor===p;try{return hud.call(this,world,seat,...args);}finally{inHud=before;}};
      const proto=CanvasRenderingContext2D.prototype,save=proto.save,restore=proto.restore,translate=proto.translate,text=proto.fillText,rect=proto.fillRect;
      proto.save=function(...args){if(inHud)depth++;return save.apply(this,args);};
      proto.restore=function(...args){if(inHud){if(active?.depth===depth)active=null;depth--;}return restore.apply(this,args);};
      proto.translate=function(x,y){if(inHud&&(Math.abs(y-(r.uiH-127))<1e-6||Math.abs(y-(r.uiH-170))<1e-6)){active={depth,kind:Math.abs(y-(r.uiH-127))<1e-6?'stored':'pulse',x:round(x),y:round(y),calls:[]};paint.push(active);}return translate.call(this,x,y);};
      proto.fillText=function(value,x,y,...rest){if(inHud&&this.font==='12px Verdana'&&['#f0d99c','#d8d4c8'].includes(this.fillStyle))readout.push({text:String(value),x:round(x),y:round(y),color:this.fillStyle});if(inHud&&Math.abs(y-(r.uiH-134))<1e-6)pips.push({text:String(value),x:round(x),y:round(y)});return text.call(this,value,x,y,...rest);};
      proto.fillRect=function(...args){if(inHud&&this.fillStyle==='#c8a84b'&&args[2]===10&&args[3]===10&&Math.abs(args[1]-(r.uiH-132))<1e-6)paint.push({kind:'plain',x:round(args[0]),y:round(args[1]),width:10,height:10});if(active)active.calls.push({method:'fillRect',args:args.map(round),color:this.fillStyle,alpha:round(this.globalAlpha)});return rect.apply(this,args);};
      for(const method of ['moveTo','lineTo','quadraticCurveTo','ellipse','fill','stroke']){const original=proto[method];proto[method]=function(...args){if(active)active.calls.push({method,args:args.map(v=>typeof v==='number'?round(v):v),color:method==='stroke'?this.strokeStyle:this.fillStyle,alpha:round(this.globalAlpha),width:round(this.lineWidth)});return original.apply(this,args);};}
      const step=(n=1)=>{for(let i=0;i<n;i++){paint=[];readout=[];pips=[];frame++;__game.step(1,25);}};
      const until=(test,label)=>{for(let i=0;i<1200;i++){if(test())return;step();}throw Error('Timeout: '+label);};
      const press=slot=>{const inst=p.skills[slot];until(()=>p.useLock<=0&&(p.cooldowns.get(inst.def.id)??0)<=0,'ready '+inst.def.id);edge=slot;step();};
      window.buffQA={step,press,complete:()=>until(()=>!p.casting,'cast'),waitFor:(id,count)=>until(()=>count===0?!p.buffs.has(id):p.buffs.get(id)?.stacks===count,id+' '+count),
        hold:scale=>{if(!w.timeflow.hold({id:'buff-ui',kind:'skill',scale}))throw Error('Hold refused');},release:()=>w.timeflow.release('buff-ui'),
        hoverPoint:id=>{const index=[...p.buffs.keys()].indexOf(id),slot=r.hudSlotRects.find(s=>s.slot===0);if(index<0||!slot)throw Error('Missing buff hover target '+id);return{x:slot.x+(index*14+5)*r.uiToCss,y:slot.y-35*r.uiToCss};},
        capture:name=>({name,frame,clock:clock(),buffs:state(),casting:p.casting?.inst.def.id??null,life:round(p.life),mana:round(p.mana),enemyLife:round(enemy.life),enemyRequests,
          attackDamage:round(p.sheet.get('damage',new Set(['attack']))),attackFire:round(p.sheet.get('addedFire',new Set(['attack']))),
          cues:__game.snapshot().actors.find(a=>a.id===p.id).procCues?.map(c=>({...c,...(c.remaining===undefined?{}:{remaining:round(c.remaining)})}))??[],
          readout:[...readout],pips:[...pips],paint:paint.map(({depth,...row})=>row),requests:[...requests],events:[...events],draws,fatal:__game.crash().fatal,image:r.canvas.toDataURL('image/png')})};step();
    })()`);
    const idle=await capture('idle');assert.equal(idle.buffs.length,0);
    await js('buffQA.press(0)');const casting=await capture('shared-casting');assert.equal(casting.casting,'war_cry');assert.equal(casting.buffs.length,0);assert(casting.requests.at(-1).result);
    await js('buffQA.complete()');await hover('war_cry');const gained=await capture('shared-gained');assert(gained.readout.some(r=>r.text.startsWith('war cry')));assert.equal(buff(gained,'war_cry').stacks,1);assert(gained.attackDamage>idle.attackDamage);assert(gained.paint.some(p=>p.kind==='plain'));
    assert.equal(gained.events.find(e=>e.kind==='grant'&&e.id==='war_cry').buffs.find(b=>b.id==='war_cry').remaining,6);
    await js('buffQA.hold(0);buffQA.step(8)');const paused=await capture('shared-paused');assert.equal(paused.clock,gained.clock);assert.deepEqual(paused.buffs,gained.buffs);assert.deepEqual(paused.readout,gained.readout);
    await js('buffQA.release();buffQA.hold(.5);buffQA.step(8)');const slowed=await capture('shared-slowed');assert(Math.abs(slowed.clock-paused.clock-.1)<1e-6);assert(Math.abs(buff(paused,'war_cry').remaining-buff(slowed,'war_cry').remaining-.1)<1e-6);
    await js("buffQA.release();buffQA.waitFor('war_cry',0)");const expired=await capture('shared-expired');assert.equal(expired.buffs.length,0);assert.equal(expired.attackDamage,idle.attackDamage);assert.equal(expired.readout.length,0);
    await js('buffQA.press(1);buffQA.complete()');await hover('deep_carve');const first=await capture('independent-first');assert.equal(buff(first,'deep_carve').expiries.length,1);
    await js('buffQA.step(24);buffQA.press(1);buffQA.complete()');await hover('deep_carve');const two=await capture('independent-two');assert.equal(buff(two,'deep_carve').stacks,2);assert(two.readout.some(r=>r.text==='Modifiers per stack'));assert(two.pips.some(r=>r.text==='2'));assert(two.attackDamage>first.attackDamage);
    await js("buffQA.waitFor('deep_carve',1)");const partial=await capture('independent-partial-expiry');assert.equal(buff(partial,'deep_carve').expiries.length,1);assert.equal(partial.attackDamage,first.attackDamage);assert(partial.readout.some(r=>r.text==='Modifiers'));
    await js("buffQA.waitFor('deep_carve',0)");const independentEnd=await capture('independent-expired');assert.equal(independentEnd.buffs.length,0);assert.equal(independentEnd.attackDamage,idle.attackDamage);
    await js('buffQA.press(2);buffQA.complete()');await hover('flame_imbue');const loaded=await capture('consumable-loaded');assert.equal(buff(loaded,'flame_imbue').stacks,6);assert.equal(loaded.attackFire-idle.attackFire,48);assert(loaded.readout.some(r=>r.text==='Modifiers per stack'));assert(loaded.cues.some(r=>r.id==='flame_imbue'&&r.phase==='stored'&&r.count===6));assert(loaded.paint.some(r=>r.kind==='stored'&&r.calls.some(c=>c.method==='fillRect')));
    await js('buffQA.press(0);buffQA.complete()');const nonmatching=await capture('consumable-nonmatching-use');assert.equal(buff(nonmatching,'flame_imbue').stacks,6);
    await js('buffQA.press(1);buffQA.complete()');const spent=await capture('consumable-spent');assert.equal(buff(spent,'flame_imbue').stacks,5);assert.equal(spent.attackFire-idle.attackFire,40);assert(spent.cues.some(r=>r.id==='flame_imbue'&&r.phase==='release'&&r.count===1));assert(spent.paint.some(r=>r.kind==='pulse'&&r.calls.some(c=>c.method==='stroke'&&c.alpha>0)));
    await js("buffQA.waitFor('flame_imbue',0)");const end=await capture('consumable-expired');assert.equal(end.buffs.length,0);assert.equal(end.cues.length,0);assert.equal(end.attackFire,idle.attackFire);
    assert.equal(stages.length,14);console.log('PASS: native casts drive shared, independent and consumable buff HUD states through real frames');
  } finally {
    fs.writeFileSync(path.join(dir,'buffs-ui.json'),JSON.stringify(stages,null,2)+'\n');clearTimeout(timeout);win.destroy();server.server.close();app.quit();
  }
}).catch(error=>{console.error(error);app.exit(1);});
