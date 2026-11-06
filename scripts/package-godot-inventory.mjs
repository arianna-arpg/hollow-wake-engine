import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectionTerms} from './compile-inspection-terms.mjs';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';

const [toolFlag,toolsFile,libFlag,receipt,zipFlag,addon,...extra]=process.argv.slice(2);
assert.deepEqual([toolFlag,libFlag,zipFlag],['--tools','--library','--addon']);
assert(extra.length===0 || (extra.length===2 && extra[0]==='--addon-proof'));
const read=f=>JSON.parse(fs.readFileSync(f)), hash=f=>sha256(fs.readFileSync(f));
const tools=read(toolsFile), lib=read(receipt);
const windows=process.platform==='win32', platform=windows?'windows':'linux';
const pin=read(path.join(root,'experiments/godot-native/toolchain-lock.json')).platforms[process.platform];
const accepted=read(extra[1]??path.join(root,windows?'evidence/godot-crafting/windows.json':'evidence/steamrt-sessions/linux.json'));
assert(accepted.passed && accepted.platform===process.platform && accepted.arch===process.arch);
const original=read(path.join(root,'evidence/content-tables/windows.json'));
assert.equal(accepted.fixture.sha256,original.native.courseSha256);
assert(accepted.observations.independentlyEqualsReference && accepted.observations.editorEqualsRelease);
assert.equal(accepted.observations.rows,original.native.commands);
assert.equal(hash(addon),accepted.package.archiveSha256);
assert(lib.passed&&lib.platform===process.platform&&lib.arch===process.arch);
assert.equal(hash(lib.library),lib.librarySha256);assert.equal(hash(tools.editor),pin.editor.executableSha256);
assert.equal(hash(tools.exportRelease),pin.templates.files[pin.templates.release]);
assert.equal(hash(tools.exportDebug),pin.templates.files[pin.templates.debug]);
for(const [f,digest] of Object.entries(lib.sources))assert.equal(hash(path.join(root,f)),digest,f);
const dir=fs.mkdtempSync(path.join(root,'.artifacts/inventory-workshop-')),project=path.join(dir,'project');
fs.mkdirSync(project);
const env={...process.env};
for(const key of windows?['APPDATA','LOCALAPPDATA']:['XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME']){
  env[key]=path.join(dir,key);fs.mkdirSync(env[key]);
}
function run(label,exe,args) {
  const log=path.join(dir,label+'.txt'),fd=fs.openSync(log,'wx');
  try{execFileSync(exe,args,{cwd:dir,env,stdio:['ignore',fd,fd],windowsHide:true,timeout:180000});}
  catch(error){console.error(fs.readFileSync(log,'utf8').slice(-3000));throw error;}
  finally{fs.closeSync(fd);}
  const errors=fs.readFileSync(log,'utf8').split(/\r?\n/).filter(line=>/ERROR:|SCRIPT ERROR|Parse Error:|WARNING:.*(?:leak|ObjectDB)/i.test(line)&&!(windows&&line==='ERROR: Failed to read the root certificate store.'));
  assert.deepEqual(errors,[],label);
}
function zip(label,folder,prefix,filename) {
  const script=[
    'import pathlib,sys,zipfile,stat','root=pathlib.Path(sys.argv[1])','with zipfile.ZipFile(sys.argv[3],"x") as z:',
    ' for f in sorted(p for p in root.rglob("*") if p.is_file()):',
    '  rel=f.relative_to(root).as_posix()',
    '  info=zipfile.ZipInfo(sys.argv[2]+rel);info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED',
    '  info.external_attr=((stat.S_IFREG | (0o755 if f.suffix in (".x86_64",".so") else 0o644))<<16)',
    '  z.writestr(info,f.read_bytes(),compresslevel=6)'
  ].join('\n');
  const output=path.join(dir,filename);
  run(label,tools.python,['-I','-c',script,folder,prefix,output]);
  return output;
}
run('install',tools.python,['-I',path.join(root,'scripts/godot-proc-example-archive.py'),'install',path.resolve(addon),project]);
assert.equal(hash(path.join(project,'addons/hollow_wake/crafting/inspection.json')),sha256(JSON.stringify(inspectionTerms())+'\n'),'Workshop requires the matching inspection vocabulary');
const cargoDir=path.join(project,'addons/hollow_wake/crafting');
const atlas=read(path.join(cargoDir,'cargo-index.json')),cargoBytes=fs.readFileSync(path.join(cargoDir,'cargo-pages.txt'));
assert.equal(atlas.format,'cargo-display-pages/v1');assert.equal(sha256(cargoBytes),atlas.sha256);
const ids=read(path.join(cargoDir,'manifest.json')).content;
assert.deepEqual([atlas.config.craftingContentId,atlas.config.skillContentId],ids.slice(1));
const store=path.join(project,'addons/hollow_wake_save');fs.mkdirSync(path.join(store,'bin'),{recursive:true});
for(const f of ['store.gdextension','README.md','sqlite-lock.json'])fs.copyFileSync(path.join(root,'adapters/godot/local-save',f),path.join(store,f));
for(const f of ['LICENSE.md','NOTICE.md'])fs.copyFileSync(path.join(root,f),path.join(store,f));
fs.copyFileSync(path.join(root,'experiments/godot-native/notices/godot-cpp-LICENSE.md'),path.join(store,'godot-cpp-LICENSE.md'));
fs.copyFileSync(lib.library,path.join(store,'bin',path.basename(lib.library)));
const extension=zip('zip-store',store,'addons/hollow_wake_save/','hollow-wake-local-save-'+platform+'-x64.zip');
const files=['project.godot','inventory.tscn','inventory.gd','profile.gd','cargo-sample.json','README.md'];
for(const f of files)fs.copyFileSync(path.join(root,'examples/godot-inventory',f),path.join(project,f));
const target=windows?'Windows Desktop':'Linux';
const preset='[preset.0]\nname='+JSON.stringify(target)+'\nplatform='+JSON.stringify(target)+'\nrunnable=true\nexport_filter="all_resources"\ninclude_filter="*.txt,*.json,*.md"\nexclude_filter=""\n\n[preset.0.options]\nbinary_format/architecture="x86_64"\nbinary_format/embed_pck=false\n'+(windows?'application/modify_resources=false\ncodesign/enable=false\n':'');
fs.writeFileSync(path.join(project,'export_presets.cfg'),preset);
const source=zip('zip-project',project,'inventory-workshop/','hollow-wake-inventory-project-'+platform+'-x64.zip');
const pristine=Object.fromEntries(listFiles(project).map(f=>[f,hash(path.join(project,f))]));
const localPreset=preset+'custom_template/debug='+JSON.stringify(tools.exportDebug.replaceAll('\\','/'))+'\ncustom_template/release='+JSON.stringify(tools.exportRelease.replaceAll('\\','/'))+'\n';
fs.writeFileSync(path.join(project,'export_presets.cfg'),localPreset);
run('import',tools.editor,['--headless','--import','--path',project,'--frame-delay','1000']);
const release=path.join(dir,'release');fs.mkdirSync(release);
const executable=path.join(release,windows?'Inventory.exe':'Inventory.x86_64');
run('export',tools.editor,['--headless','--path',project,'--export-release',target,executable]);
for(const relative of Object.keys(accepted.package.libraries)){
  assert.equal(hash(path.join(release,path.basename(relative))),accepted.package.libraries[relative]);
}
assert.equal(hash(path.join(release,path.basename(lib.library))),lib.librarySha256);
run('open-export',executable,['--headless','--quit-after','8']);
const notices=path.join(release,'notices');
fs.cpSync(path.join(project,'addons/hollow_wake/notices'),notices,{recursive:true});
fs.copyFileSync(path.join(store,'README.md'),path.join(notices,'SQLite-and-save-adapter.md'));
run('notices',tools.editor,['--headless','--path',project,'--script',path.join(root,'scripts/export-godot-notices.gd'),'--',path.join(notices,'Godot.json')]);
fs.copyFileSync(path.join(project,'README.md'),path.join(release,'README.md'));
const game=zip('zip-game',release,'inventory-workshop/','hollow-wake-inventory-'+platform+'-x64.zip');
const proof=path.join(dir,'build.json');
writeJSON(proof,{built:true,dir,project,release,executable,pristine,addonSha256:hash(addon),nativeReceiptSha256:hash(receipt),
  librarySha256:lib.librarySha256,archives:Object.fromEntries([source,game,extension].map(f=>[path.basename(f),hash(f)]))});
writeJSON(path.join(root,'.artifacts/inventory-workshop-latest.json'),{dir,proof});
console.log({dir,game,source,extension});
