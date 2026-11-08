import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';
import {buildEmbeddedExecutable} from '../../../scripts/embedded-native-tools.mjs';
import {prepareCStringCleanup} from './cstring-cleanup.mjs';

const args=process.argv.slice(2);
assert.equal(args.length,4,'Use --upstream pinned-source-directory --output fresh-report.json');
assert.equal(args[0],'--upstream');assert.equal(args[2],'--output');
const upstream=fs.realpathSync(args[1]),output=path.resolve(args[3]);
assert(!fs.existsSync(output)&&!fs.existsSync(output+'.raw.json.gz'),'Evidence output must be fresh');
const lock=JSON.parse(fs.readFileSync(path.join(root,'experiments/embedded-js/host-source-lock.json')));
const relative='experiments/embedded-js/patches/';
const sources=[...['cstring-cleanup.json','cstring-cleanup.mjs','cstring-contracts.c','test-cstring-cleanup.mjs'].map(file=>relative+file),
  'experiments/embedded-js/tracked-allocator.h','experiments/embedded-js/host-source-lock.json',
  'scripts/embedded-native-tools.mjs','scripts/native-tools.mjs','scripts/reference-utils.mjs'];
const report={schemaVersion:1,passed:false,scope:'Pinned private upstream cleanup candidate; no production or engine-package adoption',
  platform:process.platform,arch:process.arch,node:process.version,upstream:lock,
  sources:Object.fromEntries(sources.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))])),controls:[],rows:[]};
