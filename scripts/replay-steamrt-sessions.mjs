import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {listFiles, root, sha256, writeJSON} from './reference-utils.mjs';
import {verifySteamContainer, verifySteamImage} from './steamrt-image.mjs';

// The build and player may be on different hosts. Authenticate the copied
// exports before running them and compare against the original SDK course.
const [bundleFlag, bundlePath, outFlag, destination, ...extra] = process.argv.slice(2);
assert.deepEqual([bundleFlag,outFlag,extra.length], ['--bundle','--out',0]);
const bundle = fs.realpathSync(bundlePath);
const out = path.resolve(destination);
const read = file => JSON.parse(fs.readFileSync(file));
const hash = file => sha256(fs.readFileSync(file));
const sdk = read(path.join(bundle,'sdk.json'));
const desktopFile = path.join(bundle,'desktop','linux.json');
const desktop = read(desktopFile);
const lockFile = path.join(root,'experiments/steamrt-godot/toolchain-lock.json');
const pin = read(lockFile).images.platform;
assert(sdk.passed && desktop.passed && desktop.platform==='linux' && desktop.arch==='x64');
assert.equal(sdk.buildId,pin.buildId);
assert.equal(sdk.toolchainLockSha256,hash(lockFile));
assert.equal(sdk.desktopProofSha256,hash(desktopFile));
assert.equal(sdk.archive,'hollow-wake-godot-crafting-progression-linux-x64.zip');
assert.equal(hash(path.join(bundle,sdk.archive)),sdk.archiveSha256);
assert.equal(desktop.package.archiveSha256,sdk.archiveSha256);
assert.equal(desktop.capBytesPerHost,32*1024*1024);
const windows = read(path.join(root,'evidence/godot-crafting/windows.json'));
assert(windows.passed && windows.platform==='win32' && windows.arch==='x64');
const original = read(path.join(root,'evidence/content-tables/windows.json'));
const raw = fs.readFileSync(path.join(root,original.raw.file));
assert.equal(sha256(raw),original.raw.sha256);
const {course} = JSON.parse(gunzipSync(raw));
assert.equal(sha256(JSON.stringify(course,null,2)+'\n'),desktop.fixture.sha256);
assert.deepEqual(course.coverage,desktop.fixture.coverage);
assert.equal(course.rows.length,56);

fs.mkdirSync(out);
const image = pin.repository+'@'+pin.manifestDigest;
const uid = process.getuid?.() ?? 1000;
const gid = process.getgid?.() ?? 1000;
assert(uid>0,'Run as a regular user');
const user = uid+':'+gid;
const report = {schemaVersion:1,passed:false,archive:sdk.archive,archiveSha256:sdk.archiveSha256,
  buildId:pin.buildId,image:pin.configDigest,manifest:pin.manifestDigest,sdkProofSha256:hash(path.join(bundle,'sdk.json')),
  courseSha256:desktop.fixture.sha256,peaksMeasure:'tracked native allocations per host',replays:{}};

function docker(args) {
  return execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024}).trim();
}
function gameState(stats) {
  return Object.fromEntries(Object.entries(stats).filter(([key])=>!key.endsWith('metrics')));
}
function inventory(dir) {
  return Object.fromEntries(listFiles(dir).map(file=>[file,hash(path.join(dir,file))]));
}
function inspectRun(config, sealed, output) {
  verifySteamContainer(report.imageIdentity,config);
  assert.equal(config.Config.User,user);
  assert.equal(config.HostConfig.NetworkMode,'none');
  assert.equal(config.HostConfig.ReadonlyRootfs,true);
  assert.deepEqual(config.HostConfig.CapDrop,['ALL']);
  assert(config.HostConfig.SecurityOpt.includes('no-new-privileges'));
  assert.deepEqual(Object.keys(config.HostConfig.Tmpfs),['/tmp']);
  const mounts = config.Mounts.filter(mount=>mount.Type==='bind')
    .map(mount=>[fs.realpathSync(mount.Source),mount.Destination,mount.RW])
    .sort((a,b)=>a[1].localeCompare(b[1]));
  assert.deepEqual(mounts,[[output,'/evidence',true],[sealed,'/package',false]]);
  for(const mount of config.Mounts.filter(m=>m.Type!=='bind')){
    assert(mount.Type==='tmpfs' && mount.Destination==='/tmp');
  }
}

