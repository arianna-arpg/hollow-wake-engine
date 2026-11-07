import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {verifySteamImage,verifySteamContainer} from './steamrt-image.mjs';
import {verifyInventoryPlatform} from './inventory-platform-proof.mjs';

const args=process.argv.slice(2),options=new Map();
while(args.length){const key=args.shift(),value=args.shift();assert(['--bundle','--faults','--out','--docker'].includes(key)&&value&&!options.has(key));options.set(key,value);}
for(const key of ['--bundle','--faults','--out'])assert(options.has(key),key);
const read=file=>JSON.parse(fs.readFileSync(file)),hash=file=>sha256(fs.readFileSync(file));
const bundle=fs.realpathSync(options.get('--bundle')),faults=fs.realpathSync(options.get('--faults')),out=path.resolve(options.get('--out'));
assert(!fs.existsSync(out));fs.mkdirSync(out);
const docker=options.get('--docker')??'docker',pin=read(path.join(root,'experiments/steamrt-godot/toolchain-lock.json')).images.platform;
const inputs=read(path.join(bundle,'inputs.json')),controls=read(path.join(faults,'faults.json'));
assert(controls.passed&&controls.sourcePreserved);assert.equal(controls.gameSha256,inputs.gameSha256);
assert.deepEqual(controls.runs.map(row=>row.name),['lost-commit','premature-commit']);
for(const [f,h] of Object.entries(controls.sources))assert.equal(hash(path.join(root,f)),h,f);
const inputFiles=['game.zip','source.json','inputs.json','test-inventory-platform.py',...Object.keys(inputs.proofFiles).map(f=>'proof/'+f)];
const original=Object.fromEntries(inputFiles.map(f=>[f,hash(path.join(bundle,f))]));
assert.equal(original['test-inventory-platform.py'],hash(path.join(root,'scripts/test-inventory-platform.py')),'current Platform runner');
const report={passed:false,gameSha256:inputs.gameSha256,runs:[],containers:[],sources:Object.fromEntries([
  'scripts/replay-inventory-platform.mjs','scripts/test-inventory-platform.py','scripts/inventory-platform-proof.mjs','scripts/test-inventory-platform-proof.mjs',
].map(f=>[f,hash(path.join(root,f))]))};
const created=[];
function invoke(argv,label,expected=0,timeout=600000){
  const result=spawnSync(docker,argv,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:16*1024*1024});
  if(label)fs.writeFileSync(path.join(out,label+'.txt'),result.stdout+result.stderr,{flag:'wx'});
  assert(!result.error&&!result.signal,label+': '+String(result.error??result.signal));
  assert.equal(result.status,expected,label+': '+result.stdout+result.stderr);
  return result.stdout;
}
try{
  const image=JSON.parse(invoke(['image','inspect',pin.repository+'@'+pin.manifestDigest],'image'))[0];
  const identity=verifySteamImage(pin,image);report.image=identity;
  const user=process.platform==='win32'?'1000:1000':process.geteuid()+':'+process.getegid();
  assert(!user.startsWith('0:'),'non-root Platform runner');
  for(const variant of [null,...controls.runs]){
    const name=variant?.name??'control',results=variant?path.join(out,name):out;
    if(variant)fs.mkdirSync(results);
    const mounts=['--mount','type=bind,source='+bundle+',target=/bundle,readonly','--mount','type=bind,source='+results+',target=/evidence'];
    if(variant){
      const dir=path.join(faults,name),pack=path.join(dir,'inventory-proof.pck'),manifest=path.join(dir,'inputs.json');
      assert.equal(hash(pack),variant.packSha256);assert.equal(hash(manifest),variant.manifestSha256);
      mounts.push('--mount','type=bind,source='+pack+',target=/bundle/proof/inventory-proof.pck,readonly',
        '--mount','type=bind,source='+manifest+',target=/bundle/inputs.json,readonly');
    }
    const id=invoke(['create','--pull=never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
      '--user',user,'--tmpfs','/tmp:rw,nosuid,nodev,exec,size=536870912',...mounts,'--entrypoint','/usr/bin/python3',
      identity.reference,'-I','/bundle/test-inventory-platform.py','/bundle','/evidence'],name+'-create').trim();
    assert(/^[a-f0-9]{64}$/.test(id));created.push(id);
    const configuration=JSON.parse(invoke(['inspect',id],name+'-created'))[0];
    verifySteamContainer(identity,configuration);
    assert.equal(configuration.Config.User,user);assert.equal(configuration.HostConfig.NetworkMode,'none');assert(configuration.HostConfig.ReadonlyRootfs);
    assert(configuration.Mounts.filter(m=>m.Type==='bind').every(m=>m.RW===(m.Destination==='/evidence')));
    invoke(['start','--attach',id],name+'-execution',variant?1:0);
    const state=JSON.parse(invoke(['inspect',id],name+'-completed'))[0];
    verifySteamContainer(identity,state);assert.equal(state.State.Status,'exited');assert.equal(state.State.ExitCode,variant?1:0);
    report.containers.push({name,configuration,state});
    if(variant){
      const text=fs.readFileSync(path.join(out,name+'-execution.txt'),'utf8');
      assert(text.includes('RuntimeError: '+variant.assertion),name+' failed for wrong reason');
      assert(!fs.existsSync(path.join(results,'platform.json')),'bad recovery never accepted');
      report.runs.push({name,detected:true,assertion:variant.assertion});
    }else{
      const proof=read(path.join(out,'platform.json'));verifyInventoryPlatform(proof,inputs.gameSha256);
      const checked=spawnSync(process.execPath,[path.join(root,'scripts/test-inventory-platform-proof.mjs'),
        '--proof',path.join(out,'platform.json'),'--game-sha',inputs.gameSha256,'--out',path.join(out,'proof-controls.json')],
        {encoding:'utf8',windowsHide:true,timeout:60000});
      assert(!checked.error&&!checked.signal&&checked.status===0,checked.stdout+checked.stderr);
      report.runs.push({name,passed:true,crashes:proof.crashes.length,proofSha256:hash(path.join(out,'platform.json'))});
    }
  }
  for(const [file,h]of Object.entries(original))assert.equal(hash(path.join(bundle,file)),h,file);
  report.sourcePreserved=true;report.passed=true;
}finally{
  let cleanupFailure;
  for(const id of created.reverse()){
    try{
      const text=invoke(['rm','--force',id],null);
      assert.equal(text.trim(),id,'owned container removed');
      (report.cleanup??=[]).push({id,removed:true});
    }catch(error){report.passed=false;cleanupFailure=error;(report.cleanup??=[]).push({id,removed:false,error:error.message});}
  }
  writeJSON(path.join(out,'verification.json'),report);
  if(cleanupFailure)throw cleanupFailure;
}
console.log({passed:true,out,faults:controls.runs.length});
