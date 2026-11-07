import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {workshopBundles,workspaceBridges} from './godot-crafting-bundle.mjs';
import {writeSupportGate} from './compile-workshop-supports.mjs';
import {writePouchRecall} from './build-pouch-recall.mjs';
import {packSupportFit} from './package-workshop-supports.mjs';
import {exportSupportPlayer} from './export-workshop-support-player.mjs';
import {compareWorkshopProjects,prepareWorkshopBenchmark} from './benchmark-workshop-projects.mjs';

// Build from the installed candidate's actual published JS in memory. The
// previous native project supplies immutable libraries, templates and data.
const args=process.argv.slice(2);
const player=args.at(-2)==='--player'?path.resolve(args.splice(-2)[1]):undefined;
const devicePlayer=args.at(-2)==='--device-player'?path.resolve(args.splice(-2)[1]):undefined;
const compare=args.at(-2)==='--compare'?path.resolve(args.splice(-2)[1]):undefined;
const [toolsFile,donorFile,output,steamEditor]=args;
assert(args.length===3||args.length===4);
assert(!player||!devicePlayer,'Choose one exported player workload');
assert(!devicePlayer||(steamEditor&&compare),'The device player needs a verified Linux comparison');
assert(toolsFile&&donorFile&&output,'Usage: node scripts/verify-workshop-rack.mjs TOOLS.json PREVIOUS_PROJECT.zip OUTPUT [STEAM_LINUX_EDITOR] [--compare RACK_PROJECT.zip] [--device-player LINUX_GAME.zip]');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const config=read(toolsFile),win=!steamEditor&&process.platform==='win32',platform=win?'windows':'linux';
const pin=read(path.join(root,'experiments/godot-native/toolchain-lock.json')).platforms[win?'win32':'linux'];
assert.equal(hash(steamEditor??config.editor),pin.editor.executableSha256);
const steam=read(path.join(root,'experiments/steamrt-godot/toolchain-lock.json')).images.platform;
const image=steam.repository+'@'+steam.manifestDigest;
const expected=win?'3db1d983d285c6e678b85dd1b69ee8ec7eb6ea43e3aa9f548bd2bd3cc7046a81':'3e0bd9e71c3aa7f0f1c7203620b59bcb3b488c4f2de043e483a994ef38b6010f';
assert.equal(hash(donorFile),expected,'Requires the verified v0.53 project for this platform');
const parent=fs.realpathSync(path.join(root,'.artifacts')),scratch=fs.mkdtempSync(path.join(parent,'owned-rack-'));
const dest=path.resolve(output),pkg=read(path.join(root,'package.json'));
const run=(exe,args,env,cwd=scratch)=>execFileSync(exe,args,{cwd,env,windowsHide:true,timeout:180000,maxBuffer:16*1024*1024,encoding:'utf8',stdio:['ignore','pipe','pipe']});
try{
  const env={...process.env};
  for(const key of ['TEMP','TMP','npm_config_cache',...(win?['APPDATA','LOCALAPPDATA']:['XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME'])]){
    env[key]=path.join(scratch,key);fs.mkdirSync(env[key],{recursive:true});
  }
  const [packed]=JSON.parse(run(process.execPath,[npmCli(),'pack','--ignore-scripts','--json','--offline','--pack-destination',scratch],env,root));
  const sdk=path.join(scratch,packed.filename);
  const embedded=JSON.parse(run(config.python,['-I','-c',[
    'import sys,json,tarfile',
    'with tarfile.open(sys.argv[1]) as t:',
    ' print(json.dumps({m.name[8:]:t.extractfile(m).read().decode() for m in t if m.name=="package/package.json" or (m.name.startswith("package/dist/") and m.name.endswith(".js"))}))'
  ].join('\n'),sdk],env));
  const exports=JSON.parse(embedded['package.json']).exports;
  const plugins=[...workspaceBridges(root),{name:'packed-workshop',setup(builder){
    builder.onResolve({filter:/^@hollow-wake\/engine\//},arg=>({namespace:'sdk',path:exports[arg.path.replace('@hollow-wake/engine','.')].import.slice(2)}));
    builder.onResolve({filter:/^\./,namespace:'sdk'},arg=>({namespace:'sdk',path:path.posix.join(path.posix.dirname(arg.importer),arg.path)}));
    builder.onLoad({filter:/.*/,namespace:'sdk'},arg=>({contents:embedded[arg.path],loader:'js'}));
  }}];
  const {base,rack,support,vestiges}=await workshopBundles(path.join(root,'adapters/godot/crafting'),plugins);
  const gate=await writeSupportGate(scratch);
  const pouch=await writePouchRecall(scratch,path.join(root,'adapters/godot/crafting/pouch-entry.mjs'),plugins);
  const supportPackage=packSupportFit(scratch,gate,pkg.version,run,env);
  const bundle=path.join(scratch,'bundle.txt');fs.writeFileSync(bundle,vestiges.bytes);
  const projectZip=path.join(scratch,'hollow-wake-workshop-'+platform+'-x64.zip');
  const addonZip=path.join(scratch,'hollow-wake-addon-'+platform+'-x64.zip');
  run(config.python,['-I',path.join(root,'scripts/workshop-rack-project.py'),path.resolve(donorFile),expected,hash(sdk),bundle,projectZip,addonZip],env);
  // All members were checked before writing this archive.
  run(config.python,['-I','-m','zipfile','-e',projectZip,scratch],env);
  const project=path.join(scratch,'inventory-workshop');
  const saves=path.join(scratch,'game-data');fs.mkdirSync(saves);
  const proof=read(path.join(root,'evidence/content-tables/windows.json')),raw=fs.readFileSync(path.join(root,proof.raw.file));
  assert.equal(sha256(raw),proof.raw.sha256);
  const {course}=JSON.parse(gunzipSync(raw));
  assert.equal(sha256(JSON.stringify(course,null,2)+'\n'),proof.native.courseSha256);
  const gearDir=path.join(root,'baseline/loadout-cards');
  const gearBytes=gunzipSync(fs.readFileSync(path.join(gearDir,'observations.json.gz')));
  assert.equal(sha256(gearBytes),read(path.join(gearDir,'acceptance.json')).sha256);
  const gear=JSON.parse(gearBytes).filter(row=>row.expected);
  fs.writeFileSync(path.join(project,'gear-cases.json'),JSON.stringify(gear.map(row=>row.input)));
  fs.writeFileSync(path.join(project,'legacy-course.txt'),course.rows.flatMap(row=>[JSON.stringify(row.request),JSON.stringify(row.expected)]).join('\n')+'\n');
  fs.copyFileSync(path.join(root,'test/godot-inventory/workshop-rack.gd'),path.join(project,'rack-test.gd'));
  fs.copyFileSync(path.join(root,'test/godot-inventory/workshop-supports.gd'),path.join(project,'socket-test.gd'));
  fs.writeFileSync(path.join(project,'socket-test.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://socket-test.gd" id="1"]\n[node name="Sockets" type="Node"]\nscript = ExtResource("1")\n');
  const socketCases=read(path.join(root,'evidence/workshop-supports/native-cases.json'));
  const oracle=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/pouch-recall/observations.json.gz'))));
  const nativeData=read(path.join(scratch,'pouch-data.json'));
  fs.writeFileSync(path.join(project,'pouch-control.txt'),JSON.stringify({...nativeData,content:JSON.parse(nativeData.content)}));
  for(const row of oracle.actions)if(row.mode==='threshold')row.beforeLedger={[oracle.defs.rules.dropPrefix+'firebolt']:oracle.defs.rules.threshold-1};
  fs.writeFileSync(path.join(project,'pouch-cases.json'),JSON.stringify(oracle.actions));
  fs.writeFileSync(path.join(project,'support-cases.json'),JSON.stringify(socketCases));
  function godot(args){
    const command=steamEditor?'docker':config.editor;
    const mount=(source,target,ro=false)=>'type=bind,source='+path.resolve(source)+',target='+target+(ro?',readonly':'');
    const cli=steamEditor?['run','--rm','--pull=never','--network=none','--read-only','--cap-drop=ALL',
      '--security-opt=no-new-privileges','--user','1000:1000','--tmpfs','/tmp:rw,nosuid,size=96m',
      '--mount',mount(steamEditor,'/godot',true),'--mount',mount(project,'/project'),'--mount',mount(saves,'/saves'),
      '-e','HOME=/tmp','-e','XDG_DATA_HOME=/saves','--entrypoint','/godot',image,'--headless','--path','/project',...args]
      :['--headless','--path',project,...args];
    // Docker Desktop reads the user's existing context outside the game.
    const child=spawnSync(command,cli,{cwd:scratch,env:steamEditor?process.env:env,windowsHide:true,encoding:'utf8',timeout:120000});
    if(child.error)throw child.error;
    const log=(child.stdout+'\n'+child.stderr).replace(/\r+/g,'');
    const errors=log.split(/\r?\n/).filter(s=>/ERROR:|Parse Error:|WARNING:.*(?:leak|ObjectDB)/i.test(s)&&!(win&&s==='ERROR: Failed to read the root certificate store.'));
    assert(child.status===0&&!errors.length,log.slice(-4000));
    return log;
  }
  godot(['--import']);
  const log=godot(['--script','res://rack-test.gd','--quit-after','300','--','--cargo-sample']);
  const line=log.split(/\r?\n/).find(row=>row.startsWith('HWE_RACK '));
  assert(line,'Missing Godot completion marker: '+log.slice(-2000));
  const result=JSON.parse(line.slice(9));
  if(steamEditor)assert.equal(result.db,'/saves/hollow-wake-inventory-workshop/inventory-cargo-sample.sqlite3');
  const database=steamEditor?path.join(saves,'hollow-wake-inventory-workshop/inventory-cargo-sample.sqlite3'):result.db;
  const replies=name=>fs.readFileSync(path.join(path.dirname(database),name),'utf8').trimEnd().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(replies('rack-replies.jsonl'),course.rows.map(row=>row.expected));
  const cards=replies('gear-replies.jsonl');assert.equal(cards.length,gear.length);
  for(const [index,card] of cards.entries()){
    const {label,expected}=gear[index];assert.deepEqual(card.targets,expected.targets,label);
    assert.equal('<span style="color:'+card.color+'">'+card.title+'</span>',expected.title,label);
    assert.equal('<span style="color:'+(card.levelMet?'#6fc06f':'#d05050')+'">'+card.requirement+'</span> · '+card.rarityLabel,expected.fullMeta,label);
  }
  const db=new DatabaseSync(database,{readOnly:true});
  try{
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    const row=db.prepare('SELECT revision,crafting,stash FROM slots WHERE slot=1').get();
    const save=JSON.parse(row.crafting);assert.equal(row.revision,result.revision);assert.equal(save.nextUid,result.nextUid);
    assert.equal(save.schemaVersion,2);assert.equal(save.state.rack.length,8);assert(save.state.rack.every(i=>i===null));
    assert.equal(save.state.items.at(-1).uid,result.minted);assert.deepEqual(JSON.parse(row.stash),[]);
    const sample=read(path.join(project,'cargo-sample.json')).find(item=>item.gem?.kind==='skill');
    assert.deepEqual(save.state.items.at(-1).gem,sample.gem);
  }finally{db.close();}
  const socketArgs=['res://socket-test.tscn','--quit-after','300','--','--cargo-sample'];
  const socketLog=godot(socketArgs);
  const socketLine=socketLog.split('\n').find(s=>s.startsWith('HWE_SUPPORT '));assert(socketLine,socketLog.slice(-2000));
  const socketResult=JSON.parse(socketLine.slice(12));assert.equal(socketResult.cases,socketCases.length);
  const socketDb=new DatabaseSync(path.join(path.dirname(database),'inventory-support-sample.sqlite3'),{readOnly:true});
  let socketSaveHash;
  try{
    assert.equal(socketDb.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    const row=socketDb.prepare('SELECT revision,crafting,stash FROM slots WHERE slot=1').get(),save=JSON.parse(row.crafting);
    assert.equal(row.revision,socketResult.revision);assert.equal(save.nextUid,socketResult.nextUid);assert.deepEqual(JSON.parse(row.stash),[]);
    assert(save.state.rack.every(v=>v===null));assert.equal(save.state.items.length,4);assert.deepEqual(save.state.overflow,[]);
    assert.deepEqual(save.state.items.find(i=>i.gem?.kind==='skill').gem,read(path.join(project,'cargo-sample.json'))[1].gem);
    const loose=save.state.items.filter(i=>i.gem?.kind==='support');assert.equal(loose.length,1);assert(loose[0].locked);
    assert.equal(loose[0].uid,socketResult.uid);assert.deepEqual(loose[0].gem,{kind:'support',supportId:'teeming_vein',level:2,rolled:{trigger:'chance',brood:'grubs',clutch:'brood4'}});
    socketSaveHash=sha256(row.crafting);
  }finally{socketDb.close();}
  const recallDb=new DatabaseSync(path.join(path.dirname(database),'recall-course.sqlite3'),{readOnly:true});
  let recallSaveHash;
  try{
    assert.equal(recallDb.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    const row=recallDb.prepare('SELECT revision,crafting,stash FROM slots WHERE slot=1').get();
    const [format,save,memory]=JSON.parse(row.crafting);
    assert.equal(format,'inventory-workshop/recall-v1');assert.equal(row.revision,4);
    assert.equal(memory.content,pouch.id);assert.equal(memory.seatLedger[oracle.defs.rules.lesson],1);
    assert.equal(save.state.account.ledger[oracle.defs.rules.total],2);
    assert(save.state.items.every(i=>i.baseId!=='preformed_memory'));assert.deepEqual(JSON.parse(row.stash),[]);
    const portable=new (await import('@hollow-wake/engine/inventory/pouch-recall')).PouchRecall(oracle.defs);
    const starter=portable.forActor({...oracle.profiles[0],level:10});
    const gems=[0,1].map(n=>starter.cut({s:n,d:'source_'+n},oracle.defs.facets[n].id).gem);
    assert.deepEqual(save.state.items.slice(-2).map(i=>i.gem),gems);assert.deepEqual(socketResult.pouch.first,gems[0]);
    assert.deepEqual(save.state.items.slice(-2).map(i=>[i.x,i.y]),[[1,0],[0,0]]);
    assert.equal(socketResult.pouch.cases,15);recallSaveHash=sha256(row.crafting);
  }finally{recallDb.close();}
  const pageFile=path.join(project,'addons/hollow_wake/crafting/support-pages.txt'),bytes=fs.readFileSync(pageFile);
  const range=gate.index.pages[gate.api.fitPage('teeming_vein',128)],damaged=Buffer.from(bytes);
  damaged[range.offset+range.length-1]=32;
  try{fs.writeFileSync(pageFile,damaged);assert(godot([...socketArgs,'--corrupt-page']).includes('HWE_SUPPORT_CORRUPT'));}
  finally{fs.writeFileSync(pageFile,bytes);}
  if(compare)prepareWorkshopBenchmark(project,course);
  const files=[sdk,supportPackage,projectZip,addonZip];
  const exported=player?exportSupportPlayer({player,project,saves,scratch,config,env,run,godot,platform,image,container:!!steamEditor,saveHash:socketSaveHash,recallHash:recallSaveHash}):undefined;
  if(exported)files.push(path.join(scratch,exported.archive));
  let portable;
  if(devicePlayer){
    const configFile=path.join(project,'project.godot'),projectSettings=fs.readFileSync(configFile,'utf8');
    assert(projectSettings.includes('config/custom_user_dir_name="hollow-wake-inventory-workshop"'));
    assert(projectSettings.includes('run/main_scene="res://workshop_start.tscn"'));
    fs.writeFileSync(configFile,projectSettings.replace('config/custom_user_dir_name="hollow-wake-inventory-workshop"',
      'config/custom_user_dir_name="hollow-wake-inventory-benchmark"').replace('run/main_scene="res://workshop_start.tscn"','run/main_scene="res://benchmark-rack.tscn"'));
    const preset=path.join(project,'export_presets.cfg'),settings=fs.readFileSync(preset,'utf8');
    assert(settings.includes('exclude_filter=""'));
    fs.writeFileSync(preset,settings.replace('exclude_filter=""','exclude_filter="legacy-course.txt,gear-cases.json,support-cases.json,rack-test.gd,socket-test.gd"'));
    godot(['--export-pack','Linux','/saves/Inventory.pck']);
    fs.writeFileSync(configFile,projectSettings);
    const file=path.join(scratch,'hollow-wake-workshop-device-benchmark-linux-x64.zip');
    const tool=path.join(root,'scripts/workshop-device-player.py');
    run(config.python,['-I',tool,'pack',devicePlayer,path.join(saves,'Inventory.pck'),file],env);
    const raw=run('docker',['run','--rm','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
      '--user','1000:1000','--tmpfs','/tmp:rw,exec,nosuid,size=256m',
      '--mount','type=bind,source='+tool+',target=/check.py,readonly','--mount','type=bind,source='+file+',target=/player.zip,readonly',
      '--entrypoint','/usr/bin/python3',image,'-I','/check.py','test','/player.zip'],process.env);
    const observation=JSON.parse(raw);
    for(const size of ['small','loaded']){
      assert.equal(observation[size].actionUs.length,32);
    }
    portable={archive:path.basename(file),packSha256:hash(path.join(saves,'Inventory.pck')),tested:'Exported Linux player and launcher in Steam Runtime 4 with temporary storage.',
      saves:{small:observation.small.saveSha256,loaded:observation.loaded.saveSha256},
      heapBytes:Math.max(observation.small.peakBytes,observation.loaded.peakBytes)};
    files.push(file);
  }
  const comparison=compare?compareWorkshopProjects({prior:compare,release:projectZip,saveDir:path.dirname(database),godot,platform,
    install:(prior,release,variant)=>run(config.python,['-I',path.join(root,'scripts/workshop-rack-project.py'),'switch',prior,release,variant,project],env)}):undefined;
  if(portable)for(const size of ['small','loaded'])assert.equal(portable.saves[size],comparison.runs[0][size].saveSha256);
  const checksums=Object.fromEntries(files.map(f=>[path.basename(f),hash(f)]));
  const report={version:pkg.version,platform,donorSha256:expected,legacyCommands:course.rows.length,originalGearCards:gear.length,
    recall:{...pouch,...socketResult.pouch,saveSha256:recallSaveHash},
    baseBytes:base.bytes.length,rackBytes:rack.bytes.length-base.bytes.length,socketBytes:support.bytes.length-rack.bytes.length,
    gateBytes:Buffer.byteLength(gate.bundle),gateDataBytes:gate.data.length,nativeHeapPeakBytes:result.peak,
    supports:{nativeQueries:socketResult.cases,revision:socketResult.revision,pageReads:socketResult.metrics.pageReads,bytesRead:socketResult.metrics.bytesRead,heapPeakBytes:socketResult.metrics.heap.peak_bytes,
      corruptedPageRejected:true,closedHeapBytes:0,staleWriterRejected:true,saveVerified:true},
    ...(steamEditor?{steamRuntime:image}:{}),...(comparison?{comparison}:{}),...(portable?{portable}:{}),...(exported?{exported}:{}),
    tested:'Headless Godot scene controls, two SQLite connections, reopened save and independent database reader',checksums};
  fs.mkdirSync(dest,{recursive:true});
  for(const file of files){
    const target=path.join(dest,path.basename(file));
    if(fs.existsSync(target))assert.equal(hash(target),hash(file),'Existing release differs: '+target);
  }
  for(const file of files){
    const target=path.join(dest,path.basename(file));
    if(!fs.existsSync(target))fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);
  }
  writeJSON(path.join(dest,'verification-'+platform+'.json'),report);console.log(report);
}finally{
  const owned=fs.realpathSync(scratch);
  assert(path.dirname(owned)===parent&&path.basename(owned).startsWith('owned-rack-'));
  fs.rmSync(owned,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