function replay(name) {
  const sealed = fs.realpathSync(path.join(bundle,name));
  assert.equal(path.dirname(sealed),bundle);
  const expected = sdk.exports[name];
  assert.deepEqual(inventory(sealed),expected.files);
  const libraries=['libhwe_embedded.so','libhwe_godot.so'];
  for(const lib of libraries)assert.equal(expected.files[lib],desktop.package.libraries['bin/'+lib]);
  assert.deepEqual(Object.keys(expected.files).sort(),[name+'.pck',name+'.x86_64',...libraries].sort());
  const output = path.join(out,name);
  fs.mkdirSync(output);
  const entrypoint='/package/'+name+'.x86_64';
  const args=['create','--platform','linux/amd64','--user',user,'--network','none','--read-only','--init=false',
    '--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,size=268435456',
    '--volume',sealed+':/package:ro','--volume',output+':/evidence','--workdir','/package',
    '--env','HOME=/tmp','--env','XDG_DATA_HOME=/tmp/data','--env','XDG_CONFIG_HOME=/tmp/config','--env','XDG_CACHE_HOME=/tmp/cache',
    '--env','LD_DEBUG=libs','--env','LD_DEBUG_OUTPUT=/evidence/loader'];
  if(name==='crafting')args.push('--env','HWE_GODOT_OBSERVATIONS=/evidence/replies.jsonl');
  const id=docker([...args,'--entrypoint',entrypoint,image,'--headless','--quit-after','16','--log-file','/evidence/engine.log']);
  assert(/^[0-9a-f]{64}$/.test(id));
  try{
    const [config]=JSON.parse(docker(['inspect',id]));
    writeJSON(path.join(output,'container.json'),config);
    inspectRun(config,sealed,output);
    assert.deepEqual(config.Config.Entrypoint,[entrypoint]);
    // Capture both streams, including engine diagnostics on stderr.
    const log=path.join(output,'execution.txt');
    const fd=fs.openSync(log,'wx');
    try{execFileSync('docker',['start','--attach',id],{windowsHide:true,timeout:240000,stdio:['ignore',fd,fd]});}
    finally{fs.closeSync(fd);}
    const [state]=JSON.parse(docker(['inspect',id]));
    assert.equal(state.State.Status,'exited');assert.equal(state.State.ExitCode,0);
    const text=fs.readFileSync(log,'utf8');
    assert(!/ERROR:|SCRIPT ERROR|WARNING:.*(?:leak|ObjectDB)/i.test(text),text.slice(-1200));
    const stats=text.split(/\r?\n/).filter(line=>line.startsWith('{')).map(JSON.parse).at(-1);
    assert(stats?.passed);
    assert.deepEqual(gameState(stats),gameState(expected.sdkRelease));
    assert.deepEqual(gameState(stats),gameState(windows[name].release),'Gameplay differs from the accepted Windows course');
    const metrics = Object.entries(stats).filter(([key])=>key.endsWith('metrics'));
    assert.equal(metrics.length,name==='crafting'?3:2);
    for(const [,m] of metrics){
      assert(m.closed && !m.poisoned && !m.delivery_failed && !m.response_pending && m.status===0);
      assert.equal(m.live_bytes,0);assert.equal(m.live_blocks,0);
      assert(m.peak_bytes>0 && m.peak_bytes<=desktop.capBytesPerHost);
    }
    const trace=fs.readFileSync(path.join(output,'loader.1'),'utf8');
    const loaded=[...trace.matchAll(/calling init:\s+([^\r\n]+)/g)].map(match=>match[1].trim())
      .filter(file=>libraries.includes(path.posix.basename(file))).sort();
    assert.deepEqual(loaded,libraries.map(lib=>'/package/'+lib));
    assert.deepEqual(inventory(sealed),expected.files);
    const result={stats,loadedLibraries:loaded,exportedFiles:expected.files,networkDisabled:true,readOnlyPackage:true,
      onlyPackageAndEvidenceMounted:true,containerSha256:hash(path.join(output,'container.json')),loaderSha256:sha256(trace),logSha256:hash(log)};
    if(name==='crafting'){
      const bytes=fs.readFileSync(path.join(output,'replies.jsonl'));
      const replies=bytes.toString('utf8').trimEnd().split('\n').map(line=>JSON.parse(line));
      assert.deepEqual(replies,course.rows.map(row=>row.expected));
      assert.equal(sha256(bytes),desktop.observations.uncompressedSha256);
      result.observations={commands:replies.length,bytes:bytes.length,sha256:sha256(bytes),
        sameReplyBytesAsWindows:sha256(bytes)===windows.observations.uncompressedSha256};
    }
    return result;
  }finally{
    // This identifier comes exclusively from the successful create above.
    docker(['rm','--force',id]);
  }
}

try{
  const [actual]=JSON.parse(docker(['image','inspect',image]));
  report.imageIdentity=verifySteamImage(pin,actual);
  for(const name of ['crafting','progression']){
    report.replays[name]=replay(name);
    console.log(name+' passed in the Steam Runtime Platform');
  }
  assert.equal(hash(path.join(bundle,sdk.archive)),sdk.archiveSha256);
  report.passed=true;
}catch(error){
  report.failure={name:error.name,message:error.message.slice(0,2048)};
  throw error;
}finally{
  writeJSON(path.join(out,'verification.json'),report);
}
