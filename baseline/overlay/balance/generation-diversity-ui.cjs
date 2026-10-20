// Render the finished-grid contact sheet written by probe_generationdiversity.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'reports');
app.setPath('userData',path.join(dir,'generation-critic-profile-'+process.pid));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1360,height:1280,webPreferences:{offscreen:true,backgroundThrottling:false}});
  const timeout=setTimeout(()=>app.exit(1),20000);
  try {
    await win.loadFile(path.join(dir,'generation-contact.html'));
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await new Promise(resolve=>setTimeout(resolve,250));
    const count=await win.webContents.executeJavaScript('document.querySelectorAll("article").length');
    if(count!==27)throw new Error('expected 27 terrain cards, got '+count);
    fs.writeFileSync(path.join(dir,'generation-contact.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS finished-terrain contact sheet rendered');
  } finally {clearTimeout(timeout);win.destroy();app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});
