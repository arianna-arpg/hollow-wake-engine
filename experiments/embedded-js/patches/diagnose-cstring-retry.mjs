import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';import {prepareCStringCleanup} from './cstring-cleanup.mjs';
const args=process.argv.slice(2);assert.equal(args.length,4);assert.equal(args[0],'--upstream');assert.equal(args[2],'--output');
assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
const upstream=fs.realpathSync(args[1]),output=path.resolve(args[3]);assert(!fs.existsSync(output)&&!fs.existsSync(output+'.raw.json.gz'));
const artifacts=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(artifacts,'cstring-retry-diagnostic-'));
const relative='experiments/embedded-js/patches/';
const sources=[...['diagnose-cstring-retry.mjs','cstring-contracts.c','cstring-cleanup.mjs','cstring-cleanup.json'].map(file=>relative+file),
 'experiments/embedded-js/host-source-lock.json','experiments/embedded-js/tracked-allocator.h'];
const report={exploratory:true,completed:false,scope:'Diagnose sanitizer-only retry failures; no acceptance or production change',
 sources:Object.fromEntries(sources.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))])),rows:[]},raw={};
try{
 const prepared=prepareCStringCleanup(upstream,path.join(work,'patched'));report.patch=prepared;
 const original=fs.readFileSync(path.join(root,relative,'cstring-contracts.c'),'utf8');
 const replace=(text,needle,value)=>{assert.equal(text.split(needle).length,2,needle);return text.replace(needle,value);};
 let diagnostic=replace(original,'static void clear_exception(JSContext *ctx) { JS_FreeValue(ctx, JS_GetException(ctx)); }',
  'static const char *current_case, *current_stage;\nstatic size_t current_after;\n'+
  'static void clear_exception(JSContext *ctx) {\n'+
  ' JSValue error=JS_GetException(ctx);\n'+
  ' JSValue message=JS_IsError(error)?JS_GetPropertyStr(ctx,error,"message"):JS_UNDEFINED;\n'+
  ' const char *text=JS_IsString(message)?JS_ToCString(ctx,message):NULL;\n'+
  ' fprintf(stderr,"case=%s after=%zu stage=%s error=%s\\n",current_case,current_after,current_stage,text?text:"<no string message>");\n'+
  ' if(text)JS_FreeCString(ctx,text);JS_FreeValue(ctx,message);JS_FreeValue(ctx,error);\n}');
 diagnostic=replace(diagnostic,'    FaultHeap heap = {0};','    current_case=test->name;current_after=after;current_stage="setup";\n    FaultHeap heap = {0};');
 diagnostic=replace(diagnostic,'    size_t length = SIZE_MAX;','    current_stage="conversion";\n    size_t length = SIZE_MAX;');
 diagnostic=replace(diagnostic,'    size_t retry_length = 0;','    current_stage="retry";\n    size_t retry_length = 0;');
 diagnostic=replace(diagnostic,'    if (retry) JS_FreeCString(ctx, retry);','    if (!retry && !test->throws) clear_exception(ctx);\n    if (retry) JS_FreeCString(ctx, retry);');
 fs.copyFileSync(path.join(root,'experiments/embedded-js/tracked-allocator.h'),path.join(work,'tracked-allocator.h'));
 for(const variant of ['original','patched','original-warm','patched-warm']){
  const directory=path.join(work,variant+'-build');fs.mkdirSync(directory);
  let source=diagnostic;
  if(variant.endsWith('-warm'))source=replace(source,'    heap.after = after; heap.armed = 1;',
   '    size_t warm_length=0;const char *warm=JS_ToCStringLen2(ctx,&warm_length,value,test->cesu8!=0);\n'+
   '    if(test->throws){assert(!warm);clear_exception(ctx);}else{assert(warm);JS_FreeCString(ctx,warm);}\n'+
   '    heap.after = after; heap.armed = 1;');
  const file=path.join(work,variant+'.c');fs.writeFileSync(file,source);
  const selected=variant.startsWith('original')?upstream:prepared.directory,binary=path.join(directory,'contracts'),cc=process.env.CC??'cc';
  const flags=['-std=gnu11','-O1','-g','-D_GNU_SOURCE','-funsigned-char','-fno-fast-math','-ffp-contract=off',
   '-fsanitize=address,undefined','-fno-omit-frame-pointer','-fno-sanitize-recover=all','-isystem',selected,
   file,path.join(selected,'quickjs-amalgam.c'),'-lm','-ldl','-pthread','-o',binary];
  const env={...process.env,TMPDIR:directory,TEMP:directory,TMP:directory,ASAN_OPTIONS:'detect_leaks=1:halt_on_error=1',UBSAN_OPTIONS:'halt_on_error=1:print_stacktrace=1'};
  const fd=fs.openSync(path.join(directory,'build.txt'),'wx');
  try{execFileSync(cc,flags,{cwd:directory,env,stdio:['ignore',fd,fd],timeout:180000});}finally{fs.closeSync(fd);}
  const result=spawnSync(binary,[],{cwd:directory,env,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
  raw[variant]={source,stdout:result.stdout,stderr:result.stderr,build:fs.readFileSync(path.join(directory,'build.txt'),'utf8')};
  const cases=result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  report.rows.push({variant,compiler:cc,flags,status:result.status,signal:result.signal,error:result.error?.message??null,cases});
  assert(!result.error&&!result.signal);assert([0,1].includes(result.status));assert.equal(cases.length,210);
  console.log({variant,status:result.status,contentFailures:cases.filter(row=>!row.contentPassed).length,leaks:cases.filter(row=>row.liveBytes>0).length});
 }
 report.completed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{
  report.inputsUnchanged=Object.entries(report.sources).every(([file,digest])=>sha256(fs.readFileSync(path.join(root,file)))===digest);
  report.upstreamUnchanged=report.patch!==undefined&&Object.entries(report.patch.original)
   .every(([file,digest])=>sha256(fs.readFileSync(path.join(upstream,file)))===digest);
  report.preparedUnchanged=report.patch!==undefined&&Object.entries(report.patch.files)
   .every(([file,digest])=>sha256(fs.readFileSync(path.join(report.patch.directory,file)))===digest);
  const packed=gzipSync(JSON.stringify(raw),{level:9});fs.writeFileSync(output+'.raw.json.gz',packed,{flag:'wx'});report.rawSha256=sha256(packed);
 }finally{
  assert.equal(path.dirname(fs.realpathSync(work)),artifacts);fs.rmSync(work,{recursive:true,force:true});report.cleaned=true;
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 }
 assert(report.inputsUnchanged&&report.upstreamUnchanged&&report.preparedUnchanged);
}
