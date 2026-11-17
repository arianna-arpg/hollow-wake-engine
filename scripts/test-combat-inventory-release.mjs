import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
const args=process.argv.slice(2),opts={};for(let i=0;i<args.length;i+=2){assert(['--release','--python','--node','--report','--godot-tools'].includes(args[i])&&args[i+1]&&!opts[args[i]]);opts[args[i]]=args[i+1];}
assert(opts['--release']);const release=fs.realpathSync(opts['--release']),manifest=JSON.parse(fs.readFileSync(path.join(release,'sdk-release.json')));
const reportPath=path.resolve(opts['--report']??path.join(root,'.artifacts/m6-release-verification.json'));assert(!fs.existsSync(reportPath),'Choose a new verification report');
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'m6-consumer-owned-')),consumer=path.join(work,'consumer');
const executable=value=>/[\\/]/.test(value)?path.resolve(value):value;
const runtime=executable(opts['--node']??process.execPath),python=executable(opts['--python']??'python'),report={passed:false,removed:[],controls:[],manifest,platform:process.platform};
const run=(file,argv,cwd=consumer)=>spawnSync(file,argv,{cwd,windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024,
 env:{...process.env,NODE_PATH:'',TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NPM_CONFIG_OFFLINE:'true',NPM_CONFIG_UPDATE_NOTIFIER:'false',PYTHONDONTWRITEBYTECODE:'1'}});
const good=result=>{assert(!result.error&&result.status===0,(result.stdout??'')+(result.stderr??String(result.error)));return result.stdout;};
try {
  for(const line of fs.readFileSync(path.join(release,'SHA256SUMS'),'utf8').trim().split('\n')){const [hash,file]=line.split('  ');assert.equal(path.basename(file),file);assert.equal(sha256(fs.readFileSync(path.join(release,file))),hash);}
  const archive=path.join(release,'hollow-wake-combat-inventory-'+manifest.version+'.zip');report.archiveSha256=sha256(fs.readFileSync(archive));
  good(run(python,[path.join(root,'scripts/combat-inventory-archive.py'),'extract',archive,consumer],work));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(consumer,'sdk-release.json'))),manifest);
  good(run(runtime,[npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund']));
  report.node=good(run(runtime,['--version'])).trim();
  const dist=fs.realpathSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist'));
  for(const name of manifest.optionalModuleRoots)for(const suffix of ['.js','.d.ts','.js.map','.d.ts.map']){
    assert(/^[a-z0-9-]+$/.test(name));const file=path.join(dist,name+suffix);assert.equal(path.dirname(file),dist);
    if(fs.existsSync(file)){assert(!fs.lstatSync(file).isSymbolicLink());fs.unlinkSync(file);report.removed.push(path.basename(file));}
  }
  assert(report.removed.length>=66);report.observations=JSON.parse(good(run(runtime,['verify.mjs'])));assert(report.observations.passed);
  // Deliberate corruption must fail before running any course, then restore exact bytes.
  for(const name of ['quickstart.mjs',manifest.prototypeSource?'verification/combat.json.gz':'verification/combat-frames.json.gz']){
    const file=path.join(consumer,name),bytes=fs.readFileSync(file);
    try{fs.appendFileSync(file,'changed');const bad=run(runtime,['verify.mjs']);assert.equal(bad.status,1);assert.match(bad.stderr,/Release file changed/);report.controls.push(name);}
    finally{fs.writeFileSync(file,bytes);}
  }
  const installed=path.join(consumer,'node_modules/@hollow-wake/combat/package.json'),bytes=fs.readFileSync(installed),bad=JSON.parse(bytes);
  try{bad.version='0.0.0-wrong';fs.writeFileSync(installed,JSON.stringify(bad));const result=run(runtime,['verify.mjs']);assert.equal(result.status,1);assert.match(result.stderr,/Install all five archives/);report.controls.push('mixed-package-version');}
  finally{fs.writeFileSync(installed,bytes);}
  const restored=JSON.parse(good(run(runtime,['verify.mjs'])));assert.deepEqual(restored,report.observations);
  assert(!fs.readdirSync(consumer).some(name=>name.startsWith('.verification-owned-')));
  if(opts['--godot-tools']){
    good(run(runtime,[path.join(root,'scripts/test-node-godot-player.mjs'),'--tools',path.resolve(opts['--godot-tools']),'--distribution',consumer],root));
    report.godot=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/m4-godot-player.json')));
    assert(report.godot.passed&&report.godot.cleaned&&report.godot.suppliedDistribution);
    assert.deepEqual(report.godot.distribution.archives,manifest.archives);
  }
  report.passed=true;console.log(JSON.stringify({passed:true,node:report.node,removedOptionalFiles:report.removed.length,controls:report.controls.length,observations:report.observations}));
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,force:true,maxRetries:5,retryDelay:200});report.cleaned=true;writeJSON(reportPath,report);
}
