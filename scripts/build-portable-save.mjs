import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {root,sha256,writeJSON,listFiles} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';

const [toolsFlag,toolsFile,sqliteFlag,archive,outputFlag,output,...rest]=process.argv.slice(2);
assert.deepEqual([toolsFlag,sqliteFlag,outputFlag,rest.length],['--tools','--sqlite','--output',0]);
assert(['win32','linux'].includes(process.platform)&&process.arch==='x64','Only x64 Windows/Linux builds are configured');
const out=path.resolve(output);assert(!fs.existsSync(out),'Choose a fresh delivery directory');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const tools=read(toolsFile),pin=read(path.join(root,'adapters/godot/local-save/sqlite-lock.json'));
for(const key of ['cmake','ninja','python'])assert.equal(typeof tools[key],'string',key);
assert.equal(createHash('sha3-256').update(fs.readFileSync(archive)).digest('hex'),pin.sha3_256);
const source=path.join(root,'native/save'),manifest=read(path.join(source,'package.json'));
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const dir=fs.mkdtempSync(path.join(root,'.artifacts/portable-save-build-'));
const prior=Object.fromEntries(['TEMP','TMP','TMPDIR'].map(key=>[key,process.env[key]]));
try {
  for(const key of Object.keys(prior))process.env[key]=dir;
  const env={...nativeEnvironment(dir),TEMP:dir,TMP:dir,TMPDIR:dir,PYTHONPYCACHEPREFIX:path.join(dir,'pycache')};
  const logs=[];
  const run=(exe,args)=>{
    const text=execFileSync(exe,args,{cwd:dir,env,encoding:'utf8',stdio:'pipe',windowsHide:true,timeout:300000,maxBuffer:4*1024*1024});
    logs.push(text);return text;
  };
  const vendor=path.join(dir,'sqlite'),build=path.join(dir,'build'),bin=path.join(dir,'bin');fs.mkdirSync(vendor);
  const unpack=['import pathlib,sys,zipfile','with zipfile.ZipFile(sys.argv[1]) as archive:',
    ' for name in ("sqlite3.c","sqlite3.h"):',
    '  with (pathlib.Path(sys.argv[3])/name).open("xb") as out: out.write(archive.read(sys.argv[2]+"/"+name))'].join('\n');
  run(tools.python,['-I','-B','-c',unpack,path.resolve(archive),pin.directory,vendor]);
  const cmake=run(tools.cmake,['--version']).split(/\r?\n/)[0];
  const ninja=run(tools.ninja,['--version']).trim(),python=run(tools.python,['--version']).trim();
  const configuration=run(tools.cmake,['-S',source,'-B',build,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_MAKE_PROGRAM='+tools.ninja,'-DSQLITE_SOURCE:PATH='+vendor,'-DHWE_OUTPUT:PATH='+bin]);
  const compiler=Object.fromEntries(['C','CXX'].map(language=>{
    const match=configuration.match(new RegExp('The '+language+' compiler identification is ([^\\r\\n]+)'));
    assert(match,'CMake must identify the '+language+' compiler');
    return [language,match[1].trim()];
  }));
  run(tools.cmake,['--build',build,'--parallel','4']);
  const library=process.platform==='win32'?'hwe_save.dll':'libhwe_save.so';
  const files={
    [library]:path.join(bin,library),
    'hwe_save.h':path.join(source,'include/hwe_save.h'),
    'SlotStore.cs':path.join(source,'bindings/dotnet/SlotStore.cs'),
    'README.md':path.join(source,'README.md'),
    'LICENSE.md':path.join(root,'LICENSE.md')
  };
  if(process.platform==='win32')files['hwe_save.lib']=path.join(bin,'hwe_save.lib');
  const stage=path.join(dir,'package');fs.mkdirSync(stage);
  for(const [name,file]of Object.entries(files))fs.copyFileSync(file,path.join(stage,name));
  fs.writeFileSync(path.join(stage,'SQLITE-NOTICE.txt'),'SQLite '+pin.version+' is public-domain software.\nhttps://www.sqlite.org/copyright.html\n');
  const sources=['scripts/build-portable-save.mjs','scripts/native-tools.mjs','scripts/reference-utils.mjs',
    'adapters/godot/local-save/sqlite-lock.json',...listFiles(source).map(f=>'native/save/'+f)];
  const receipt={...manifest,passed:true,kind:'build-only; consumer and engine qualification recorded separately',
    platform:process.platform,arch:process.arch,configuration:'Release',cmake,ninja,python,compiler,sqlite:pin,
    library,importLibrary:process.platform==='win32'?'hwe_save.lib':null,librarySha256:hash(path.join(stage,library)),
    sources:Object.fromEntries(sources.map(f=>[f,hash(path.join(root,f))])),
    files:Object.fromEntries(listFiles(stage).map(f=>[f,{sha256:hash(path.join(stage,f)),bytes:fs.statSync(path.join(stage,f)).size}])),
    buildLogSha256:sha256(logs.join('\n'))};
  writeJSON(path.join(stage,'build-receipt.json'),receipt);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.mkdirSync(out);
  for(const file of listFiles(stage))fs.copyFileSync(path.join(stage,file),path.join(out,file));
  console.log({passed:true,directory:out,librarySha256:receipt.librarySha256,bytes:receipt.files[library].bytes});
} finally {
  for(const [key,value]of Object.entries(prior))if(value===undefined)delete process.env[key];else process.env[key]=value;
  assert.equal(path.dirname(dir),path.join(root,'.artifacts'));
  fs.rmSync(dir,{recursive:true,force:true});
}
