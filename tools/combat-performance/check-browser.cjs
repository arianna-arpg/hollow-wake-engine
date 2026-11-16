const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const runner=process.env.HW_COMBAT_RUNNER,work=process.env.HW_COMBAT_BROWSER_WORK;
app.setPath('userData',path.join(work,'profile'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const allowed=new Set(['index.html','browser-worker.mjs','workload.mjs','manifest.json']),requested=[];
 const server=http.createServer((req,res)=>{const name=req.url==='/'?'index.html':req.url.slice(1);requested.push(name);
  if(!allowed.has(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.json')?'application/json':'text/html');fs.createReadStream(path.join(runner,name)).pipe(res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,win=new BrowserWindow({show:false,width:420,height:800,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const timer=setTimeout(()=>app.exit(1),240000),unexpected=[];
 win.webContents.session.webRequest.onBeforeRequest((info,reply)=>{const valid=info.url.startsWith(origin+'/')||info.url.startsWith('blob:');if(!valid)unexpected.push(info.url);reply({cancel:!valid});});
 try{
  await win.loadURL(origin);
  const missingLabel=await win.webContents.executeJavaScript("document.querySelector('#run').click();document.querySelector('#result').textContent");assert.match(missingLabel,/name the device/);
  const report=await win.webContents.executeJavaScript(`(async()=>{
   document.querySelector('#device').value='Desktop Chromium acceptance';document.querySelector('#conditions').value='Functional verification only';document.querySelector('#run').click();
   for(let i=0;i<4000;i++){if(!document.querySelector('#save').hidden)return JSON.parse(document.querySelector('#result').textContent);await new Promise(resolve=>setTimeout(resolve,50));}
   throw Error('Browser timeout: '+document.querySelector('#result').textContent);
  })()`);
  assert(report.passed,report.failure);assert.equal(report.courses.length,8);
  assert(report.courses.every(c=>c.runs.length===3&&c.runs.every(r=>r.receiptFingerprint===c.runs[0].receiptFingerprint)));
  const download=path.join(work,'download.json'),saved=new Promise((resolve,reject)=>win.webContents.session.once('will-download',(_event,item)=>{
   item.setSavePath(download);item.once('done',(_event,state)=>state==='completed'?resolve():reject(Error(state)));
  }));
  await win.webContents.executeJavaScript("document.querySelector('#save').click()");await saved;assert.deepEqual(JSON.parse(fs.readFileSync(download)),report);
  const narrow=await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=window.innerWidth+1');assert(narrow,'Phone-width form overflow');
  const image=await win.webContents.capturePage();fs.writeFileSync(path.join(work,'browser.png'),image.toPNG());
  // A busy worker may publish its final result before consuming the hidden-tab
  // notification. The page must still reject that result independently.
  const hiddenResultRejected=await win.webContents.executeJavaScript(`(()=>{
   const OriginalWorker=globalThis.Worker,descriptor=Object.getOwnPropertyDescriptor(document,'hidden');let worker;
   try{
    globalThis.Worker=class{constructor(){worker=this;}postMessage(){}terminate(){}};
    document.querySelector('#run').click();Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));worker.onmessage({data:{passed:true}});
    const result=JSON.parse(document.querySelector('#result').textContent);return result.passed===false&&result.hiddenDuringRun===true;
   }finally{globalThis.Worker=OriginalWorker;if(descriptor)Object.defineProperty(document,'hidden',descriptor);else delete document.hidden;}
  })()`);assert(hiddenResultRejected,'Late visibility event accepted an invalid measurement');
  assert.deepEqual(unexpected,[]);assert(requested.includes('workload.mjs')&&requested.includes('browser-worker.mjs'));
  fs.writeFileSync(path.join(work,'verification.json'),JSON.stringify({passed:true,missingLabelRejected:true,hiddenResultRejected,downloadMatched:true,narrow,externalRequests:unexpected,report},null,2));
 }finally{clearTimeout(timer);win.destroy();server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
