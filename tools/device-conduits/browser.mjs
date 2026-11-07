import {createDeviceCourse} from './workload.mjs';

const byId=id=>document.getElementById(id);
const data=JSON.parse(byId('course').textContent);
const run=byId('run'),status=byId('status'),download=byId('download'),progress=byId('progress');
let active=false, generation=0, reportUrl;
function controls(running){
  active=running;
  run.disabled=running; byId('count').disabled=running; byId('device').disabled=running;
}
function discard(){
  if(reportUrl)URL.revokeObjectURL(reportUrl);
  reportUrl=undefined;download.hidden=true;download.removeAttribute('href');
  byId('result').hidden=true;byId('report').value='';
}
document.addEventListener('visibilitychange',()=>{
  if(active&&document.hidden){generation++;controls(false);discard();status.textContent='Run interrupted. Restart with this page visible.';}
});
run.addEventListener('click',()=>{
  if(active||document.hidden)return;
  discard(); controls(true); progress.value=0;
  const ticket=++generation,count=Number(byId('count').value),timings=[];
  let workload,block=0;
  try{workload=createDeviceCourse(data.courses,count);}
  catch(error){controls(false);status.textContent=String(error.message);return;}
  status.textContent='Checking resource transfers…';
  function frame(){
    if(ticket!==generation)return;
    try{
      const before=performance.now();
      workload.block();
      const duration=performance.now()-before;
      if(block>=8)timings.push(duration);
      progress.value=++block;
      if(block<40){requestAnimationFrame(frame);return;}
      const sorted=[...timings].sort((a,b)=>a-b);
      const median=(sorted[15]+sorted[16])/2,p95=sorted[30];
      const timerUsable=timings.every(ms=>Number.isFinite(ms)&&ms>=0)&&median>0;
      const report={schemaVersion:1,course:'conduit-meter-replay/v1',version:data.version,archiveSha256:data.archiveSha256,
        originalSha256:data.originalSha256,device:byId('device').value.trim(),browser:navigator.userAgent,
        actors:count,slots:8,warmupBlocks:8,measuredBlocks:32,stepsPerBlock:16,verifiedActorSteps:workload.count(),
        timerUsable,medianBlockMs:median,p95BlockMs:p95,blockMs:timings};
      const json=JSON.stringify(report,null,2);
      byId('report').value=json;byId('result').hidden=false;
      reportUrl=URL.createObjectURL(new Blob([json],{type:'application/json'}));
      download.href=reportUrl;download.download='hollow-wake-conduits-'+count+'.json';download.hidden=false;
      status.textContent=workload.count().toLocaleString()+' actor steps matched. '+(timerUsable?
        'Median '+median.toFixed(2)+' ms per 16-step block.':'Timer resolution was insufficient. Try more actors.');
    }catch(error){discard();status.textContent='Verification failed: '+error.message;}
    controls(false);
  }
  requestAnimationFrame(frame);
});
