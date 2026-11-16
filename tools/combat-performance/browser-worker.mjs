let running=false,hidden=false;
const quantiles=values=>{const a=[...values].sort((a,b)=>a-b);return {samples:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],p99:a[Math.min(a.length-1,Math.floor(a.length*.99))],max:a.at(-1),zeroSamples:a.filter(n=>n===0).length};};
// A non-security repeatability fingerprint works on a phone's local HTTP URL.
// Exact baseline/candidate trace acceptance belongs to the Node SHA-256 course.
const fingerprint=value=>{let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return (hash>>>0).toString(16)+':'+value.length;};
onmessage=async ({data})=>{
 if(data.hidden){hidden=true;return;}if(running)return;running=true;
 const report={schemaVersion:1,mode:'browser-timing',environment:data,passed:false,courses:[],startedAt:new Date().toISOString(),
  limits:['Operation timing excludes rendering and combat transport. Content import includes script download, parsing and initialization.','No memory or allocation figures; browser APIs do not provide comparable values.',
   'Browser timing precision varies; zero-duration samples indicate insufficient per-operation timer resolution.','Device qualification also requires sustained thermal and full game testing.']};
 try{
  const start=performance.now(),{createCourse,specification}=await import('./workload.mjs');report.contentImportMs=performance.now()-start;report.specification=specification;
  report.manifest=await (await fetch('./manifest.json')).json();
  for(const name of specification.courses){
   const combat=name.includes('-32')||name.includes('-128'),warmup=combat?specification.warmup:5,samples=combat?specification.frames:30,row={name,runs:[]};
   for(let round=0;round<3;round++){
    const course=createCourse(name),times=[];
    try{
     for(let i=0;i<warmup;i++){course.prepare?.();course.step();}
     const batchStart=performance.now();
     for(let i=0;i<samples;i++){course.prepare?.();const before=performance.now();course.step();times.push(performance.now()-before);}
     const batchIncludingSetupMs=performance.now()-batchStart,receiptFingerprint=fingerprint(JSON.stringify(course.observe()));
     row.runs.push({samples,warmup,operationMs:quantiles(times),batchIncludingSetupMs,receiptFingerprint});
    }finally{course.close();}
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(!row.runs.every(r=>r.receiptFingerprint===row.runs[0].receiptFingerprint))throw Error('Nondeterministic course: '+name);
   report.courses.push(row);postMessage({progress:name+': '+row.runs.map(r=>r.operationMs.median.toFixed(3)+' ms median').join(', ')});
  }
  report.passed=!hidden;report.hiddenDuringRun=hidden;if(hidden)report.failure='Tab was hidden; repeat with the tab visible.';
 }catch(error){report.failure=String(error.stack??error);}
 postMessage(report);
};
