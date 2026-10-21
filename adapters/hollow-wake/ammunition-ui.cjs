const {app, BrowserWindow} = require('electron');
const {buildSync} = require('esbuild');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {startGameServer} = require('../launcher/server.cjs');
const dir = process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData', path.join(dir, 'ammunition-profile-' + process.pid));
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const timeout = setTimeout(() => app.exit(1), 150000);
  const server = await startGameServer({root: process.env.HOLLOW_WAKE_QA_DIST, savesDir: path.join(dir, 'ammunition-saves-' + process.pid)});
  const win = new BrowserWindow({show: false, width: 1280, height: 800, webPreferences: {offscreen: true, backgroundThrottling: false}});
  const results = [];
  const js = async code => {
    const result = await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);
    if (result?.qaError) throw Error(result.qaError);
    return result;
  };
  const screenshot = async name => {
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(dir, name), (await win.webContents.capturePage()).toPNG());
  };
  try {
    await win.loadURL(server.url); await js('__game.hydrated()');
    const data = buildSync({stdin: {contents: "export {SUPPORTS} from './data/supports';", resolveDir: path.resolve(__dirname, '../src'), loader: 'ts'}, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'ammunitionData'}).outputFiles[0].text;
    await js(`${data}\nwindow.ammunitionData=ammunitionData;void 0;`);
    await js(`(() => {
      __game.account().ledger.prologue_lived=1;__game.devStartRun('swashbuckler');__game.hold(true);
      const w=__game.world(),p=w.player;__game.ui.hideAll();w.loadZone('lastlight');p.invulnerable=true;w.lastCombatAt=-999;
      for(const key of Object.keys(w.meta.attrs))w.meta.attrs[key]=50;
      const ids=['bolt_repeater','scattergun','firebolt'];
      for(const [slot,id]of ids.entries())if(__game.devGrantSkill(id,1,slot)!==slot)throw Error('Cannot grant '+id);
      const gem=w.grantSupportGemItem(w.localSeat,{def:ammunitionData.SUPPORTS.deep_reserves,level:1});
      if(!gem||!w.socketSupport(gem.uid,'firebolt'))throw Error('Cannot socket Deep Reserves');
      w.recalcPlayer();p.setAttributes(w.meta.attrs);
      for(const [id,value]of Object.entries({mana:10000,manaRegen:0,lifeRegen:0,poise:0}))p.sheet.setBase(id,value);p.fillResources();
      const quarry=w.createMonster('zombie',1,'enemy');quarry.pos={x:p.pos.x+50,y:p.pos.y};quarry.tier=p.tier;quarry.brain=undefined;quarry.anchored=true;
      w.springAmbush(quarry,true);quarry.untargetable=false;quarry.sheet.setBase('life',100000);quarry.sheet.setBase('lifeRegen',0);quarry.fillResources();w.actors.push(quarry);
      let holding=-1,edge=-1;const aim={...quarry.pos};
      __game.pilot({poll:()=>{const held=p.skills.map((_,i)=>i===holding),pressed=p.skills.map((_,i)=>i===edge);edge=-1;return{dx:0,dy:0,aim,held,edge:pressed};}});
      const payments=[],executions=[],pay=w.paySkillCost.bind(w),execute=w.executeSkill.bind(w);
      w.paySkillCost=(actor,inst,cost)=>{const result=pay(actor,inst,cost);if(actor===p)payments.push({skill:inst.def.id,cost:{...cost},mana:actor.mana});return result;};
      w.executeSkill=(actor,inst,at,opts)=>{if(actor===p)executions.push({skill:inst.def.id,mult:opts?.dmgMult??1,active:!!p.casting});return execute(actor,inst,at,opts);};
      const state=()=>({mana:p.mana,banks:ids.map((id,slot)=>({id,max:p.skillChargeCap(p.skills[slot]),...p.skillChargeBank(p.skills[slot])})),cooldowns:[...p.cooldowns],
        cast:p.casting?{id:p.casting.inst.def.id,mode:p.casting.mode,held:p.casting.held,elapsed:p.casting.elapsed,total:p.casting.total}:null,
        payments:[...payments],executions:[...executions],quarryLife:quarry.life,fatal:__game.crash().fatal});
      const step=n=>{__game.step(n,16.7);return state();};
      const ready=slot=>{holding=-1;for(let n=0;n<1500;n++){__game.ui.hideAll();if(w.timeflow.scaleFor(p)>0&&p.canAct()&&w.skillUsable(p,p.skills[slot]))return;step(1);}throw Error('Skill not ready: '+JSON.stringify(state()));};
      window.ammunitionQA={state,step,
        press:(slot,keepHeld=false)=>{ready(slot);holding=slot;edge=slot;const result=step(1);if(!keepHeld)holding=-1;return result;},
        finish:()=>{for(let n=0;n<500;n++){if(!p.casting){holding=-1;return state();}step(1);}throw Error('Cast did not end');},
        magazineFull:()=>{holding=-1;for(let n=0;n<1000;n++){if(p.skillChargeBank(p.skills[0]).count>=p.skillChargeCap(p.skills[0]))return state();step(1);}throw Error('Magazine did not refill');},
        partialReload:()=>{for(let n=0;n<500;n++){const bank=p.skillChargeBank(p.skills[1]);if(bank.count>0&&bank.count<p.skillChargeCap(p.skills[1]))return state();step(1);}throw Error('No partial shell reload');},
        fullReload:()=>{for(let n=0;n<1000;n++){if(p.skillChargeBank(p.skills[1]).count>=p.skillChargeCap(p.skills[1])){holding=-1;return step(2);}step(1);}throw Error('Shell reload did not fill');},
      };
    })()`);
    const initial = await js('ammunitionQA.step(180)');
    assert(initial.banks[0].max >= 8 && initial.banks[0].max < 20);
    assert(initial.banks[1].max >= 3 && initial.banks[1].max < 20);
    results.push({stage: 'initial-native-banks', ...initial});
    let empty;
    for (let round = 0; round < initial.banks[0].max; round++) {
      await js('ammunitionQA.press(0)'); empty = await js('ammunitionQA.finish()');
      results.push({stage: 'magazine-shot-' + (round + 1), ...empty});
      assert.equal(empty.banks[0].count, initial.banks[0].max - round - 1);
    }
    assert(empty.banks[0].reloading);
    assert(empty.cooldowns.some(([id, remaining]) => id === 'bolt_repeater' && remaining > 0));
    results.push({stage: 'earned-empty-magazine', ...empty}); await screenshot('ammunition-empty-magazine.png');
    const refilled = await js('ammunitionQA.magazineFull()');
    assert.equal(refilled.banks[0].count, initial.banks[0].max); assert.equal(refilled.banks[0].reloading, false);
    assert(!refilled.cooldowns.some(([id]) => id === 'bolt_repeater')); results.push({stage: 'native-clock-refill', ...refilled});
    for (let round = 0; round < initial.banks[1].max; round++) {
      await js('ammunitionQA.press(1)'); const shot = await js('ammunitionQA.finish()');
      results.push({stage: 'shell-shot-' + (round + 1), ...shot});
      assert.equal(shot.banks[1].count, initial.banks[1].max - round - 1);
    }
    const reload = await js('ammunitionQA.press(1,true)');
    assert.equal(reload.cast?.mode, 'channel'); assert.equal(reload.cast?.id, 'reload_shells');
    const partial = await js('ammunitionQA.partialReload()');
    assert(partial.banks[1].count > 0 && partial.banks[1].count < partial.banks[1].max);
    results.push({stage: 'native-conversion-partial-shell-reload', ...partial}); await screenshot('ammunition-shell-reload.png');
    const full = await js('ammunitionQA.fullReload()');
    assert.equal(full.banks[1].count, full.banks[1].max); assert.equal(full.cast, null);
    results.push({stage: 'channel-reload-fills-and-releases', ...full});
    await js('ammunitionQA.press(1)'); const rearmed = await js('ammunitionQA.finish()');
    assert.equal(rearmed.banks[1].count, rearmed.banks[1].max - 1); results.push({stage: 'reloaded-gun-fires-again', ...rearmed});
    const beforeFuel = rearmed.executions.filter(row => row.skill === 'firebolt').length;
    const fuelMax = rearmed.banks[2].max; assert(fuelMax >= 1 && fuelMax < 10);
    let dry;
    for (let shot = 0; shot <= fuelMax; shot++) {
      await js('ammunitionQA.press(2)'); dry = await js('ammunitionQA.finish()');
      assert.equal(dry.banks[2].count, Math.max(0, fuelMax - shot - 1));
    }
    const casts = dry.executions.filter(row => row.skill === 'firebolt').slice(beforeFuel);
    assert.equal(casts.length, fuelMax + 1); assert(casts[0].mult > casts.at(-1).mult);
    assert(Math.abs(casts[0].mult / casts.at(-1).mult - 1.2) < 1e-10);
    assert(dry.quarryLife < initial.quarryLife); assert.equal(dry.fatal, null);
    results.push({stage: 'optional-fuel-earned-and-dry-cast-delivered', ...dry}); await screenshot('ammunition-ui.png');
    console.log('PASS: native input spends real magazines, clocks refill them, empty guns channel reload and fire again, and optional fuel permits a paid dry cast');
  } finally {
    fs.writeFileSync(path.join(dir, 'ammunition-ui.json'), JSON.stringify(results, null, 2) + '\n');
    clearTimeout(timeout); win.destroy(); server.server.close(); app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
