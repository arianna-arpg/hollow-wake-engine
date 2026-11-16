import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {downloadPinned} from './tool-download.mjs';import {root,sha256,writeJSON} from './reference-utils.mjs';
const [flag,python]=process.argv.slice(2);assert(flag==='--python'&&python&&process.argv.length===4);
const lock=JSON.parse(fs.readFileSync(path.join(root,'experiments/godot-native/toolchain-lock.json'))),target=lock.platforms[process.platform];assert(target&&process.arch==='x64');
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'m4-godot-tools-owned-'));let complete=false;
try{
 for(const item of [target.editor.archive,lock.exportTemplates])await downloadPinned(item,path.join(work,item.name??path.posix.basename(new URL(item.url).pathname)));
 const request={editor:target.editor.archive.name,editorMembers:target.editor.members,templates:path.posix.basename(new URL(lock.exportTemplates.url).pathname),templateMembers:Object.keys(target.templates.files)};
 fs.writeFileSync(path.join(work,'extract.json'),JSON.stringify(request));
 const script='import pathlib,json,zipfile,sys\nr=pathlib.Path(sys.argv[1]).resolve(); cfg=json.loads((r/"extract.json").read_text())\nfor key,names,prefix in [("editor","editorMembers",""),("templates","templateMembers","templates/")]:\n with zipfile.ZipFile(r/cfg[key]) as z:\n  for name in cfg[names]:\n   assert pathlib.PurePosixPath(name).name==name and ".." not in name\n   with (r/name).open("xb") as f: f.write(z.read(prefix+name))\n';
 fs.writeFileSync(path.join(work,'extract.py'),script);
 const extracted=spawnSync(python,[path.join(work,'extract.py'),work],{windowsHide:true,encoding:'utf8',timeout:120000});assert(!extracted.error&&extracted.status===0,extracted.stderr);
 const tools={editor:path.join(work,target.editor.executable),exportRelease:path.join(work,target.templates.release),exportDebug:path.join(work,target.templates.debug)};
 assert.equal(sha256(fs.readFileSync(tools.editor)),target.editor.executableSha256);
 for(const[name,expected]of Object.entries(target.templates.files))assert.equal(sha256(fs.readFileSync(path.join(work,name))),expected);
 if(process.platform==='linux')for(const file of Object.values(tools))fs.chmodSync(file,0o755);
 // Archives are no longer needed once the pinned executables are verified.
 for(const item of [target.editor.archive,lock.exportTemplates])fs.unlinkSync(path.join(work,item.name??path.posix.basename(new URL(item.url).pathname)));
 writeJSON(path.join(work,'tools.json'),tools);writeJSON(path.join(owned,'m4-godot-tools.json'),tools);complete=true;console.log({passed:true,directory:work});
}finally{if(!complete){assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});}}
