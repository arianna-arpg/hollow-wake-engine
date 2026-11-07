const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=process.env.HWE_DEVICE_DIR,page=process.env.HWE_DEVICE_PAGE;
app.setPath('userData',path.join(dir,'electron-profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:390,height:780,webPreferences:{backgroundThrottling:false,offscreen:true}});
  const timer=setTimeout(()=>app.exit(1),90000);
  try{
    const http=[];
    win.webContents.session.webRequest.onBeforeRequest((info,callback)=>{
      if(/^https?:/i.test(info.url))http.push(info.url);
      callback({cancel:/^https?:/i.test(info.url)});
    });
    await win.loadFile(page);
    assert(await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth+1'));
    const runs=[];
    for(const count of [24,120,480]){
      const result=await win.webContents.executeJavaScript(`(async()=>{
        const byId=id=>document.getElementById(id);
        byId('count').value='${count}'; byId('device').value='Desktop browser acceptance'; byId('run').click();
        for(let n=0;n<1000;n++){
          if(!byId('run').disabled && byId('report').value)return JSON.parse(byId('report').value);
          if(byId('status').textContent.startsWith('Verification failed'))throw Error(byId('status').textContent);
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        throw Error('Timed out waiting for a complete report');
      })()`);
      assert.equal(result.verifiedActorSteps,640*count);
      assert.equal(result.blockMs.length,32);
      assert(result.blockMs.every(n=>Number.isFinite(n)&&n>=0));
      assert.equal(result.device,'Desktop browser acceptance');
      const target=path.join(dir,'browser-'+count+'.json');
      const saved=new Promise((resolve,reject)=>win.webContents.session.once('will-download',(_event,item)=>{
        item.setSavePath(target);item.once('done',(_e,state)=>state==='completed'?resolve():reject(Error(state)));
      }));
      await win.webContents.executeJavaScript("document.getElementById('download').click()");
      await saved;assert.deepEqual(JSON.parse(fs.readFileSync(target)),result);
      runs.push({actors:count,verifiedActorSteps:result.verifiedActorSteps,downloadMatched:true});
    }
    const interrupted=await win.webContents.executeJavaScript(`(()=>{
      document.getElementById('run').click();
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'));
      return document.getElementById('download').hidden && !document.getElementById('run').disabled &&
        document.getElementById('status').textContent.startsWith('Run interrupted');
    })()`);
    assert(interrupted);
    const html=fs.readFileSync(page,'utf8');
    const found=html.match(/<script type="application\/json" id="course">(.*?)<\/script>/);
    const bad=JSON.parse(found[1]);bad.courses[0].frames[1].mana++;
    const wrong=path.join(dir,'wrong-oracle.html');
    fs.writeFileSync(wrong,html.replace(found[1],()=>JSON.stringify(bad)),{flag:'wx'});
    await win.loadFile(wrong);
    const refused=await win.webContents.executeJavaScript(`(async()=>{
      document.getElementById('run').click();
      for(let n=0;n<60;n++){
        if(document.getElementById('status').textContent.startsWith('Verification failed'))
          return document.getElementById('download').hidden && !document.getElementById('report').value;
        await new Promise(resolve=>setTimeout(resolve,16));
      }
      return false;
    })()`);
    assert(refused);assert.deepEqual(http,[]);
    fs.writeFileSync(path.join(dir,'browser-acceptance.json'),JSON.stringify({
      chromium:process.versions.chrome,runs,interrupted,refusedWrongOracle:refused,networkRequests:http.length
    }));
    win.destroy();app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
  finally{clearTimeout(timer);}
});
