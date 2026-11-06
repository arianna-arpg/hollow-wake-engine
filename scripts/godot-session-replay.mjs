import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';

export function replayGodotSession({capability,probe,runner,scope,validate,prepareProject,compareObservations,additionalSources=[]}) {
const [packageOption,receipt,toolsOption,toolsFile]=process.argv.slice(2);
assert.deepEqual([packageOption,toolsOption],['--package','--tools']);
const read=file=>JSON.parse(fs.readFileSync(file)),hash=file=>sha256(fs.readFileSync(file));
const pkg=read(receipt),tools=read(toolsFile),windows=process.platform==='win32';
assert(pkg.passed&&pkg.platform===process.platform&&pkg.arch==='x64');assert.equal(hash(pkg.archive),pkg.archiveSha256);
const pin=read(path.join(root,'experiments/godot-native/toolchain-lock.json')).platforms[process.platform];
assert.equal(hash(tools.editor),pin.editor.executableSha256);
assert.equal(hash(tools.exportDebug),pin.templates.files[pin.templates.debug]);assert.equal(hash(tools.exportRelease),pin.templates.files[pin.templates.release]);
const combinedProgression=capability==='progression'&&Object.hasOwn(pkg.addon?.files??{},'crafting/manifest.json');
const replayName=combinedProgression?'combined-progression':capability;
const directory=fs.realpathSync(fs.mkdtempSync(path.join(root,'.artifacts/godot-'+replayName+'-replay-')));
const project=path.join(directory,'project'),exported=path.join(directory,'exported'),relocated=path.join(directory,'relocated');fs.mkdirSync(project);
const report={passed:false,directory,platform:process.platform,arch:process.arch,archiveSha256:pkg.archiveSha256,packageReceiptSha256:hash(receipt),commands:[],
  sources:Object.fromEntries(['scripts/godot-session-replay.mjs',runner,probe,...additionalSources].map(f=>[f,hash(path.join(root,f))])),
  scope};
const verification=path.join(directory,'verification.json');writeJSON(verification,report);
writeJSON(path.join(root,'.artifacts/godot-'+replayName+'-replay-latest.json'),{directory,receipt:verification});
try {
execFileSync(tools.python,['-I',path.join(root,'scripts/godot-proc-example-archive.py'),'install',pkg.archive,project],{windowsHide:true});
const addon=path.join(project,'addons/hollow_wake'),data=path.join(addon,capability);
if(pkg.addon){assert.equal(pkg.addon.archiveSha256,pkg.archiveSha256);assert.deepEqual(listFiles(addon).sort(),[...Object.keys(pkg.addon.files),'manifest.json'].sort());for(const [f,digest]of Object.entries(pkg.addon.files))assert.equal(hash(path.join(addon,f)),digest,f);}
const manifest=read(path.join(data,'manifest.json'));
assert.equal(manifest.capability,capability+'-session/v1');
if(!combinedProgression)assert.deepEqual(manifest.files,pkg.files);
for(const [file,digest] of Object.entries(manifest.files))assert.equal(hash(path.join(data,file)),digest,file);
if(prepareProject)report.fixture=prepareProject(project,pkg);
fs.copyFileSync(path.join(root,'experiments/godot-native/project.godot'),path.join(project,'project.godot'));
const scene=fs.readFileSync(path.join(root,'experiments/godot-native/main.tscn'),'utf8');assert.equal(scene.split('res://replay.gd').length,2);
fs.writeFileSync(path.join(project,'main.tscn'),scene.replace('res://replay.gd','res://probe.gd'));
fs.copyFileSync(path.join(root,probe),path.join(project,'probe.gd'));
const env={...process.env};
for(const key of (windows?['APPDATA','LOCALAPPDATA']:['XDG_DATA_HOME','XDG_CONFIG_HOME','XDG_CACHE_HOME'])){env[key]=path.join(directory,key);fs.mkdirSync(env[key]);}
for(const key of ['LD_LIBRARY_PATH','LD_PRELOAD','LD_AUDIT','LD_DEBUG','LD_DEBUG_OUTPUT'])delete env[key];
function run(name,command,args,cwd=directory){
  const log=path.join(directory,name+'.txt'),fd=fs.openSync(log,'wx');let result;
  try{result=spawnSync(command,args,{cwd,env,windowsHide:true,timeout:180000,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
  const text=fs.readFileSync(log,'utf8');report.commands.push({name,exitCode:result.status,logSha256:hash(log)});writeJSON(verification,report);
  assert(!result.error&&!result.signal,name+' '+String(result.error??result.signal));assert.equal(result.status,0,name+' '+text.slice(-1200));
  assert(!/SCRIPT ERROR:|Parse Error:/.test(text),name+' script error');return text;
}
function play(name,command,args,cwd){
  const observations=path.join(directory,name+'-observations.jsonl');
  if(compareObservations)env.HWE_GODOT_OBSERVATIONS=observations;
  else delete env.HWE_GODOT_OBSERVATIONS;
  const output=run(name,command,[...args,'--quit-after','16'],cwd),result=output.split(/\r?\n/).filter(line=>line.startsWith('{')).map(JSON.parse).at(-1);
  assert(result?.passed,name);validate(result,name);
  if(compareObservations){report.observations??={};report.observations[name]=compareObservations(observations);writeJSON(verification,report);}
  return result;
}
run('import',tools.editor,['--headless','--import','--path',project,'--frame-delay','1000','--log-file',path.join(directory,'import-engine.log')]);
report.editor=play('editor',tools.editor,['--headless','--path',project,'--log-file',path.join(directory,'editor-engine.log')]);
const platform=windows?'Windows Desktop':'Linux',executable=capability+(windows?'.exe':'.x86_64');
const preset='[preset.0]\nname='+JSON.stringify(platform)+'\nplatform='+JSON.stringify(platform)+'\nrunnable=true\nexport_filter="all_resources"\ninclude_filter="*.txt,*.json,*.md"\nexclude_filter=""\n\n[preset.0.options]\ncustom_template/debug='+JSON.stringify(tools.exportDebug.replaceAll('\\','/'))+'\ncustom_template/release='+JSON.stringify(tools.exportRelease.replaceAll('\\','/'))+'\nbinary_format/architecture="x86_64"\nbinary_format/embed_pck=false\n'+(windows?'application/modify_resources=false\ncodesign/enable=false\n':'');
fs.writeFileSync(path.join(project,'export_presets.cfg'),preset,{flag:'wx'});fs.mkdirSync(exported);
run('export',tools.editor,['--headless','--path',project,'--export-release',platform,path.join(exported,executable),'--log-file',path.join(directory,'export-engine.log')]);
fs.cpSync(exported,relocated,{recursive:true,force:false,errorOnExist:true});
for(const library of listFiles(path.join(addon,'bin'))){const name=path.basename(library),matches=listFiles(relocated).filter(f=>path.basename(f)===name);
  assert.equal(matches.length,1,name);assert.equal(hash(path.join(relocated,matches[0])),hash(path.join(addon,'bin',library)));}
for(const folder of [project,exported]){
  const source=fs.realpathSync(folder),destination=path.join(directory,path.basename(folder)+'-unavailable');
  assert.equal(path.dirname(source),directory);assert.equal(path.dirname(destination),directory);assert(!fs.existsSync(destination));fs.renameSync(source,destination);
}
const exportHashes=()=>Object.fromEntries(listFiles(relocated).map(file=>[file,hash(path.join(relocated,file))]));
report.exportedFiles=exportHashes();
report.release=play('release',path.join(relocated,executable),['--headless','--log-file',path.join(directory,'release-engine.log')],relocated);
assert.deepEqual(exportHashes(),report.exportedFiles,'Released files changed during replay');
const gameplay=result=>Object.fromEntries(Object.entries(result).filter(([key])=>!key.endsWith('metrics')));assert.deepEqual(gameplay(report.release),gameplay(report.editor));
assert.equal(hash(pkg.archive),pkg.archiveSha256);report.releaseWithoutProject=true;report.passed=true;
console.log({passed:true,directory,editorPeakBytes:report.editor.metrics.peak_bytes,releasePeakBytes:report.release.metrics.peak_bytes});
} catch(error){report.failure={name:error.name,message:error.message};throw error;}finally{writeJSON(verification,report);}
}
