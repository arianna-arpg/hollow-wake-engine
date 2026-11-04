import {createLifecycleWorkload} from './workload.mjs';

const data=JSON.parse(document.getElementById('course-data').textContent);
const byId=id=>document.getElementById(id);
const start=byId('start'),countInput=byId('actors'),labelInput=byId('device'),status=byId('status');
const progress=byId('progress'),metrics=byId('metrics'),download=byId('download'),raw=byId('report');
const batch=20,warmup=300,measured=1200;
let generation=0,running=false,url=null;
function clearReport(){
  if(url)URL.revokeObjectURL(url);
  url=null;download.hidden=true;download.removeAttribute('href');raw.value='';metrics.hidden=true;
}
function ready(){
  running=false;start.disabled=false;countInput.disabled=false;labelInput.disabled=false;
}
function interrupt(){
  if(!running)return;
  generation++;
  ready();clearReport();
  status.textContent='Run interrupted. Keep this page visible and start a fresh run.';
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)interrupt();});
window.addEventListener('pagehide',interrupt);

function timerResolution(){
  let previous=performance.now(),minimum=Infinity;
  for(let i=0;i<4096;i++){
    const current=performance.now();
    if(current>previous)minimum=Math.min(minimum,current-previous);
    previous=current;
  }
  return Number.isFinite(minimum)?minimum:null;
}
function reportResult(count,device,observed,times,quantum,initialBuilds){
  const expected=data.expected.find(row=>row.actors===count);
  const valid=observed.completions===expected.completions&&observed.ticks===expected.ticks&&
    Math.abs(observed.checksum-expected.checksum)<=Math.abs(expected.checksum)*1e-10&&
    observed.planBuilds===expected.planBuilds&&observed.planBuilds===initialBuilds;
  const sorted=times.slice().sort((a,b)=>a-b);
  const median=(sorted[29]+sorted[30])/2,p95=sorted[Math.ceil(.95*sorted.length)-1],max=sorted.at(-1);
  const positiveBatches=times.filter(t=>t>0).length;
  const timerUsable=median>0;
  const result={schemaVersion:1,sdk:data.sdk,course:data.course,deviceLabel:device,browser:navigator.userAgent,valid,
    scopes:{actors:count,warmupUpdates:warmup,measuredUpdates:measured,batchSize:batch,fixedDt:1/60},
    outcomes:{expected,observed},timing:{timerUsable,positiveBatches,timerQuantumMs:quantum,medianBatchMeanMs:median,p95BatchMeanMs:p95,maxBatchMeanMs:max,batchMeanMs:times},
    measuredAt:new Date().toISOString()};
  raw.value=JSON.stringify(result,null,2)+'\n';
  url=URL.createObjectURL(new Blob([raw.value],{type:'application/json'}));
  download.href=url;download.download='hollow-wake-lifecycle-'+count+'-'+(valid?'verified':'mismatch')+'.json';download.hidden=false;
  byId('median').textContent=median>0?median.toFixed(3)+' ms':'Below timer resolution';
  byId('p95').textContent=p95>0?p95.toFixed(3)+' ms':'Below timer resolution';
  byId('counts').textContent=observed.completions.toLocaleString()+' casts · '+observed.ticks.toLocaleString()+' effect updates';
  metrics.hidden=false;
  status.textContent=!valid?'Outcome mismatch. Timing is invalid. Save the report for diagnosis.':
    timerUsable?'Verified against the recorded SDK workload.':'Outcomes verified. Timer precision is insufficient for the median. Try a larger actor count.';
}
start.addEventListener('click',()=>{
  if(running||document.hidden)return;
  clearReport();running=true;const ticket=++generation;
  const count=Number(countInput.value),label=labelInput.value.trim();
  start.disabled=true;countInput.disabled=true;labelInput.disabled=true;progress.value=0;
  status.textContent='Preparing actor state…';
  function fail(error){if(ticket!==generation)return;ready();clearReport();status.textContent='Run failed. '+error.message;}
  requestAnimationFrame(()=>{
    if(ticket!==generation)return;
    try{
      const work=createLifecycleWorkload(data.pack,data.definition,count);
      const times=[];let completed=0,initialBuilds=null;
      const quantum=timerResolution();
      function advance(){
        if(ticket!==generation)return;
        if(document.hidden){interrupt();return;}
        try{
          const begin=performance.now();
          for(let i=0;i<batch;i++)work.frame();
          const duration=performance.now()-begin;
          if(completed>=warmup)times.push(duration/batch);
          completed+=batch;progress.value=completed;
          if(completed===warmup)initialBuilds=work.read().planBuilds;
          if(completed===batch)status.textContent='Warming up…';
          if(completed===warmup)status.textContent='Measuring 1,200 fixed-step updates…';
          if(completed===warmup+measured){
            if(times.length!==60)throw Error('Unexpected sample count');
            reportResult(count,label,work.read(),times,quantum,initialBuilds);ready();
          }else requestAnimationFrame(advance);
        }catch(error){fail(error);}
      }
      requestAnimationFrame(advance);
    }catch(error){fail(error);}
  });
});
byId('version').textContent='SDK '+data.sdk.version+' · course '+data.course.version;