const artifacts=fs.realpathSync(path.join(root,'.artifacts'));
const work=fs.mkdtempSync(path.join(artifacts,'embedded-cstring-cleanup-')),raw={};
try {
  for(const[file,digest]of Object.entries(lock.files))assert.equal(sha256(fs.readFileSync(path.join(upstream,file))),digest,file);
  const prepared=prepareCStringCleanup(upstream,path.join(work,'patched'));report.patch=prepared;
  const refuse=(name,source,destination,pattern)=>{
    assert.throws(()=>prepareCStringCleanup(source,destination),pattern,name);
    report.controls.push(name);
  };
  refuse('existing-destination',upstream,prepared.directory,/must be fresh/);
  refuse('inside-original',upstream,path.join(upstream,'candidate-must-not-exist'),/outside the original/);
  assert(!fs.existsSync(path.join(upstream,'candidate-must-not-exist')));
  const repeated=path.join(work,'twice');refuse('already-patched',prepared.directory,repeated,/Pinned upstream differs/);assert(!fs.existsSync(repeated));
  for(const file of Object.keys(lock.files)){
    const input=path.join(work,'changed-'+file),destination=path.join(work,'rejected-'+file);fs.mkdirSync(input);
    for(const name of Object.keys(lock.files))fs.copyFileSync(path.join(upstream,name),path.join(input,name));
    fs.appendFileSync(path.join(input,file),'\n');
    refuse('drift-'+file,input,destination,/Pinned upstream differs/);assert(!fs.existsSync(destination));
  }
  const missing=path.join(work,'missing-parent','result');
  refuse('missing-parent',upstream,missing,/ENOENT/);assert(!fs.existsSync(missing));
  const source=path.join(work,'contracts.c');fs.copyFileSync(path.join(root,relative,'cstring-contracts.c'),source);
  fs.copyFileSync(path.join(root,'experiments/embedded-js/tracked-allocator.h'),path.join(work,'tracked-allocator.h'));
  for(const variant of ['original','patched',...(process.platform==='linux'?['patched-sanitized']:[])]){
    const directory=path.join(work,variant+'-build');fs.mkdirSync(directory);
    let built;
    if(variant==='patched-sanitized'){
      const compiler=process.env.CC??'cc',binary=path.join(directory,'contracts');
      const flags=['-std=gnu11','-O1','-g','-D_GNU_SOURCE','-funsigned-char','-fno-fast-math','-ffp-contract=off',
        '-fsanitize=address,undefined','-fno-omit-frame-pointer','-fno-sanitize-recover=all','-isystem',prepared.directory];
      const commands=[{command:compiler,args:[...flags,source,path.join(prepared.directory,'quickjs-amalgam.c'),
        '-lm','-ldl','-pthread','-o',binary]}];
      const env={...process.env,TMPDIR:directory,TMP:directory,TEMP:directory,
        ASAN_OPTIONS:'detect_leaks=1:halt_on_error=1',UBSAN_OPTIONS:'halt_on_error=1:print_stacktrace=1'};
      const fd=fs.openSync(path.join(directory,'build.txt'),'wx');
      try {execFileSync(compiler,commands[0].args,{cwd:directory,env,stdio:['ignore',fd,fd],timeout:180000});}
      finally {fs.closeSync(fd);}
      built={binary,env,commands,compilerBanner:execFileSync(compiler,['--version'],{cwd:directory,env,encoding:'utf8'}).trim()};
    }else built=buildEmbeddedExecutable(directory,variant==='original'?upstream:prepared.directory,source,'contracts');
    const completed=spawnSync(built.binary,[],{cwd:directory,env:built.env,encoding:'utf8',windowsHide:true,
      timeout:60000,maxBuffer:8*1024*1024});
    raw[variant]={stdout:completed.stdout,stderr:completed.stderr,build:fs.readFileSync(path.join(directory,'build.txt'),'utf8')};
    const cases=completed.stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
    report.rows.push({variant,sanitized:variant==='patched-sanitized',commands:built.commands,compiler:built.compilerBanner,
      status:completed.status,signal:completed.signal,error:completed.error?.message??null,cases});
    assert(!completed.error&&!completed.signal);assert.equal(cases.length,210);
    assert(cases.every(row=>row.contentPassed===1),'Encoding, length or retry behavior changed');
    const keys=cases.map(row=>JSON.stringify([row.case,row.after,row.nullLength]));assert.equal(new Set(keys).size,210);
    if(variant==='original'){
      assert.equal(completed.status,1,'Original code must expose the leak');
      assert(cases.some(row=>row.case==='wide'&&row.conversionFailed&&row.liveBytes>0&&!row.passed));
      assert(cases.filter(row=>!row.passed).every(row=>row.liveBytes>0&&row.liveBlocks>0),
        'Failing control must identify retained allocations, not an unrelated failure');
    }else{
      assert.equal(completed.status,0,completed.stderr);
      assert(cases.every(row=>row.passed&&row.liveBytes===0&&row.liveBlocks===0));
      assert(cases.some(row=>row.case==='wide'&&row.conversionFailed&&row.refused>0));
      assert(cases.some(row=>row.case==='ascii'&&!row.conversionFailed&&!row.refused));
    }
    console.log({variant,cases:cases.length,failed:cases.filter(row=>!row.passed).length,status:completed.status});
  }
  report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally {
  try {
    report.inputsUnchanged=Object.entries(report.sources).every(([file,digest])=>sha256(fs.readFileSync(path.join(root,file)))===digest)&&
      Object.entries(lock.files).every(([file,digest])=>sha256(fs.readFileSync(path.join(upstream,file)))===digest);
    report.preparedUnchanged=report.patch!==undefined&&Object.entries(report.patch.files)
      .every(([file,digest])=>sha256(fs.readFileSync(path.join(report.patch.directory,file)))===digest);
    const packed=gzipSync(JSON.stringify(raw),{level:9});
    fs.writeFileSync(output+'.raw.json.gz',packed,{flag:'wx'});report.rawSha256=sha256(packed);
  }finally{
    assert.equal(path.dirname(fs.realpathSync(work)),artifacts);fs.rmSync(work,{recursive:true,force:true});report.cleaned=true;
    report.passed=report.passed&&report.inputsUnchanged===true&&report.preparedUnchanged===true;
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  assert(report.inputsUnchanged,'Qualification inputs changed');
  assert(report.preparedUnchanged,'Prepared source changed');
}
console.log({passed:report.passed,controls:report.controls.length,cleaned:report.cleaned});
