const {app,BrowserWindow}=require('electron');
const {buildSync}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startGameServer}=require('../launcher/server.cjs');
const work=process.env.HWE_RACK_UI;
app.setPath('userData',path.join(work,'profile'));app.setPath('crashDumps',path.join(work,'crashes'));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
  const server=await startGameServer({root:path.join(work,'dist'),savesDir:path.join(work,'saves')});
  const win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}});
  const js=source=>win.webContents.executeJavaScript(source);
  try{
    await win.loadURL(server.url);await js('__game.hydrated()');
    const data=buildSync({stdin:{contents:"export {SKILLS} from './data/skills';export {SUPPORTS} from './data/supports';export {makeSkillInstance,BAR_SLOTS} from './engine/skills';export {freeCellCount} from './engine/gemitems';",resolveDir:path.resolve(__dirname,'../src')},
      bundle:true,write:false,platform:'browser',format:'iife',globalName:'rackData'}).outputFiles[0].text;
    const uid=await js(data+`\n(()=>{
      __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
      const w=__game.world(),s=w.localSeat,ui=__game.ui;
      ui.hideAll();w.loadZone('lastlight');w.devIgnoreSkillAttributes=true;s.actor.invulnerable=true;w.lastCombatAt=-999;
      s.meta.items=[];s.meta.knownSkills.clear();s.actor.skills=Array(rackData.BAR_SLOTS).fill(null);
      for(const [at,id] of [[0,'fireball'],[2,'firebolt']]){
        const inst=rackData.makeSkillInstance(rackData.SKILLS[id],1,1);
        s.meta.knownSkills.set(id,inst);s.actor.skills[at]=inst;
      }
      w.recalcSeat(s);
      const upgrade=rackData.makeSkillInstance(rackData.SKILLS.fireball,5,2);
      upgrade.rarity='rare';upgrade.locked=true;upgrade.sockets[1]={def:rackData.SUPPORTS.splitting,level:3,locked:true};
      const incoming=w.grantSkillGemItem(s,upgrade),intents=[],request=w.requestMeta;
      w.requestMeta=function(action,...rest){intents.push(JSON.parse(JSON.stringify(action)));return request.call(this,action,...rest);};
      const click=selector=>{
        const e=document.querySelector(selector);if(!e)throw Error('No mounted control '+selector);
        e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
        e.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:r.x+Math.min(15,r.width/2),clientY:r.y+Math.min(15,r.height/2)}));
      };
      window.rackQA={w,s,ui,click,intents,free:()=>rackData.freeCellCount(s.meta.items),
        filler:()=>w.grantSupportGemItem(s,{def:rackData.SUPPORTS.splitting,level:1})};
      ui.toggleInventory();ui.inventoryPages.close('skills');ui.folioSync();
      click('[data-bag-item][data-item-uid="'+incoming.uid+'"]');
      if(!document.querySelector('.dnd-ghost'))throw Error('Bag tile did not lift');
      ui.inventoryPages.request('skills',s.id,'show');ui.folioSync();return incoming.uid;
    })()`);
    await js('new Promise(resolve=>requestAnimationFrame(resolve))');
    const upgrade=await js(`(()=>{const {w,s,ui,click}=rackQA;click('[data-drop="rackSeat:2"]');
      return {bar:s.actor.skills.map(i=>i?.def.id??null),level:s.actor.skills[2]?.level,
        bag:s.meta.items.map(i=>i.gem?.skillId),bound:s.actor.skills[2]===s.meta.knownSkills.get('fireball')};})()`);
    assert.equal(upgrade.level,5);assert(upgrade.bound);assert.equal(upgrade.bar[0],null);
    assert.deepEqual(upgrade.bag,['firebolt','fireball']);
    const full=await js(`(()=>{const {s,ui,click,free,filler}=rackQA;
      for(let i=0;free()>0;i++){if(i>1024||!filler())throw Error('Could not fill bag');}
      ui.refreshInventory();click('button[data-rackunbind="2"]');
      return {free:free(),level:s.meta.knownSkills.get('fireball')?.level,returned:s.meta.items.filter(i=>i.gem?.skillId==='fireball'&&i.gem.level===5).length};
    })()`);
    assert.deepEqual(full,{free:0,level:5,returned:0});
    const retired=await js(`(()=>{const {s,ui,click}=rackQA;
      if(s.meta.items.pop().gem?.kind!=='support')throw Error('Expected a filler');
      ui.refreshInventory();click('button[data-rackunbind="2"]');
      const item=s.meta.items.find(i=>i.gem?.skillId==='fireball'&&i.gem.level===5);
      return {empty:s.actor.skills[2]===null,known:s.meta.knownSkills.has('fireball'),
        uid:item?.uid,locked:item?.locked,cut:item?.gem.sockets[1],intents:rackQA.intents,fatal:__game.crash().fatal};
    })()`);
    assert(retired.empty&&!retired.known&&retired.locked&&retired.uid!==uid);assert.equal(retired.fatal,null);
    assert.deepEqual(retired.cut,{supportId:'splitting',level:3,locked:true});
    assert(retired.intents.some(a=>a.t==='learn'&&a.uid===uid&&a.slot===2));
    assert(retired.intents.some(a=>a.t==='unlearn'&&a.skillId==='fireball'));
    fs.writeFileSync(path.join(work,'result.json'),JSON.stringify({passed:true,upgrade,full,retired})+'\n',{flag:'wx'});
  }finally{win.destroy();server.server.close();}
}).then(()=>app.quit(),error=>{console.error(error);app.exit(1);});
