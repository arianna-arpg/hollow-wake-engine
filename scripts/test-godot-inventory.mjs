import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON,listFiles} from './reference-utils.mjs';

const [buildFlag,buildFile,toolsFlag,toolsFile,renderFlag,...rest]=process.argv.slice(2);
assert.deepEqual([buildFlag,toolsFlag,rest.length],['--build','--tools',0]);
assert(!renderFlag||renderFlag==='--render');
const read=f=>JSON.parse(fs.readFileSync(f)), hash=f=>sha256(fs.readFileSync(f));
const build=read(buildFile),tools=read(toolsFile),windows=process.platform==='win32';
assert(build.built);
const pin=read(path.join(root,'experiments/godot-native/toolchain-lock.json')).platforms[process.platform];
assert.equal(hash(tools.editor),pin.editor.executableSha256);assert.equal(hash(tools.exportRelease),pin.templates.files[pin.templates.release]);
const dir=fs.mkdtempSync(path.join(root,'.artifacts/inventory-acceptance-')),project=path.join(dir,'inventory-workshop');
const receipt=path.join(dir,'verification.json'), report={passed:false,dir,buildSha256:hash(buildFile),runs:[],crashes:[]};
writeJSON(path.join(root,'.artifacts/inventory-acceptance-latest.json'),{dir,receipt});
const archive=Object.keys(build.archives).find(f=>f.includes('-project-'));
const packaged=path.join(build.dir,archive);assert.equal(hash(packaged),build.archives[archive]);
const env={...process.env};
for(const key of windows?['APPDATA','LOCALAPPDATA']:['XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME']){
  env[key]=path.join(dir,key);fs.mkdirSync(env[key]);
}
const frozen=read(path.join(root,'evidence/content-tables/windows.json'));
const compressed=fs.readFileSync(path.join(root,frozen.raw.file));assert.equal(sha256(compressed),frozen.raw.sha256);
const {course}=JSON.parse(gunzipSync(compressed));assert.equal(sha256(JSON.stringify(course,null,2)+'\n'),frozen.native.courseSha256);
const original=course.rows.map(row=>row.expected.save).find(s=>s?.state.overflow.length===1&&s.state.items.length===2);
const cargo=original.state.overflow[0];assert.equal(cargo.uid,13);
const moved=structuredClone(original);moved.state.overflow=[];
function database(file) {
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    const row=db.prepare('SELECT revision,crafting,stash FROM slots WHERE slot=1').get();
    return {revision:row.revision,source:JSON.parse(row.crafting),stash:JSON.parse(row.stash)};
  }finally{db.close();}
}
const before={revision:1,source:original,stash:[]},after={revision:2,source:moved,stash:[cargo]};
let exe;
async function launch(label,command,args,settings={},barrier=null) {
  const log=path.join(dir,label+'.txt'),fd=fs.openSync(log,'wx');
  let child;
  try{child=spawn(command,args,{env:{...env,...settings},windowsHide:true,cwd:dir,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
  let terminal=false;
  const ended=new Promise((resolve,reject)=>{
    child.once('error',err=>{terminal=true;reject(err);});
    child.once('close',(code,signal)=>{terminal=true;resolve({code,signal});});
  });
  let expired=false;
  const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL');},120000);
  try{
    if(barrier){
      while(!terminal&&!fs.existsSync(settings.HWE_MARKER))await Promise.race([ended,delay(20)]);
      assert(!terminal,label+' exited before boundary: '+fs.readFileSync(log,'utf8').slice(-800));
      // The game closes the marker before waiting. A zero-length entry can
      // be visible momentarily on a second filesystem handle.
      while(!terminal&&fs.readFileSync(settings.HWE_MARKER,'utf8')==='')await delay(5);
      assert.equal(fs.readFileSync(settings.HWE_MARKER,'utf8'),barrier);
      let journalBytes=0;
      if(barrier==='after-stage'){journalBytes=fs.statSync(settings.HWE_DB+'-journal').size;assert(journalBytes>0);}
      assert(child.kill('SIGKILL'));
      const killed=await ended;
      assert(!expired && (killed.signal==='SIGKILL'||killed.code!==0));
      report.crashes.push({phase:barrier,journalBytes,terminated:true});
    }else{
      const {code,signal}=await ended;
      const text=fs.readFileSync(log,'utf8');
      assert(!expired&&!signal&&code===0,label+': '+text.slice(-1200));
      const diagnostics=text.split(/\r?\n/).filter(s=>/ERROR:|SCRIPT ERROR|Parse Error:|WARNING:.*(?:leak|ObjectDB)/i.test(s)&&!(windows&&s==='ERROR: Failed to read the root certificate store.'));
      assert.deepEqual(diagnostics,[],label);
      if(settings.HWE_CASE)assert(text.includes('HWE_PASS '+settings.HWE_CASE),label+': missing completion marker');
    }
    report.runs.push({label,logSha256:hash(log)});
  }finally{
    clearTimeout(timer);
    if(!terminal){child.kill('SIGKILL');await ended;}
    writeJSON(receipt,report);
  }
}
function play(label,mode,db,extra={},barrier=null) {
  return launch(label,exe,['--headless','--quit-after','120','--log-file',path.join(dir,label+'-engine.log')],
    {HWE_CASE:mode,HWE_DB:db,HWE_RESUME:'',HWE_PHASE:barrier??'',...extra},barrier);
}
async function inspect(label,db,expected) {
  const observed=path.join(dir,label+'.json');
  await play(label,'inspect',db,{HWE_RESULT:observed});
  assert.deepEqual(read(observed),expected,label+' restored game view');
  assert.deepEqual(database(db),expected,label+' independent database view');
}
try{
  const unpack='import pathlib,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n for f in z.infolist():\n  p=pathlib.PurePosixPath(f.filename)\n  assert p.parts[0]=="inventory-workshop" and ".." not in p.parts and "\\\\" not in f.filename and ":" not in f.filename\n z.extractall(sys.argv[2])';
  execFileSync(tools.python,['-I','-c',unpack,packaged,dir],{windowsHide:true});
  assert.deepEqual(Object.fromEntries(listFiles(project).map(f=>[f,hash(path.join(project,f))])),build.pristine);
  const fixture=path.join(project,'fixture.json');fs.writeFileSync(fixture,JSON.stringify(original));
  fs.copyFileSync(path.join(root,'test/godot-inventory/driver.gd'),path.join(project,'driver.gd'));
  fs.writeFileSync(path.join(project,'driver.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://driver.gd" id="1"]\n[node name="Driver" type="Node"]\nscript = ExtResource("1")\n');
  const projectFile=path.join(project,'project.godot');
  const config=fs.readFileSync(projectFile,'utf8');assert(config.includes('run/main_scene="res://inventory.tscn"'));
  fs.writeFileSync(projectFile,config.replace('run/main_scene="res://inventory.tscn"','run/main_scene="res://driver.tscn"'));
  fs.appendFileSync(path.join(project,'export_presets.cfg'),'custom_template/debug='+JSON.stringify(tools.exportDebug.replaceAll('\\','/'))+'\ncustom_template/release='+JSON.stringify(tools.exportRelease.replaceAll('\\','/'))+'\n');
  await launch('import',tools.editor,['--headless','--import','--frame-delay','1000','--path',project]);
  const exported=path.join(dir,'release');fs.mkdirSync(exported);
  exe=path.join(exported,'inventory-proof'+(windows?'.exe':'.x86_64'));
  await launch('export',tools.editor,['--headless','--path',project,'--export-release',windows?'Windows Desktop':'Linux',exe]);
  assert.equal(hash(path.join(exported,windows?'hwe_slot_store.dll':'libhwe_slot_store.so')),build.librarySha256);
  const off=path.join(dir,'project-unavailable');assert.equal(path.dirname(fs.realpathSync(project)),fs.realpathSync(dir));
  fs.renameSync(project,off);
  for(const phase of ['before-stage','after-stage','after-commit']){
    const db=path.join(dir,phase+'.db');
    await play(phase+'-seed','seed',db);assert.deepEqual(database(db),before);
    await play(phase+'-kill','transfer',db,{HWE_MARKER:path.join(dir,phase+'.marker')},phase);
    // The real application opens first after the writer dies, before any independent SQL reader.
    await inspect(phase+'-recover',db,phase==='after-commit'?after:before);
  }
  const db=path.join(dir,'writers.db');
  await play('writers-seed','seed',db);
  await play('locks','locks',db);assert.deepEqual(database(db),before);
  const reader=new DatabaseSync(db,{readOnly:true});
  try {
    reader.exec('BEGIN');assert.equal(reader.prepare('SELECT revision FROM slots WHERE slot=1').get().revision,1);
    await play('busy-commit','commit-busy',db);
  }finally{reader.close();}
  assert.deepEqual(database(db),before);
  const raceDb=path.join(dir,'race.db'),marker=path.join(dir,'race-ready'),resume=path.join(dir,'race-resume');
  await play('race-seed','seed',raceDb);
  const losing=play('race-loser','race',raceDb,{HWE_MARKER:marker,HWE_RESUME:resume});
  try{
    const deadline=Date.now()+30000;
    while(!fs.existsSync(marker)){
      assert(Date.now()<deadline,'first process did not reach pre-write barrier');
      await Promise.race([losing.then(()=>{throw new Error('first process exited early');}),delay(25)]);
    }
    await play('race-winner','transfer',raceDb);
  }finally{fs.writeFileSync(resume,'go',{flag:'wx'});await losing;}
  await inspect('race-read',raceDb,after);
  await play('stale','stale',db);await inspect('stale-read',db,after);
  await play('withdraw','withdraw',db);
  const returned=database(db);assert.equal(returned.revision,4);assert.deepEqual(returned.stash,[]);
  const item=returned.source.state.items.find(i=>i.uid===13);assert(item);const {x,y,...body}=item;
  assert.deepEqual(body,cargo);assert.deepEqual([x,y],[2,0]);assert.deepEqual(returned.source.random,original.random);
  assert.equal(returned.source.nextUid,original.nextUid);
  await inspect('withdraw-read',db,returned);
  const corrupt=path.join(dir,'corrupt.db');fs.copyFileSync(db,corrupt);
  const altered=new DatabaseSync(corrupt);
  altered.prepare('UPDATE slots SET stash=? WHERE slot=1').run(JSON.stringify([cargo]));altered.close();
  const corruptState=database(corrupt);
  await play('reject-duplicate','invalid-custody',corrupt);assert.deepEqual(database(corrupt),corruptState);
  const full=path.join(dir,'full.db');
  await play('full-seed','seed',full);
  const withRoomForIds=structuredClone(original);withRoomForIds.nextUid=200;
  const cargoes=Array.from({length:64},(_,i)=>({...structuredClone(cargo),uid:100+i}));
  const fill=new DatabaseSync(full);
  try{fill.prepare('UPDATE slots SET crafting=?,stash=? WHERE slot=1').run(JSON.stringify(withRoomForIds),JSON.stringify(cargoes));}
  finally{fill.close();}
  const fullState=database(full);
  await play('reject-full-stash','full-stash',full);assert.deepEqual(database(full),fullState);
  const foreign=path.join(dir,'foreign.db'),alien=new DatabaseSync(foreign);
  alien.exec("CREATE TABLE unrelated(value TEXT); INSERT INTO unrelated VALUES('keep')");alien.close();
  const prior=hash(foreign);await play('reject-foreign','incompatible-database',foreign);assert.equal(hash(foreign),prior);
  // A separate product launch uses its real main scene and provisions a new private save.
  await launch('shipping-player',build.executable,['--headless','--quit-after','12']);
  const userData=windows?env.APPDATA:env.XDG_DATA_HOME;
  const realSave=path.join(userData,'hollow-wake-inventory-workshop','inventory.sqlite3');
  const fresh=database(realSave);assert.equal(fresh.revision,1);assert.equal(fresh.source.state.items.length,4);assert.equal(fresh.source.state.overflow.length,1);
  const png=path.join(dir,'inventory.png');
  await launch('screen',exe,[...(renderFlag?['--audio-driver','Dummy']:['--headless']),'--quit-after','240','--log-file',path.join(dir,'screen-engine.log')],
    {HWE_CASE:'ui',HWE_SCREENSHOT:renderFlag?png:''});
  const last=database(realSave);assert.equal(last.revision,5);assert.equal(last.source.state.items.length,4);
  assert.equal(last.source.state.overflow.length,1);assert.equal(last.stash.length,0);
  if(renderFlag){const image=fs.readFileSync(png);assert.equal(image.subarray(1,4).toString(),'PNG');report.screenshot={sha256:sha256(image),width:image.readUInt32BE(16),height:image.readUInt32BE(20)};}
  report.passed=true;
  report.originalCourseSha256=frozen.native.courseSha256;report.originalCheckpointSha256=sha256(JSON.stringify(original));
  report.recoveredItemUid=cargo.uid;report.revisionAfterUI=last.revision;report.archives=build.archives;
  console.log({passed:true,dir,crashes:report.crashes,screenshot:report.screenshot});
}catch(error){report.failure={message:error.message.slice(0,1800)};throw error;}finally{writeJSON(receipt,report);}
