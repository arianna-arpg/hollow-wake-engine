import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';
import {buildEmbeddedExecutable} from '../../../scripts/embedded-native-tools.mjs';
import {prepareCStringCleanup} from './cstring-cleanup.mjs';
import {qualificationSources,verifyCStringRowsV2} from './verify-cstring-v2.mjs';

const args=process.argv.slice(2);
assert.equal(args.length,4);assert.equal(args[0],'--upstream');assert.equal(args[2],'--output');
const upstream=fs.realpathSync(args[1]),output=path.resolve(args[3]);
assert(!fs.existsSync(output)&&!fs.existsSync(output+'.raw.json.gz'),'Evidence output must be fresh');
const lock=JSON.parse(fs.readFileSync(path.join(root,'experiments/embedded-js/host-source-lock.json')));
const relative='experiments/embedded-js/patches/';
const report={schemaVersion:1,contractRevision:2,passed:false,scope:'Cold original/candidate behavior and strict initialized ownership; no production adoption',
  platform:process.platform,arch:process.arch,node:process.version,upstream:lock,
  sources:Object.fromEntries(qualificationSources.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))])),controls:[],rows:[]};
const artifacts=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(artifacts,'cstring-qualification-v2-')),raw={};
try {
  for(const[file,digest]of Object.entries(lock.files))assert.equal(sha256(fs.readFileSync(path.join(upstream,file))),digest,file);
  const prepared=prepareCStringCleanup(upstream,path.join(work,'patched'));report.patch=prepared;
  const refuse=(name,source,destination,pattern)=>{assert.throws(()=>prepareCStringCleanup(source,destination),pattern,name);report.controls.push(name);};
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
  const missing=path.join(work,'missing-parent','result');refuse('missing-parent',upstream,missing,/ENOENT/);assert(!fs.existsSync(missing));
  const source=path.join(work,'contracts.c');fs.copyFileSync(path.join(root,relative,'cstring-contracts-v2.c'),source);
  fs.copyFileSync(path.join(root,'experiments/embedded-js/tracked-allocator.h'),path.join(work,'tracked-allocator.h'));
  for(const variant of ['original','patched',...(process.platform==='linux'?['original-sanitized','patched-sanitized']:[])]){
    const directory=path.join(work,variant+'-build');fs.mkdirSync(directory);
    const selected=variant.startsWith('original')?upstream:prepared.directory,sanitized=variant.endsWith('-sanitized');
    let built;
    const sanitizers=sanitized?{ASAN_OPTIONS:'detect_leaks=1:halt_on_error=1',UBSAN_OPTIONS:'halt_on_error=1:print_stacktrace=1'}:null;
    if(sanitized){
      const compiler=process.env.CC??'cc',binary=path.join(directory,'contracts');
      const flags=['-std=gnu11','-O1','-g','-D_GNU_SOURCE','-funsigned-char','-fno-fast-math','-ffp-contract=off',
        '-fsanitize=address,undefined','-fno-omit-frame-pointer','-fno-sanitize-recover=all','-isystem',selected];
      const commands=[{command:compiler,args:[...flags,source,path.join(selected,'quickjs-amalgam.c'),'-lm','-ldl','-pthread','-o',binary]}];
      const env={...process.env,TMPDIR:directory,TMP:directory,TEMP:directory,...sanitizers};
      const fd=fs.openSync(path.join(directory,'build.txt'),'wx');
      try{execFileSync(compiler,commands[0].args,{cwd:directory,env,stdio:['ignore',fd,fd],timeout:180000});}finally{fs.closeSync(fd);}
      built={binary,env,commands,compilerBanner:execFileSync(compiler,['--version'],{cwd:directory,env,encoding:'utf8'}).trim()};
    }else built=buildEmbeddedExecutable(directory,selected,source,'contracts');
    for(const mode of ['cold','warm']){
      const name=variant+'-'+mode;
      const completed=spawnSync(built.binary,[mode],{cwd:directory,env:built.env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:32*1024*1024});
      raw[name]={stdout:completed.stdout,stderr:completed.stderr,build:fs.readFileSync(path.join(directory,'build.txt'),'utf8'),
        process:{status:completed.status,signal:completed.signal,error:completed.error?.message??null}};
      const cases=completed.stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
      report.rows.push({variant:name,sanitized,warm:mode==='warm',sanitizers,commands:built.commands,compiler:built.compilerBanner,
        ...raw[name].process,cases});
      assert(!completed.error&&!completed.signal);assert.equal(cases.length,210);
      console.log({variant:name,cases:cases.length,retryFailures:cases.filter(row=>!row.retryValid).length,leaks:cases.filter(row=>row.liveBytes>0).length,status:completed.status});
    }
  }
  report.summary=verifyCStringRowsV2(report,raw);report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
  try{
    report.inputsUnchanged=Object.entries(report.sources).every(([file,digest])=>sha256(fs.readFileSync(path.join(root,file)))===digest)&&
      Object.entries(lock.files).every(([file,digest])=>sha256(fs.readFileSync(path.join(upstream,file)))===digest);
    report.preparedUnchanged=report.patch!==undefined&&Object.entries(report.patch.files).every(([file,digest])=>sha256(fs.readFileSync(path.join(report.patch.directory,file)))===digest);
    const packed=gzipSync(JSON.stringify(raw),{level:9});fs.writeFileSync(output+'.raw.json.gz',packed,{flag:'wx'});report.rawSha256=sha256(packed);
  }finally{
    assert.equal(path.dirname(fs.realpathSync(work)),artifacts);fs.rmSync(work,{recursive:true,force:true});report.cleaned=true;
    report.passed=report.passed&&report.inputsUnchanged===true&&report.preparedUnchanged===true;
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  assert(report.inputsUnchanged&&report.preparedUnchanged,'Qualification sources changed');
}
console.log({passed:report.passed,controls:report.controls.length,cleaned:report.cleaned});
