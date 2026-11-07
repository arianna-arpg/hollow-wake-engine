import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';

const [sqliteFlag,archive,pythonFlag,python,outputFlag,output,...extra]=process.argv.slice(2);
assert.deepEqual([sqliteFlag,pythonFlag,outputFlag],['--sqlite','--python','--output']);
let libraryProof=null;
const libraryAt=extra.indexOf('--library');
if(libraryAt!==-1){
  assert(extra[libraryAt+1]&&!extra[libraryAt+1].startsWith('--'),'--library requires a build receipt');
  libraryProof=path.resolve(extra[libraryAt+1]);extra.splice(libraryAt,2);
}
assert(extra.length===new Set(extra).size&&extra.every(flag=>['--mutations','--managed'].includes(flag)));
assert(!fs.existsSync(output),'Choose a fresh receipt');
assert(['win32','linux'].includes(process.platform)&&process.arch==='x64');
const pin=JSON.parse(fs.readFileSync(path.join(root,'adapters/godot/local-save/sqlite-lock.json')));
assert.equal(createHash('sha3-256').update(fs.readFileSync(archive)).digest('hex'),pin.sha3_256);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const dir=fs.mkdtempSync(path.join(root,'.artifacts/portable-save-test-'));
const before=Object.fromEntries(['TEMP','TMP','TMPDIR'].map(key=>[key,process.env[key]]));
try {
  for(const key of Object.keys(before))process.env[key]=dir;
  const env={...nativeEnvironment(dir),TEMP:dir,TMP:dir,TMPDIR:dir};
  const run=(exe,args)=>execFileSync(exe,args,{cwd:dir,env,stdio:'pipe',encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});
  const code=['import pathlib,sys,zipfile','with zipfile.ZipFile(sys.argv[1]) as archive:',
    ' for name in ("sqlite3.c","sqlite3.h"):',
    '  with (pathlib.Path(sys.argv[3])/name).open("xb") as out: out.write(archive.read(sys.argv[2]+"/"+name))'].join('\n');
  run(python,['-I','-B','-c',code,path.resolve(archive),pin.directory,dir]);
  const win=process.platform==='win32',object=path.join(dir,win?'sqlite3.obj':'sqlite3.o');
  const log=[];
  log.push(run(win?'cl.exe':process.env.CC??'cc',win
    ? ['/nologo','/O2','/MT','/W0','/c','/DSQLITE_OMIT_LOAD_EXTENSION','/DSQLITE_THREADSAFE=1','/DSQLITE_DQS=0',path.join(dir,'sqlite3.c'),'/Fo:'+object]
    : ['-O2','-fPIC','-fvisibility=hidden','-c','-DSQLITE_OMIT_LOAD_EXTENSION','-DSQLITE_THREADSAFE=1','-DSQLITE_DQS=0',path.join(dir,'sqlite3.c'),'-o',object]));
  const executable=path.join(dir,win?'contracts.exe':'contracts');
  const source=path.join(root,'native/save/src/slot-store.cpp'),test=path.join(root,'test/portable-save.cpp'),include=path.join(root,'native/save/include');
  const compile=source=>run(win?'cl.exe':process.env.CXX??'c++',win
    ? ['/nologo','/std:c++17','/EHsc','/O2','/W4','/WX','/MT','/utf-8','/I'+dir,'/I'+include,source,test,object,'/Fe:'+executable,'/Fo:'+dir+path.sep]
    : ['-std=c++17','-O2','-Wall','-Wextra','-Werror','-pthread','-I',dir,'-I',include,source,test,object,'-ldl','-o',executable]);
  log.push(compile(source));
  const fixtures=path.join(dir,'fixtures');fs.mkdirSync(fixtures);
  const result=JSON.parse(run(executable,[fixtures]));
  assert(result.passed);
  const mutations=[];
  if(extra.includes('--mutations')){
    const original=fs.readFileSync(source,'utf8');
    const cases=[
      ['stale-update','revision=revision+1 WHERE slot=?1 AND revision=?4','revision=revision+1 WHERE slot=?1 AND revision>=?4','reason(owner.stage_slot(1,1,"stale","stale"),"stale-revision")',1],
      ['paired-document','sqlite3_bind_text(q.value, 2, body, body_size, SQLITE_TRANSIENT);\n        if (rc == SQLITE_OK) rc = sqlite3_bind_text(q.value, 3, stash, stash_size, SQLITE_TRANSIENT)','sqlite3_bind_text(q.value, 2, stash, stash_size, SQLITE_TRANSIENT);\n        if (rc == SQLITE_OK) rc = sqlite3_bind_text(q.value, 3, body, body_size, SQLITE_TRANSIENT)','peer.read_slot(1,value).ok() && value.revision == 1 && value.crafting == body && value.stash == stash',1],
      ['lost-commit','const int rc = execute("COMMIT");','const int rc = execute("SELECT 1");','peer.read_slot(1,value).ok() && value.revision == 1 && value.crafting == body && value.stash == stash',1],
      ['lost-rollback','if (!sqlite3_get_autocommit(db) && execute("ROLLBACK") != SQLITE_OK) close_locked();','if (!sqlite3_get_autocommit(db)) return;','staged.ok() && owner.cancel_slot(staged.token).ok()',1],
      ['payload-limit','body.size() <= SlotStore::max_bytes','body.size() <= SlotStore::max_bytes+1','reason(owner.stage_slot(1,1,std::string(SlotStore::max_bytes+1,\'x\'),"y"),"payload-size")',1],
      ['split-update','SET crafting=?2,stash=?3,revision=revision+1','SET crafting=?2,stash=stash,revision=revision+1','owner.read_slot(1,value).ok() && value.revision == 2 && value.crafting == body + " " && value.stash == stash + " "',1],
      ['hidden-commit-error','if (rc != SQLITE_OK) { rollback(); return failure(rc); }','if (rc != SQLITE_OK) { rollback(); return {}; }','reason(owner.commit_slot(staged.token),"busy")',1],
      ['wrong-token','if (!db || !pending || pending != token) return {"invalid-token"};','if (!db || !pending || pending > token) return {"invalid-token"};','reason(owner.commit_slot(staged.token + 1),"invalid-token")',2]
    ];
    for(const [name,from,to,expected,count]of cases){
      assert.equal(original.split(from).length-1,count,name+' anchor');
      const candidate=path.join(dir,name+'.cpp'),fixture=path.join(dir,name);
      fs.writeFileSync(candidate,original.replace(from,to));fs.mkdirSync(fixture);
      log.push(compile(candidate));
      let detected=false;
      try{run(executable,[fixture]);}catch(error){
        assert.equal(error.status,1,name+': unexpected process failure');
        assert(String(error.stderr??'').includes('Failed: '+expected),name+': '+error.stderr);
        detected=true;
      }
      assert(detected,name+' escaped');
      mutations.push({name,detected});
    }
  }
  let library=path.join(dir,win?'hwe_save.dll':'libhwe_save.so'),link=win?path.join(dir,'hwe_save.lib'):library;
  const abiSource=path.join(root,'native/save/src/hwe_save.cpp'),consumer=path.join(root,'test/portable-save-c.c');
  if(libraryProof){
    const proof=JSON.parse(fs.readFileSync(libraryProof)),delivery=path.dirname(libraryProof);
    assert(proof.passed&&proof.abi===1&&proof.platform===process.platform&&proof.arch===process.arch);
    assert.deepEqual(proof.sqlite,pin);
    for(const [file,digest]of Object.entries(proof.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),digest,file);
    for(const [file,record]of Object.entries(proof.files)){
      assert.equal(path.basename(file),file);
      const bytes=fs.readFileSync(path.join(delivery,file));assert.equal(bytes.length,record.bytes);assert.equal(sha256(bytes),record.sha256);
    }
    library=path.join(delivery,proof.library);link=win?path.join(delivery,proof.importLibrary):library;
    assert.equal(sha256(fs.readFileSync(library)),proof.librarySha256);
    fs.copyFileSync(library,path.join(dir,path.basename(library)));
  } else log.push(run(win?'cl.exe':process.env.CXX??'c++',win
    ? ['/nologo','/std:c++17','/EHsc','/O2','/W4','/WX','/MT','/utf-8','/LD','/DHWE_SAVE_SHARED','/DHWE_SAVE_BUILD',
      '/I'+dir,'/I'+include,source,abiSource,object,'/Fe:'+library,'/Fo:'+dir+path.sep,'/link','/IMPLIB:'+link]
    : ['-std=c++17','-O2','-Wall','-Wextra','-Werror','-pthread','-fPIC','-shared','-fvisibility=hidden',
      '-DHWE_SAVE_SHARED','-DHWE_SAVE_BUILD','-I',dir,'-I',include,source,abiSource,object,'-ldl','-o',library]));
  const abiExe=path.join(dir,win?'c-api.exe':'c-api');
  log.push(run(win?'cl.exe':process.env.CC??'cc',win
    ? ['/nologo','/std:c11','/O2','/W4','/WX','/MT','/utf-8','/DHWE_SAVE_SHARED','/I'+include,consumer,link,
      '/Fe:'+abiExe,'/Fo:'+dir+path.sep]
    : ['-std=c11','-O2','-Wall','-Wextra','-Werror','-DHWE_SAVE_SHARED','-I',include,consumer,link,'-Wl,-rpath,$ORIGIN','-o',abiExe]));
  const cAbi=JSON.parse(run(abiExe,[fixtures]));assert(cAbi.passed);
  const symbolText=run(win?'dumpbin.exe':'nm',win?['/nologo','/exports',library]:['-D','--defined-only','--format=posix',library]);
  const symbols=symbolText.split(/\r?\n/).flatMap(line=>{
    const match=win?line.match(/^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+(\S+)/i):line.match(/^(\S+)\s+[A-Za-z]\s/);
    return match?[match[1]]:[];
  });
  const expectedExports=[...fs.readFileSync(path.join(include,'hwe_save.h'),'utf8').matchAll(/HWE_SAVE_API[^;]+?\b(hwe_save_\w+)\(/g)]
    .map(match=>match[1]).sort();
  assert(expectedExports.length>10);
  assert.deepEqual(symbols.filter(name=>name.startsWith('hwe_save_')).sort(),expectedExports,'C ABI exports');
  assert(!symbols.some(name=>/^_?sqlite3/.test(name)),'SQLite symbols must remain private to the plugin');
  let sanitizers=null;
  if(!win){
    const sanitized=path.join(dir,'sanitized');fs.mkdirSync(sanitized);
    const instrumentation=['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer'];
    const checkedObject=path.join(sanitized,'sqlite3.o'),checkedLibrary=path.join(sanitized,'libhwe_save.so');
    log.push(run(process.env.CC??'cc',[...instrumentation,'-fPIC','-fvisibility=hidden','-c',
      '-DSQLITE_OMIT_LOAD_EXTENSION','-DSQLITE_THREADSAFE=1','-DSQLITE_DQS=0',path.join(dir,'sqlite3.c'),'-o',checkedObject]));
    const common=['-std=c++17',...instrumentation,'-Wall','-Wextra','-Werror','-pthread','-I',dir,'-I',include];
    const checkedExe=path.join(sanitized,'contracts'),checkedC=path.join(sanitized,'c-api');
    log.push(run(process.env.CXX??'c++',[...common,source,test,checkedObject,'-ldl','-o',checkedExe]));
    log.push(run(process.env.CXX??'c++',[...common,'-fPIC','-shared','-fvisibility=hidden','-fvisibility-inlines-hidden',
      '-DHWE_SAVE_SHARED','-DHWE_SAVE_BUILD',source,abiSource,checkedObject,'-ldl','-o',checkedLibrary]));
    log.push(run(process.env.CC??'cc',['-std=c11',...instrumentation,'-Wall','-Wextra','-Werror','-DHWE_SAVE_SHARED',
      '-I',include,consumer,checkedLibrary,'-Wl,-rpath,$ORIGIN','-o',checkedC]));
    const checkedFixtures=path.join(sanitized,'fixtures');fs.mkdirSync(checkedFixtures);
    const saved={ASAN_OPTIONS:env.ASAN_OPTIONS,UBSAN_OPTIONS:env.UBSAN_OPTIONS};
    try{
      env.ASAN_OPTIONS='detect_leaks=1:halt_on_error=1';env.UBSAN_OPTIONS='halt_on_error=1';
      const core=JSON.parse(run(checkedExe,[checkedFixtures])),c=JSON.parse(run(checkedC,[checkedFixtures]));
      assert(core.passed&&c.passed);
      sanitizers={passed:true,address:true,undefinedBehavior:true,leakDetection:true,core,cAbi:c,
        scope:'Instrumented SQLite, C++ store and C ABI consumers; separate from the delivered Release binary.'};
    }finally{
      for(const [key,value]of Object.entries(saved))if(value===undefined)delete env[key];else env[key]=value;
    }
  }
  let managed=null,managedSdk=null;
  if(extra.includes('--managed')){
    const project=path.join(dir,'managed'),app=path.join(project,'app');fs.mkdirSync(project);
    for(const name of ['Program.cs','PortableSave.csproj','NuGet.Config'])
      fs.copyFileSync(path.join(root,'test/portable-save-dotnet',name),path.join(project,name));
    fs.copyFileSync(path.join(root,'native/save/bindings/dotnet/SlotStore.cs'),path.join(project,'SlotStore.cs'));
    env.DOTNET_CLI_HOME=path.join(dir,'dotnet-home');
    env.DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1';env.DOTNET_CLI_TELEMETRY_OPTOUT='1';
    env.DOTNET_GENERATE_ASPNET_CERTIFICATE='false';env.DOTNET_NOLOGO='1';
    env.NUGET_PACKAGES=path.join(dir,'nuget');
    managedSdk=run('dotnet',['--list-sdks']).split(/\r?\n/).map(line=>line.split(' ')[0])
      .filter(version=>/^8\.\d+\.\d+$/.test(version)).sort((a,b)=>{
        const aa=a.split('.').map(Number),bb=b.split('.').map(Number);return aa[1]-bb[1]||aa[2]-bb[2];
      }).at(-1);
    assert(managedSdk,'Install the .NET 8 SDK with its offline targeting packs');
    writeJSON(path.join(dir,'global.json'),{sdk:{version:managedSdk,rollForward:'disable'}});
    assert.equal(run('dotnet',['--version']).trim(),managedSdk);
    log.push(run('dotnet',['build',path.join(project,'PortableSave.csproj'),'-c','Release','-o',app,
      '--configfile',path.join(project,'NuGet.Config'),'-p:NuGetAudit=false','-p:UseSharedCompilation=false','--disable-build-servers']));
    fs.copyFileSync(library,path.join(app,path.basename(library)));
    managed=JSON.parse(run('dotnet',[path.join(app,'PortableSave.dll'),fixtures]));assert(managed.passed);
  }
  const files=['native/save/include/slot-store.hpp','native/save/include/write-worker.hpp',
    'native/save/src/slot-store.cpp','native/save/include/hwe_save.h','native/save/src/hwe_save.cpp',
    'test/portable-save.cpp','test/portable-save-c.c','scripts/test-portable-save.mjs',
    'native/save/bindings/dotnet/SlotStore.cs','test/portable-save-dotnet/Program.cs',
    'test/portable-save-dotnet/PortableSave.csproj','test/portable-save-dotnet/NuGet.Config'];
  writeJSON(path.resolve(output),{...result,mutations,cAbi,managed,managedSdk,sanitizers,
    exports:expectedExports,sqliteExportsPrivate:true,symbolTableSha256:sha256(symbolText),
    platform:process.platform,arch:process.arch,sqlite:pin,
    suppliedBuildReceiptSha256:libraryProof?sha256(fs.readFileSync(libraryProof)):null,
    librarySha256:sha256(fs.readFileSync(library)),libraryBytes:fs.statSync(library).size,
    sources:Object.fromEntries(files.map(f=>[f,sha256(fs.readFileSync(path.join(root,f)))])),
    buildSha256:sha256(log.join('\n')),engineCompatibilityClaim:false});
  console.log({...result,mutations,cAbi,managed});
} finally {
  for(const [key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;
  assert.equal(path.dirname(dir),path.join(root,'.artifacts'));
  fs.rmSync(dir,{recursive:true,force:true});
}
