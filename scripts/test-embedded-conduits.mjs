// Replay the shipped JS and JSON on the accepted embedded C ABI, independently
// of browser rendering or Node at runtime. Uses only local, checksum-pinned donors.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {verifySteamImage} from './steamrt-image.mjs';

const [releaseArg,workshopArg,pythonArg,...flags]=process.argv.slice(2);
assert(releaseArg && workshopArg && pythonArg && flags.every(f=>f==='--steam'),
  'RELEASE-DIRECTORY WORKSHOP-DONORS PYTHON [--steam]');
const release=fs.realpathSync(releaseArg), donors=fs.realpathSync(workshopArg), python=fs.realpathSync(pythonArg);
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const proof=read(path.join(release,'verification.json'));
const archive=path.join(release,'hollow-wake-engine-'+proof.version+'.tgz');
assert.equal(hash(archive),proof.archiveSha256);
const page=path.join(release,proof.devicePage.file);
assert.equal(hash(page),proof.devicePage.sha256);
const data=JSON.parse(fs.readFileSync(page,'utf8').match(/<script type="application\/json" id="course">(.*?)<\/script>/)[1]);
assert.equal(data.originalSha256,proof.original.sha256);
const parent=fs.realpathSync(path.join(root,'.artifacts'));
const dir=fs.mkdtempSync(path.join(parent,'conduit-native-'));
const payload=path.join(dir,'payload');fs.mkdirSync(payload);
const env={...process.env,TEMP:dir,TMP:dir,TMPDIR:dir,npm_config_cache:path.join(dir,'cache')};
const run=(exe,args,cwd=dir)=>execFileSync(exe,args,{cwd,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8<<20});
const report={version:proof.version,archiveSha256:proof.archiveSha256,platforms:{}};
function library(name,zipHash,entry,dest){
  const zip=path.join(donors,name);
  assert.equal(hash(zip),zipHash);
  run(python,['-I','-B','-c',
    'import sys,zipfile,pathlib; z=zipfile.ZipFile(sys.argv[1]); pathlib.Path(sys.argv[3]).write_bytes(z.read(sys.argv[2]))',
    zip,entry,path.join(payload,dest)]);
}
try{
  writeJSON(path.join(dir,'package.json'),{private:true});
  run(process.execPath,[npmCli(),'install','--offline','--no-fund','--no-audit','--no-package-lock','--ignore-scripts',archive]);
  const entry=specifier=>fileURLToPath(run(process.execPath,['--input-type=module','-e',
    'console.log(import.meta.resolve('+JSON.stringify(specifier)+'))']).trim());
  const prefix='@hollow-wake/engine/';
  const spec=prefix+'resources/conduits';
  const workload=path.join(root,'tools/device-conduits/workload.mjs');
  const pack=read(entry(prefix+'content/conduits.json'));
  assert.equal(hash(entry(prefix+'content/conduits.json')),proof.catalogue.sha256);
  const src=`import {ConduitCatalogue} from '${spec}/catalogue';
import {createDeviceCourse} from 'conduit-workload';
export const create=c=>({catalogue:new ConduitCatalogue(c.pack),courses:c.courses,work:null});
export function dispatch(session,command){
  if(command.op==='resolve')return session.catalogue.forSkill(command.skill,command.admitted,command.invested);
  if(command.op==='begin'){session.work=createDeviceCourse(session.courses,command.actors);return session.work.count();}
  if(command.op==='step'){session.work.block();return session.work.count();}
  return {error:'unknown-command'};
}`;
  const resolve=new Map([[spec,entry(spec)],[spec+'/catalogue',entry(spec+'/catalogue')],['conduit-workload',workload]]);
  await build({stdin:{contents:src,resolveDir:dir},bundle:true,platform:'neutral',format:'iife',globalName:'HollowWakeSession',
    target:'es2022',minify:true,outfile:path.join(payload,'bundle.js'),plugins:[{name:'installed',setup(b){
      b.onResolve({filter:/^(conduit-workload$|@hollow-wake\/engine\/resources\/conduits)/},a=>({path:resolve.get(a.path)}));
    }}]});
  const ref=path.join(root,'.reference');
  const oracle=path.join(dir,'source.cjs');
  await build({stdin:{contents:fs.readFileSync(path.join(root,'reference/export-conduit-catalogue.ts'),'utf8'),loader:'ts',
    resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',outfile:oracle,logLevel:'silent'});
  const vectors=path.join(dir,'vectors.json');
  run(process.execPath,[oracle,path.join(dir,'original.json'),vectors]);
  assert.equal(hash(vectors),proof.catalogue.originalLoadoutSha256);
  const rows=read(vectors).map(({skill,admitted,invested,expected})=>({request:{op:'resolve',skill,admitted,invested},expected}));
  for(const actors of [24,120,480]){
    rows.push({request:{op:'begin',actors},expected:0});
    for(let i=1;i<=40;i++)rows.push({request:{op:'step'},expected:16*actors*i});
  }
  writeJSON(path.join(payload,'course.json'),{rows});
  writeJSON(path.join(payload,'content.json'),{pack,courses:data.courses});
  fs.copyFileSync(path.join(root,'scripts/content-table-native.py'),path.join(payload,'replay.py'));
  const variant={name:'conduits',bundle:'bundle.js',content:'content.json',heaps:[4]};
  function accept(result){
    const [row]=result.rows;
    assert(row.passed && row.commands===rows.length && row.destroyStatus===0 && row.remainingBytes===0,JSON.stringify(row.error??row));
    assert(row.tracked.peak_bytes<=variant.heaps[0]*1024*1024);
    return {commands:row.commands,actorSteps:640*(24+120+480),heapLimitMiB:row.heapMiB,
      peakTrackedBytes:row.tracked.peak_bytes,remainingBytesAtDestroy:row.remainingBytes};
  }
  if(process.platform==='win32'){
    const pin=read(path.join(root,'evidence/pouch-recall/dotnet-windows.json'));
    library(pin.archive,pin.sha256,'HollowWake.Pouches/hwe_embedded.dll','hwe_embedded.dll');
    const dll=path.join(payload,'hwe_embedded.dll');assert.equal(hash(dll),pin.files['hwe_embedded.dll']);
    writeJSON(path.join(payload,'windows.json'),{directory:payload,dll,variants:[variant]});
    run(python,['-I','-B',path.join(payload,'replay.py'),path.join(payload,'windows.json')],payload);
    report.platforms.windows={dllSha256:hash(dll),...accept(read(path.join(payload,'native-result.json')))};
  }
  if(flags.includes('--steam')){
    const pin=read(path.join(root,'experiments/steamrt-godot/toolchain-lock.json')).images.platform;
    const image=pin.repository+'@'+pin.manifestDigest;
    const actual=JSON.parse(run('docker',['image','inspect',image]))[0];
    verifySteamImage(pin,actual);
    const donorName='hollow-wake-workshop-linux-x64.zip';
    library(donorName,read(path.join(root,'evidence/pouch-recall/linux.json')).checksums[donorName],
      'inventory-workshop/addons/hollow_wake/bin/libhwe_embedded.so','libhwe_embedded.so');
    writeJSON(path.join(payload,'linux.json'),{directory:'.',dll:'/input/libhwe_embedded.so',variants:[variant]});
    const output=run('docker',['run','--pull=never','--rm','--network=none','--read-only','--cap-drop=ALL',
      '--security-opt=no-new-privileges','--pids-limit=64','--user=65534:65534','--tmpfs','/tmp:rw,nosuid,nodev,size=16m,mode=1777',
      '--mount','type=bind,source='+payload+',target=/input,readonly','-w','/tmp',image,'sh','-ec',
      'cp /input/bundle.js /input/content.json /input/course.json .; python3 -I -B /input/replay.py /input/linux.json >/dev/null; cat native-result.json']);
    report.platforms.steamRuntime={manifest:pin.manifestDigest,buildId:pin.buildId,librarySha256:hash(path.join(payload,'libhwe_embedded.so')),
      ...accept(JSON.parse(output))};
  }
  assert(Object.keys(report.platforms).length,'Select a supported native runtime');
  report.bundleBytes=fs.statSync(path.join(payload,'bundle.js')).size;
  report.bundleSha256=hash(path.join(payload,'bundle.js'));
  const dest=path.join(release,flags.includes('--steam')?'embedded-steam.json':'embedded-windows.json');
  if(fs.existsSync(dest))assert.deepEqual(read(dest),report);
  else fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(report);
}finally{
  assert.equal(path.dirname(fs.realpathSync(dir)),parent);
  fs.rmSync(dir,{recursive:true});
}
