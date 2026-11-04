const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const selected=process.env.HW_DEVICE_REPORTS,page=process.env.HW_DEVICE_HTML;
app.setPath('userData',path.join(selected,'profile'));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:420,height:800,webPreferences:{backgroundThrottling:false,offscreen:true}});
 const timer=setTimeout(()=>app.exit(1),90000);let unexpected=[];
 win.webContents.session.webRequest.onBeforeRequest((info,cb)=>{if(/^https?:/i.test(info.url))unexpected.push(info.url);cb({cancel:/^https?:/i.test(info.url)});});
 try{
   await win.loadFile(page);
   const observed=[];
   for(const count of [100,500,1000]){
     const outcome=await win.webContents.executeJavaScript(`(async()=>{
       const choose=document.getElementById('actors'),label=document.getElementById('device'),start=document.getElementById('start'),report=document.getElementById('report');
       choose.value='${count}';label.value='Desktop offline acceptance';start.click();
       for(let i=0;i<900;i++){if(!start.disabled&&report.value)return JSON.parse(report.value);await new Promise(resolve=>setTimeout(resolve,35));}
       throw Error('Browser did not report: '+document.getElementById('status').textContent+' visibility='+document.visibilityState);
     })()`);
     assert(outcome.valid);assert.equal(outcome.scopes.actors,count);assert.equal(outcome.timing.batchMeanMs.length,60);assert.equal(outcome.outcomes.expected.planBuilds,count);
     const out=path.join(selected,count+'.json');
     const saved=new Promise((resolve,reject)=>{win.webContents.session.once('will-download',(_event,item)=>{item.setSavePath(out);item.once('done',(_e,state)=>state==='completed'?resolve():reject(Error(state)));});});
     await win.webContents.executeJavaScript("document.getElementById('download').click()");await saved;assert.deepEqual(JSON.parse(fs.readFileSync(out)),outcome);
     observed.push({count,completions:outcome.outcomes.observed.completions,ticks:outcome.outcomes.observed.ticks,checksum:outcome.outcomes.observed.checksum,download:true});
   }

   const cancelled=await win.webContents.executeJavaScript(`(async()=>{
     const start=document.getElementById('start'),raw=document.getElementById('report');start.click();
     window.dispatchEvent(new Event('pagehide'));
     await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
     return {ready:!start.disabled,empty:raw.value==='',status:document.getElementById('status').textContent};
   })()`);
   assert(cancelled.ready&&cancelled.empty&&cancelled.status.startsWith('Run interrupted'));
   const html=fs.readFileSync(page,'utf8'),pattern=/<script id="course-data" type="application\/json">([\s\S]*?)<\/script>/;
   const found=html.match(pattern);assert(found);const data=JSON.parse(found[1]);data.expected[0].completions++;
   const damaged=path.join(selected,'wrong-expected-count.html');
   fs.writeFileSync(damaged,html.replace(found[1],()=>JSON.stringify(data).replaceAll('<','\\u003c')),{flag:'wx'});
   await win.loadFile(damaged);
   const invalid=await win.webContents.executeJavaScript(`(async()=>{
     document.getElementById('start').click();
     for(let i=0;i<900;i++){
       const report=document.getElementById('report').value;if(report)return JSON.parse(report);
       await new Promise(resolve=>setTimeout(resolve,35));
     }throw Error('No diagnostic report');
   })()`);
   assert.equal(invalid.valid,false);assert.equal(invalid.outcomes.expected.completions,invalid.outcomes.observed.completions+1);
   await win.loadFile(page);
   const coarse=await win.webContents.executeJavaScript(`(async()=>{
     Object.defineProperty(performance,'now',{value:()=>1});
     document.getElementById('start').click();
     for(let i=0;i<900;i++){const value=document.getElementById('report').value;if(value)return JSON.parse(value);await new Promise(resolve=>setTimeout(resolve,35));}
     throw Error('No coarse-timer result');
   })()`);
   assert(coarse.valid&&!coarse.timing.timerUsable&&coarse.timing.positiveBatches===0);
   const narrow=await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=window.innerWidth+1');
   assert(narrow,'Device form overflows its viewport');
   fs.writeFileSync(path.join(selected,'controls.json'),JSON.stringify({cancelled,wrongExpectedCountRejected:!invalid.valid,coarseTimerDetected:!coarse.timing.timerUsable,narrow,noHttpRequests:unexpected.length===0},null,2)+'\n');
   assert.deepEqual(unexpected,[]);fs.writeFileSync(path.join(selected,'observed.json'),JSON.stringify(observed,null,2)+'\n');console.log({passed:true,observed});
 }finally{clearTimeout(timer);win.destroy();app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});
