import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';

const [toolsFlag,toolsFile,verifiedFlag,verifiedFile,bundleFlag,bundle,outFlag,output,...rest]=process.argv.slice(2);
assert.deepEqual([toolsFlag,verifiedFlag,bundleFlag,outFlag,rest.length],['--tools','--verified','--bundle','--out',0]);
assert.equal(process.platform,'linux');
const read=file=>JSON.parse(fs.readFileSync(file)),hash=file=>sha256(fs.readFileSync(file));
const tools=read(toolsFile),verified=read(verifiedFile),inputs=read(path.join(bundle,'inputs.json'));
assert(verified.passed&&verified.workshop&&inputs.gameSha256===verified.workshop.playerArchiveSha256);
const pin=read(path.join(root,'experiments/godot-native/toolchain-lock.json')).platforms.linux;
assert.equal(hash(tools.editor),pin.editor.executableSha256);
const out=path.resolve(output);assert(!fs.existsSync(out));
const fixture=path.join(verified.dir,'project-unavailable');
const original=fs.readFileSync(path.join(fixture,'driver.gd'),'utf8');
assert.equal(original,fs.readFileSync(path.join(root,'test/godot-inventory/driver.gd'),'utf8'));
fs.mkdirSync(out);
const temporary=fs.mkdtempSync(path.join(path.dirname(out),'inventory-platform-faults-'));
const project=path.join(temporary,'project'),runs=[];
function run(label,args){
  const result=spawnSync(tools.editor,['--headless','--path',project,...args],
    {encoding:'utf8',timeout:180000,env:{...process.env,HOME:temporary,XDG_CONFIG_HOME:temporary,XDG_DATA_HOME:temporary,XDG_CACHE_HOME:temporary}});
  const text=result.stdout+result.stderr;
  fs.writeFileSync(path.join(out,label+'.txt'),text,{flag:'wx'});
  assert(!result.error&&!result.signal&&result.status===0,label+': '+text);
  assert(!/ERROR:|SCRIPT ERROR|ObjectDB instances leaked/.test(text),label+': '+text);
}
try{
  fs.cpSync(fixture,project,{recursive:true,filter:file=>path.basename(file)!=='.godot'});
  run('import',['--editor','--import','--frame-delay','1000']);
  const faults=[
    ['lost-commit','var reply := inner.commit_slot(token)','var reply := inner.cancel_slot(token)'],
    ['premature-commit','did_stage = reply.ok','did_stage = reply.ok\n\t\tif reply.ok: inner.commit_slot(reply.token)'],
  ];
  for(const [name,before,after] of faults){
    assert.equal(original.split(before).length,2,name+' unique injection');
    fs.writeFileSync(path.join(project,'driver.gd'),original.replace(before,after));
    const dir=path.join(out,name);fs.mkdirSync(dir);
    const pack=path.join(dir,'inventory-proof.pck');
    run(name,['--export-pack','Linux',pack]);
    const altered=structuredClone(inputs);
    assert(Object.hasOwn(altered.proofFiles,'inventory-proof.pck'));
    altered.proofFiles['inventory-proof.pck']=hash(pack);
    writeJSON(path.join(dir,'inputs.json'),altered);
    runs.push({name,assertion:'recovered game view differs',packSha256:hash(pack),manifestSha256:hash(path.join(dir,'inputs.json'))});
  }
  assert.equal(fs.readFileSync(path.join(fixture,'driver.gd'),'utf8'),original);
  writeJSON(path.join(out,'faults.json'),{passed:true,gameSha256:inputs.gameSha256,runs,sourcePreserved:true,
    sources:Object.fromEntries(['scripts/prepare-inventory-platform-faults.mjs','test/godot-inventory/driver.gd'].map(f=>[f,hash(path.join(root,f))]))});
  console.log({passed:true,faults:runs.length});
}finally{
  fs.rmSync(temporary,{recursive:true,force:true,maxRetries:8,retryDelay:250});
}
