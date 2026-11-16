import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){const flag=args[i];assert(['--tools','--distribution','--render'].includes(flag)&&!options[flag]);options[flag]=flag==='--render'?true:args[++i];assert(options[flag]);}
assert(options['--tools']);
const tools=JSON.parse(fs.readFileSync(options['--tools'])),render=!!options['--render'],windows=process.platform==='win32';
const pin=JSON.parse(fs.readFileSync(path.join(root,'experiments/godot-native/toolchain-lock.json'))).platforms[process.platform];
assert.equal(sha256(fs.readFileSync(tools.editor)),pin.editor.executableSha256);
assert.equal(sha256(fs.readFileSync(tools.exportRelease)),pin.templates.files[pin.templates.release]);
const parent=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(parent,'m4-player-owned-')),consumer=path.join(work,'consumer');
const report={passed:false,platform:process.platform,node:process.versions.node,godot:'4.7.2',runs:[],rendered:render,deviceQualified:false},logs={};
const settings=path.join(work,'settings');fs.mkdirSync(settings);
const env={...process.env,NODE_PATH:'',APPDATA:settings,LOCALAPPDATA:settings,XDG_CONFIG_HOME:settings,XDG_DATA_HOME:settings,XDG_CACHE_HOME:settings,
 TEMP:work,TMP:work,TMPDIR:work,NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NPM_CONFIG_OFFLINE:'true',NPM_CONFIG_UPDATE_NOTIFIER:'false'};
const children=new Set();
async function run(label,file,argv,cwd=consumer){
 const child=spawn(file,argv,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});children.add(child);let stdout='',stderr='';
 child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
 const timer=setTimeout(()=>child.kill(),180000);
 try{const status=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});logs[label]={stdout,stderr,status};
  assert.equal(status,0,label+': '+stderr.slice(-4000));
  // Windows' restricted local certificate-store diagnostic is unrelated to
  // this loopback-only protocol. Every other Godot error fails qualification.
  const errors=stderr.replace(/ERROR: Failed to read the root certificate store\.\r?\n\s+at: get_system_ca_certificates[^\n]*\n?/g,'');
  assert(!/SCRIPT ERROR:|ERROR:|Parse Error:/.test(errors),label+': '+errors);
  return stdout;
 }finally{clearTimeout(timer);children.delete(child);}
}
async function play(label,file,argv){
 const server=spawn(process.execPath,['host/serve.mjs','--port','0'],{cwd:consumer,env,windowsHide:true,stdio:['ignore','pipe','pipe']});children.add(server);
 let output='',error='';server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>error+=c);
 try{
  for(let i=0;i<200&&!output.includes('listening');i++){assert.equal(server.exitCode,null,error);await delay(50);}
  const ready=JSON.parse(output.trim());assert(ready.memoryOnly);
  const text=await run(label,file,[...argv,'--','--verify','--port='+ready.listening,...(render?['--capture='+path.join(parent,'m4-godot-'+label+'.png')]:[])]);
  const lines=text.split(/\r?\n/).filter(s=>s.startsWith('HWE_NODE_GODOT '));assert.equal(lines.length,1);
  const proof=JSON.parse(lines[0].slice(15));assert(proof.passed&&proof.states>=120&&proof.moved&&proof.contact&&proof.preview);
  assert.deepEqual(proof.buildKinds,['inventory','support','passive']);assert.equal(proof.revision,3);
  assert.equal(error,'');report.runs.push({label,...proof});
 }finally{server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once('exit',resolve));children.delete(server);}
}
try{
 if(options['--distribution']){
  const source=fs.realpathSync(options['--distribution']),manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json')));
  assert.equal(manifest.capability,'node-godot-reference/v1');assert.equal(Object.keys(manifest.archives).length,5);
  for(const [file,hash]of Object.entries(manifest.archives)){assert.equal(path.basename(file),file);assert.equal(sha256(fs.readFileSync(path.join(source,'packages',file))),hash);}
  fs.mkdirSync(consumer);
  // Copy only the distributable host/client and archives, never an installed
  // dependency tree, editor cache, user saves or verification output.
  for(const name of ['package.json','manifest.json','host','client','packages'])fs.cpSync(path.join(source,name),path.join(consumer,name),{recursive:true,filter:file=>!file.split(path.sep).includes('.godot')});
  report.distribution=manifest;report.suppliedDistribution=true;
 }else report.distribution=await (await import('./build-node-godot.mjs')).buildNodeGodotExample(consumer);
 await run('install',process.execPath,[npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund']);
 const project=path.join(consumer,'client'),exported=path.join(work,'player');fs.mkdirSync(exported);
 const executable=path.join(exported,'hollow-wake-reference'+(windows?'.exe':'.x86_64'));
 fs.writeFileSync(path.join(project,'export_presets.cfg'),`[preset.0]\nname="Reference"\nplatform="${windows?'Windows Desktop':'Linux'}"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter=""\nexclude_filter=""\nexport_path=""\n[preset.0.options]\ncustom_template/release=${JSON.stringify(tools.exportRelease.replaceAll('\\','/'))}\ncustom_template/debug=${JSON.stringify(tools.exportDebug.replaceAll('\\','/'))}\nbinary_format/embed_pck=true\napplication/modify_resources=false\ncodesign/enable=false\n`);
 await run('import',tools.editor,['--headless','--path',project,'--editor','--quit']);
 await play('editor',tools.editor,[...(render?[]:['--headless']),'--path',project]);
 await run('export',tools.editor,['--headless','--path',project,'--export-release','Reference',executable]);
 report.export={sha256:sha256(fs.readFileSync(executable)),bytes:fs.statSync(executable).size};
 // Export runs with source scene unavailable; the consuming project contains
 // only installed distributions, chosen content and its own host adapter.
 const hidden=path.join(consumer,'client-unavailable');assert.equal(path.dirname(fs.realpathSync(project)),fs.realpathSync(consumer));assert.equal(path.dirname(hidden),consumer);fs.renameSync(project,hidden);
 await play('exported',executable,render?[]:['--headless']);
 report.passed=true;console.log({passed:true,runs:report.runs,export:report.export,rendered:render,deviceQualified:false});
}finally{
 for(const child of children){child.kill();if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));}
 assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 writeJSON(path.join(parent,'m4-godot-player.json'),report);writeJSON(path.join(parent,'m4-godot-player-logs.json'),logs);
}
