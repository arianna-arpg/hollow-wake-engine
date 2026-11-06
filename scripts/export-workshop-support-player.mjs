import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,sha256} from './reference-utils.mjs';

export function exportSupportPlayer({player,project,saves,scratch,config,env,run,godot,platform,image,container,saveHash,recallHash}){
  const preset=path.join(project,'export_presets.cfg'),settings=fs.readFileSync(preset,'utf8');
  const projectFile=path.join(project,'project.godot'),main=fs.readFileSync(projectFile,'utf8');
  assert(settings.includes('exclude_filter=""')&&main.includes('run/main_scene="res://workshop_start.tscn"'));
  const release=path.join(saves,'playable.pck'),test=path.join(saves,'socket-test.pck');
  const exportPack=file=>godot(['--export-pack',platform==='windows'?'Windows Desktop':'Linux',container?'/saves/'+path.basename(file):file]);
  try{
    fs.writeFileSync(preset,settings.replace('exclude_filter=""','exclude_filter="legacy-course.txt,gear-cases.json,support-cases.json,pouch-cases.json,pouch-control.txt,rack-test.gd,socket-test.gd,socket-test.tscn"'));
    exportPack(release);
    fs.writeFileSync(preset,settings.replace('exclude_filter=""','exclude_filter="legacy-course.txt,gear-cases.json,rack-test.gd"'));
    fs.writeFileSync(projectFile,main.replace('run/main_scene="res://workshop_start.tscn"','run/main_scene="res://socket-test.tscn"'));
    exportPack(test);
  }finally{fs.writeFileSync(projectFile,main);fs.writeFileSync(preset,settings);}
  const tool=path.join(root,'scripts/workshop-device-player.py'),archive='hollow-wake-inventory-'+platform+'-x64.zip',zip=path.join(scratch,archive);
  run(config.python,['-I',tool,'pack-game',player,release,zip,platform],env);
  const mount=(from,to)=>['--mount','type=bind,source='+from+',target='+to+',readonly'];
  const raw=container?run('docker',['run','--rm','--pull=never','--network=none','--read-only','--cap-drop=ALL',
    '--security-opt=no-new-privileges','--user','1000:1000','--tmpfs','/tmp:rw,exec,nosuid,size=256m',
    ...mount(tool,'/check.py'),...mount(zip,'/game.zip'),...mount(test,'/test.pck'),'--entrypoint','/usr/bin/python3',image,
    '-I','/check.py','test-game','/game.zip','/test.pck',saveHash,recallHash],process.env)
    :run(config.python,['-I',tool,'test-game',zip,test,saveHash,recallHash],env);
  return {archive,releasePackSha256:sha256(fs.readFileSync(release)),...JSON.parse(raw)};
}
