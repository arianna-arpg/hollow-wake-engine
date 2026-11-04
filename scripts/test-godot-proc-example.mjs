import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';

const [packageOption,receipt,toolsOption,toolsFile]=process.argv.slice(2);
assert.deepEqual([packageOption,toolsOption],['--package','--tools'],'Supply the package receipt and pinned Godot tools JSON');
const read=file=>JSON.parse(fs.readFileSync(file)), hash=file=>sha256(fs.readFileSync(file));
const pkg=read(receipt), tools=read(toolsFile), windows=process.platform==='win32';
assert(pkg.passed && pkg.platform===process.platform && pkg.arch==='x64');
assert.equal(hash(pkg.archive),pkg.archiveSha256);
const pin=read(path.join(root,'experiments/godot-native/toolchain-lock.json')).platforms[process.platform];
assert.equal(hash(tools.editor),pin.editor.executableSha256);
assert.equal(hash(tools.exportDebug),pin.templates.files[pin.templates.debug]);
assert.equal(hash(tools.exportRelease),pin.templates.files[pin.templates.release]);

const directory=fs.realpathSync(fs.mkdtempSync(path.join(root,'.artifacts/godot-proc-replay-')));
const project=path.join(directory,'project'), exported=path.join(directory,'exported'), relocated=path.join(directory,'relocated');
fs.mkdirSync(project);
execFileSync(tools.python,['-I',path.join(root,'scripts/godot-proc-example-archive.py'),'install',pkg.archive,project],{windowsHide:true});
const addon=path.join(project,'addons/hollow_wake'), data=path.join(addon,'ward');
for(const [file,digest] of Object.entries(pkg.files))assert.equal(hash(path.join(data,file)),digest,file);
fs.copyFileSync(path.join(root,'experiments/godot-native/project.godot'),path.join(project,'project.godot'));
const scene=fs.readFileSync(path.join(root,'experiments/godot-native/main.tscn'),'utf8');assert.equal(scene.split('res://replay.gd').length,2);
fs.writeFileSync(path.join(project,'main.tscn'),scene.replace('res://replay.gd','res://probe.gd'));
fs.copyFileSync(path.join(root,'test/godot-ward-example/probe.gd'),path.join(project,'probe.gd'));
const env={...process.env};
for(const key of (windows?['APPDATA','LOCALAPPDATA']:['XDG_DATA_HOME','XDG_CONFIG_HOME','XDG_CACHE_HOME'])){
  env[key]=path.join(directory,key);fs.mkdirSync(env[key]);
}
for(const key of ['LD_LIBRARY_PATH','LD_PRELOAD','LD_AUDIT','LD_DEBUG','LD_DEBUG_OUTPUT'])delete env[key];
const commands=[];
function run(name,command,args,cwd=directory){
  const log=path.join(directory,name+'.txt'), fd=fs.openSync(log,'wx');
  let result;
  try{result=spawnSync(command,args,{cwd,env,windowsHide:true,timeout:180000,stdio:['ignore',fd,fd]});}
  finally{fs.closeSync(fd);}
  const text=fs.readFileSync(log,'utf8');
  commands.push({name,exitCode:result.status,logSha256:hash(log)});
  assert(!result.error&&!result.signal,name+' '+String(result.error??result.signal));assert.equal(result.status,0,name+' '+text.slice(-600));
  assert(!/SCRIPT ERROR:|Parse Error:/.test(text),name+' script error');
  return text;
}
function play(name,command,args,cwd){
  const output=run(name,command,args,cwd);
  const result=output.split(/\r?\n/).filter(line=>line.startsWith('{')).map(JSON.parse).at(-1);
  assert(result?.passed,name);
  const cue=(time,ward)=>({time,ward,phase:'gain',id:'desperate_ward',color:'#8ae0b8'});
  assert.deepEqual([result.first,result.held,result.second,result.next],[
    {ok:true,ward:30,cue:cue(0,30),draws:1},{ok:true,ward:30,cue:null,draws:2},
    {ok:true,ward:30,cue:cue(0,30),draws:1},{ok:true,ward:60,cue:cue(20,60),draws:3},
  ]);
  assert.equal(result.cue_count,66);assert.equal(result.metrics.live_bytes,0);
  assert.equal(result.metrics.live_blocks,0);assert(result.metrics.peak_bytes>0&&result.metrics.peak_bytes<=4*1024*1024);
  return result;
}
run('import',tools.editor,['--headless','--import','--path',project,'--frame-delay','1000','--log-file',path.join(directory,'import-engine.log')]);
const editor=play('editor',tools.editor,['--headless','--path',project,'--log-file',path.join(directory,'editor-engine.log')],directory);
const platform=windows?'Windows Desktop':'Linux', executable=windows?'ward.exe':'ward.x86_64';
const preset='[preset.0]\nname='+JSON.stringify(platform)+'\nplatform='+JSON.stringify(platform)+'\nrunnable=true\nexport_filter="all_resources"\ninclude_filter="*.txt,*.json,*.md"\nexclude_filter=""\n\n[preset.0.options]\ncustom_template/debug='+JSON.stringify(tools.exportDebug.replaceAll('\\','/'))+'\ncustom_template/release='+JSON.stringify(tools.exportRelease.replaceAll('\\','/'))+'\nbinary_format/architecture="x86_64"\nbinary_format/embed_pck=false\n'+(windows?'application/modify_resources=false\ncodesign/enable=false\n':'');
fs.writeFileSync(path.join(project,'export_presets.cfg'),preset,{flag:'wx'});fs.mkdirSync(exported);
run('export',tools.editor,['--headless','--path',project,'--export-release',platform,path.join(exported,executable),'--log-file',path.join(directory,'export-engine.log')]);
fs.cpSync(exported,relocated,{recursive:true,force:false,errorOnExist:true});
for(const library of listFiles(path.join(addon,'bin'))){
  const name=path.basename(library),matches=listFiles(relocated).filter(f=>path.basename(f)===name);
  assert.equal(matches.length,1,name);assert.equal(hash(path.join(relocated,matches[0])),hash(path.join(addon,'bin',library)));
}
for(const folder of [project,exported]){
  const source=fs.realpathSync(folder),destination=path.join(directory,path.basename(folder)+'-unavailable');
  assert.equal(path.dirname(source),directory);assert.equal(path.dirname(destination),directory);assert(!fs.existsSync(destination));
  fs.renameSync(source,destination);
}
const release=play('release',path.join(relocated,executable),['--headless','--log-file',path.join(directory,'release-engine.log')],relocated);
const gameplay=({metrics,...result})=>result;assert.deepEqual(gameplay(release),gameplay(editor));
assert.equal(hash(pkg.archive),pkg.archiveSha256);
const report={passed:true,directory,platform:process.platform,arch:process.arch,archiveSha256:pkg.archiveSha256,packageReceiptSha256:hash(receipt),commands,
  editor,release,releaseWithoutProject:true,scope:'Selected Desperate Ward effect in a 64-actor Godot example. Peak bytes report tracked embedded allocations only.'};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/godot-proc-replay-latest.json'),{directory});
console.log({passed:true,directory,editorPeakBytes:editor.metrics.peak_bytes,releasePeakBytes:release.metrics.peak_bytes});
