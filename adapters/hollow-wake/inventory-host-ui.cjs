// Exercise the mounted renderer's real preview/painting methods and World intents.
// This is an application integration course, not a native-pointer acceptance claim.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {startGameServer}=require('../launcher/server.cjs');
const dir = path.join(__dirname, 'reports');
fs.mkdirSync(dir,{recursive:true});app.setPath('userData',path.join(dir,'inventory-host-profile-'+process.pid));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const timeout=setTimeout(()=>app.exit(1),60000),server=await startGameServer({root:path.resolve(__dirname, '../dist'),savesDir:path.join(dir,'inventory-host-saves-'+process.pid)});
 const win=new BrowserWindow({show:false,width:1400,height:1100,webPreferences:{offscreen:true,backgroundThrottling:false}});
 try{
  await win.loadURL(server.url);await new Promise(resolve=>setTimeout(resolve,1200));
  const checks=await win.webContents.executeJavaScript(`(${async function(){
   const checks=[],check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);};
   __game.account().ledger.prologue_lived=1;__game.devStartRun('warrior');
   const ui=__game.ui,w=__game.world(),m=w.meta;w.update=()=>{};w.player.invulnerable=true;
   w.account.features.add('oracle_stone');w.account.ledger.oracle_rescued=1;w.account.features.add('reliquary');
   for(const feature of ['reliquary_ring','reliquary_shelves','reliquary_heart','reliquary_case'])w.account.features.delete(feature);
   w.loadZone('lastlight');w.player.pos={...w.stationAnchor('oracle').pos};w.lastCombatAt=-999;
   const make=(uid,x,y,baseId='ring_mi_gnoll')=>({uid,x,y,baseId,name:'Host UI fixture',ilvl:1,tier:1,rarity:'common',baseRoll:0,implicitRolls:[],affixes:[]});
   const a=make(881001,0,0),b=make(881002,1,0),relic=make(881003,2,0,'relic_charm');m.items=[a,b,relic];
   ui.hideAll();ui.toggleInventory();ui.refreshInventory();
   const payload=(uid,from='bag')=>({kind:'gearItem',arg:String(uid),data:{from,grab:{x:0,y:0}}});
   let landing=ui.bagLanding(payload(a.uid),'1:0');check('mounted bag preview selects the actual blocker',landing.verdict==='swap'&&landing.with===b);
   ui.paintBagLanding(document.querySelector('#inventory [data-bag-grid]'),landing);
   check('swap preview paints the footprint and blocker',!!document.querySelector('.bag-landing.swap')&&!!document.querySelector('[data-item-uid="881002"].bag-swap-with'));
   w.applyAction(w.localSeat,{t:'moveItem',uid:a.uid,x:1,y:0});check('intent executes the previewed swap with original identities',a.x===1&&b.x===0&&m.items.includes(a)&&m.items.includes(b));
   m.items=[...m.items];b.x=4;b.y=0;ui.refreshInventory();landing=ui.bagLanding(payload(a.uid),'4:0');
   check('preview observes externally replaced arrays and moved bodies',landing.verdict==='swap'&&landing.with===b);
   w.applyAction(w.localSeat,{t:'moveItem',uid:a.uid,x:4,y:0});check('authority agrees after external edits',a.x===4&&b.x===1);
   ui.refreshInventory();document.querySelector('[data-containerflap="reliquary"]').click();ui.folioSync();
   const open=ui.containerPane.landing(payload(relic.uid),'reliquary','1:1'),closed=ui.containerPane.landing(payload(relic.uid),'reliquary','2:1');
   check('container preview distinguishes open and sealed cells',open.verdict==='place'&&closed.verdict==='blocked');
   w.applyAction(w.localSeat,{t:'containerPlace',container:'reliquary',uid:relic.uid,x:2,y:1});check('sealed-cell intent leaves the item in its bag',m.items.some(i=>i.uid===relic.uid));
   w.applyAction(w.localSeat,{t:'containerPlace',container:'reliquary',uid:relic.uid,x:1,y:1});ui.refreshInventory();
   const panel=()=>document.getElementById('container-panel-reliquary'),tile=()=>panel().querySelector('[data-item-uid="881003"]');
   check('accepted placement updates bag and mounted container',!m.items.some(i=>i.uid===relic.uid)&&!!tile());const left=tile().style.left;
   w.account.features.add('reliquary_ring');ui.refreshInventory();
   check('live mask expansion updates the same preview',ui.containerPane.landing(payload(relic.uid,'c:reliquary'),'reliquary','2:1').verdict==='place');
   w.applyAction(w.localSeat,{t:'containerMove',container:'reliquary',uid:relic.uid,x:2,y:1});ui.refreshInventory();
   check('container move updates authoritative coordinates and rendered placement',m.containers.reliquary.find(i=>i.uid===relic.uid).x===2&&tile().style.left!==left);
   const grid=document.querySelector('#inventory [data-bag-grid]');
   // Read the actual board from rendered cell addresses rather than assuming its dimensions.
   const addresses=[...grid.querySelectorAll('[data-cell][data-drop^="bagCell:"]')].map(el=>el.dataset.cell.split(':').map(Number));
   check('renderer exposes its board cells',addresses.length>0);
   m.items=addresses.map(([x,y],n)=>make(882000+n,x,y));ui.refreshInventory();
   const [x,y]=addresses.at(-1),cell=x+':'+y;
   check('full bag preview refuses withdrawal',ui.bagLanding(payload(relic.uid,'c:reliquary'),cell).verdict==='blocked');
   w.applyAction(w.localSeat,{t:'containerTake',container:'reliquary',uid:relic.uid,x,y});check('full bag intent preserves container ownership',m.containers.reliquary.some(i=>i.uid===relic.uid));
   m.items.pop();ui.refreshInventory();check('external removal immediately opens the landing',ui.bagLanding(payload(relic.uid,'c:reliquary'),cell).verdict==='unequip');
   w.applyAction(w.localSeat,{t:'containerTake',container:'reliquary',uid:relic.uid,x,y});ui.refreshInventory();
   check('withdrawal updates both mounted surfaces',m.items.some(i=>i.uid===relic.uid&&i.x===x&&i.y===y)&&!!document.querySelector('#inventory [data-bag-item][data-item-uid="881003"]')&&!tile());
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const visible=document.getElementById('inventory'),rect=visible.getBoundingClientRect();
   check('inventory is visible after the renderer paints',getComputedStyle(visible).display!=='none'&&rect.width>0&&rect.height>0&&document.getElementById('start-menu').classList.contains('hidden'));
   check('no fatal renderer error',__game.crash().fatal===null);return checks;
  }.toString()})()`);
  fs.writeFileSync(path.join(dir,'inventory-host-ui.json'),JSON.stringify(checks,null,2));
  fs.writeFileSync(path.join(dir,'inventory-host-ui.png'),(await win.webContents.capturePage()).toPNG());
  console.log('PASS: '+checks.length+' mounted inventory preview, intent and container checks');
 }finally{clearTimeout(timeout);win.destroy();server.server.close();app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});
