const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startGameServer}=require(path.join(process.env.QA_GAME,'launcher/server.cjs'));
const reports=process.env.QA_REPORTS;fs.mkdirSync(reports,{recursive:true});app.setPath('userData',path.join(reports,'profile'));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const results=[];
 for(const guarded of [false,true]){
  const server=await startGameServer({root:process.env.QA_DIST,savesDir:path.join(reports,guarded?'guarded':'unguarded')});
  let release;const original=server.server.listeners('request')[0];server.server.removeListener('request',original);
  server.server.on('request',(req,res)=>{if(req.method==='GET'&&req.url==='/__save/2'){const end=res.end.bind(res);res.end=(...args)=>{release=()=>end(...args);return res;};}original(req,res);});
  const win=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false,partition:'hydration-'+guarded+'-'+process.pid}});
  const js=code=>win.webContents.executeJavaScript(code);
  try{
   await win.loadURL(server.url);
   await js(`(async()=>{for(let n=0;n<100;n++){if(localStorage.getItem('arpg_account_v1'))return;await new Promise(r=>setTimeout(r,10));}throw Error('Account response did not finish');})()`);
   assert(release,'Settings response must be held until the selected ordering');
   if(guarded){release();await js('__game.hydrated()');}
   await js(`__game.account().ledger.prologue_lived=1;__game.account().ledger['tutorial_faction:goblin']=1;`);
   const before=await js('({...__game.account().ledger})');
   if(!guarded){release();await js('__game.hydrated()');}
   const after=await js('({...__game.account().ledger})');
   assert.equal(before.prologue_lived,1);assert.equal(after.prologue_lived??0,guarded?1:0);assert.equal(after['tutorial_faction:goblin']??0,guarded?1:0);
   results.push({guarded,before,after});
  }finally{win.destroy();server.server.close();}
 }
 fs.writeFileSync(path.join(reports,'result.json'),JSON.stringify({results,scope:'Unchanged renderer; hold only initial settings GET response so account data resolves before test fixture mutation. Awaiting the public hydration promise prevents reset.'},null,2)+'\n');console.log('PASS: controlled save-loading order exposes fixture reset; hydration wait preserves fixture');app.quit();
}).catch(e=>{fs.writeFileSync(path.join(reports,'error.txt'),String(e.stack));app.exit(1);});
