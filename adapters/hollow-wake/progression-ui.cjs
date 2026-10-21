// Earn every spent point through the installed progression adapter, then use the
// real passive-tree choice and Font refund controls. Isolated profile and saves.
const {app,BrowserWindow}=require('electron');
const {buildSync}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startGameServer}=require('../launcher/server.cjs');
const dir=process.env.HOLLOW_WAKE_QA_REPORTS;
app.setPath('userData',path.join(dir,'progression-profile-'+process.pid));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),120000);
 const server=await startGameServer({root:process.env.HOLLOW_WAKE_QA_DIST,savesDir:path.join(dir,'progression-saves-'+process.pid)});
 const win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}});
 const js=async code=>{const result=await win.webContents.executeJavaScript(`(async()=>{try{return await (0,eval)(${JSON.stringify(code)});}catch(e){return {qaError:String(e.stack??e)};}})()`);if(result?.qaError)throw Error(result.qaError);return result;};
 const results=[];
 try{
  await win.loadURL(server.url);await js('__game.hydrated()');
  const data=buildSync({stdin:{contents:"export {PASSIVE_NODES} from './passives';export {passiveWalkingGraph} from './passiveTopology';export {choicePathing} from './passiveChoices';",resolveDir:path.resolve(__dirname,'../src/data'),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'progressionData'}).outputFiles[0].text;
  await js(`${data}\nwindow.progressionData=progressionData;void 0;`);
  const earned=await js(`(()=>{
   __game.account().ledger.prologue_lived=1;__game.devStartRun('warrior');__game.hold(true);__game.ui.hideAll();
   const w=__game.world(),ui=__game.ui,{PASSIVE_NODES:N,passiveWalkingGraph,choicePathing}=progressionData;
   w.loadZone('lastlight');w.player.invulnerable=true;const f=w.fonts[0];w.player.pos={...f.pos};w.player.tier=f.tier||0;
   if(w.player.level!==1||w.meta.passivePoints!==0||w.meta.xp!==0)throw Error('Fresh character must have no earned points');
   const graph=passiveWalkingGraph(N),queue=[...w.meta.allocated],seen=new Set(queue),parents={};let target;
   for(let i=0;i<queue.length&&!target;i++)for(const next of graph[queue[i]]||[]){if(seen.has(next))continue;seen.add(next);parents[next]=queue[i];queue.push(next);if(choicePathing(N[next])){target=next;break;}}
   if(!target)throw Error('No reachable attribute choice');const route=[];for(let id=target;!w.meta.allocated.has(id);id=parents[id])route.unshift(id);
   if(!route.length||route.length>64)throw Error('Unexpected route length');const awards=[];
   for(let i=0;i<route.length;i++){const amount=w.meta.xpNeeded;w.grantXp(amount);awards.push(amount);if(w.meta.passivePoints!==i+1||w.player.level!==i+2||w.meta.xp!==0)throw Error('XP did not earn exactly one point and level');}
   for(const id of route.slice(0,-1))if(!w.allocateNode(id))throw Error('Earned route point refused '+id);
   if(w.meta.passivePoints!==1)throw Error('Route did not retain exactly the earned final point');
   ui.toggleTree();const node=N[target],b=ui.treeBox;ui.treeZoom=5;ui.treePan={x:node.x-b.minX-b.w/2,y:node.y-b.minY-b.h/2};ui.refreshTree();
   window.progressionQA={target,level:w.player.level,base:{...w.meta.attrs}};
   document.querySelector('[data-node="'+target+'"]').dispatchEvent(new MouseEvent('click'));
   return {route,awards,level:w.player.level,points:w.meta.passivePoints,choices:document.querySelectorAll('.choice-popup .choice-opt').length};
  })()`);assert.equal(earned.level,earned.awards.length+1);assert.equal(earned.points,1);assert.equal(earned.choices,10);results.push({stage:'earned',...earned});
  const spent=await js(`(()=>{document.querySelector('.choice-popup [data-opt="intelligence"]').click();const w=__game.world(),q=progressionQA;return {points:w.meta.passivePoints,level:w.player.level,owned:w.meta.allocated.has(q.target),choice:w.meta.choices[q.target],delta:w.meta.attrs.intelligence-q.base.intelligence,actor:w.player.attributeValues.intelligence,meta:w.meta.attrs.intelligence};})()`);
  assert.equal(spent.points,0);assert.equal(spent.level,earned.level);assert(spent.owned);assert.deepEqual(spent.choice,['intelligence']);assert.equal(spent.delta,2);assert.equal(spent.actor,spent.meta);results.push({stage:'spent',...spent});
  const refunded=await js(`(()=>{document.querySelector('[data-passive-refund-mode]').click();document.querySelector('[data-node="'+progressionQA.target+'"]').dispatchEvent(new MouseEvent('click'));document.querySelector('[data-passive-refund-mode]').click();const w=__game.world(),q=progressionQA;return {points:w.meta.passivePoints,level:w.player.level,owned:w.meta.allocated.has(q.target),delta:w.meta.attrs.intelligence-q.base.intelligence};})()`);
  assert.equal(refunded.points,1);assert.equal(refunded.level,earned.level);assert.equal(refunded.owned,false);assert.equal(refunded.delta,0);results.push({stage:'refunded',...refunded});
  const repicked=await js(`(()=>{document.querySelector('[data-node="'+progressionQA.target+'"]').dispatchEvent(new MouseEvent('click'));document.querySelector('.choice-popup [data-opt="vitality"]').click();const w=__game.world(),q=progressionQA;return {points:w.meta.passivePoints,choice:w.meta.choices[q.target],delta:w.meta.attrs.vitality-q.base.vitality,fatal:__game.crash().fatal};})()`);
  assert.equal(repicked.points,0);assert.deepEqual(repicked.choice,['vitality']);assert.equal(repicked.delta,2);assert.equal(repicked.fatal,null);results.push({stage:'repicked',...repicked});
  await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(dir,'progression-ui.png'),(await win.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(dir,'progression-ui.json'),JSON.stringify(results,null,2)+'\n');
  console.log('PASS: XP-earned points reach real passive choice, exact stat rebuild, Font refund and reselection');
 }finally{clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
