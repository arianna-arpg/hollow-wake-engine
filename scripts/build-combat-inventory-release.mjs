import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,writeJSON,listFiles,git} from './reference-utils.mjs';
import {buildNodeGodotExample} from './build-node-godot.mjs';import {readScope} from './combat-inventory-scope-tools.mjs';
import {prepareParityReference} from './prototype-parity-tools.mjs';import {readPrototypeContent} from './prototype-content.mjs';
import {withPrototypeRevision,readRevisionFixture} from './prototype-revision-tools.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert(['--out','--python'].includes(args[i])&&args[i+1]&&!options[args[i]]);options[args[i]]=args[i+1];}
assert(options['--out'],'Use --out NEW_DIRECTORY [--python PYTHON]');
const out=path.resolve(options['--out']);assert(!fs.existsSync(out),'Refusing an existing release directory');
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});const owned=fs.realpathSync(path.join(root,'.artifacts'));
const work=fs.mkdtempSync(path.join(owned,'m6-release-owned-')),kit=path.join(work,'kit'),config=JSON.parse(fs.readFileSync(path.join(root,'release/combat-inventory.json')));
const run=(file,argv)=>{const r=spawnSync(file,argv,{cwd:root,windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:4*1024*1024,
 env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NPM_CONFIG_CACHE:path.join(work,'npm-cache'),PYTHONDONTWRITEBYTECODE:'1'}});assert(!r.error&&r.status===0,(r.stdout??'')+(r.stderr??String(r.error)));return r.stdout;};
let created=false,complete=false;
try {
  assert(!config.sourceProfile||['prototype-2026-11-16','prototype-2026-11-17'].includes(config.sourceProfile),'Unknown release source profile');
  const revision=config.sourceProfile==='prototype-2026-11-17';
  const useProfile=revision?withPrototypeRevision:async use=>{if(config.sourceProfile)prepareParityReference();return use(config.sourceProfile?readPrototypeContent():undefined);};
  await useProfile(async profile=>{
  const distribution=await buildNodeGodotExample(kit,profile),pkg=JSON.parse(fs.readFileSync(path.join(kit,'package.json')));
  assert.equal(Object.keys(pkg.dependencies).length,5);
  for(const [name,version]of Object.entries(config.packages))assert.equal(pkg.dependencies[name],'file:packages/'+name.replace('@','').replace('/','-')+'-'+version+'.tgz');
  const copy=(source,target)=>{fs.mkdirSync(path.dirname(path.join(kit,target)),{recursive:true});fs.copyFileSync(path.join(root,source),path.join(kit,target));};
  copy('examples/combat-inventory/README.md','README.md');copy('examples/combat-inventory/quickstart.mjs','quickstart.mjs');copy('examples/combat-inventory/verify.mjs','verify.mjs');
  copy('NOTICE.md','NOTICE.md');
  for(const file of ['sdk-adoption.md','sdk-host-services.md','sdk-compatibility.md','combat-inventory-capabilities.json'])copy('docs/'+file,'docs/'+file);
  for(const file of ['measurements.json','budgets.json'])copy('evidence/combat-inventory-milestone-five/'+file,'evidence/'+(profile?'previous-release-':'')+file);
  if(profile)for(const file of ['measurements.json','measurements.json.gz'])copy('evidence/'+(revision?'prototype-revision':'prototype-parity')+'/'+file,'evidence/'+file);
  if(profile){copy('docs/prototype-parity.md','docs/prototype-parity.md');copy('test/prototype-parity/installed.mjs','verification/prototype.mjs');copy('test/prototype-parity/replay.mjs','verification/replay.mjs');}
  if(revision){
    copy('docs/prototype-revision.md','docs/prototype-revision.md');copy('test/prototype-revision/installed.mjs','verification/revision.mjs');
    writeJSON(path.join(kit,'verification/revision-observations.json'),readRevisionFixture('observations'));
    copy('baseline/prototype-revision/acceptance.json','verification/revision-acceptance.json');
    const itemAccepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/prototype-revision/items-acceptance.json')));
    assert.equal(itemAccepted.sourceCommit,profile.lock.commit);assert.equal(sha256(fs.readFileSync(path.join(root,'baseline/prototype-revision/items.json.gz'))),itemAccepted.compressedSha256);
    copy('baseline/prototype-revision/items.json.gz','verification/revision-items.json.gz');
  }
  copy('test/combat-session/consumer.mjs','verification/combat.mjs');copy('test/node-godot/consumer.mjs','verification/adapter.mjs');
  for(const file of ['characters.mjs','lifecycles.mjs','locomotion.mjs'])copy('test/combat-session/'+file,'verification/'+file);
  await build({absWorkingDir:root,entryPoints:['test/combat-empty-space.mjs'],bundle:true,platform:'neutral',format:'esm',target:'es2022',outfile:path.join(kit,'verification/space.mjs')});
  const fixtures={};for(const name of profile?['combat','interactions','layers-v2','summons-v5','rules-v2','terminal','corpse-rites','relocation','host','character-v2']:['combat-frames','combat-families','combat-lifecycles','combat-proc-families','combat-interactions','combat-locomotion','combat-locomotion-airborne','character-session']){
    const file=profile?'baseline/prototype-parity/'+name+'.json.gz':'baseline/'+name+'/observations.json.gz',acceptance=JSON.parse(fs.readFileSync(profile?path.join(root,'baseline/prototype-parity',name+'-acceptance.json'):path.join(root,'baseline',name,'acceptance.json')));
    assert.equal(sha256(fs.readFileSync(path.join(root,file))),acceptance.compressedSha256);
    copy(file,'verification/'+name+'.json.gz');fixtures[name]=acceptance.compressedSha256;
  }
  run(process.execPath,['scripts/build-combat-benchmark.mjs','--distribution',kit,'--out',path.join(kit,'performance')]);
  const performance=JSON.parse(fs.readFileSync(path.join(kit,'performance/manifest.json'))),measurements=JSON.parse(fs.readFileSync(path.join(kit,'evidence/measurements.json')));
  const measuredHash=profile?measurements.measuredWorkloadSha256:measurements.qualifiedWorkloadSha256;
  assert(measurements.passed);assert.equal(performance.files['workload.mjs'].sha256,measuredHash,'Changed executable requires new measurements');
  if(profile){
    assert.equal(measurements.prototypeSourceCommit,profile.lock.commit);
    assert.equal(measurements.kind,'desktop-parity-baseline');
    assert.equal(sha256(fs.readFileSync(path.join(kit,'evidence/measurements.json.gz'))),measurements.raw.sha256);
  }
  pkg.name='hollow-wake-combat-inventory-release';pkg.version=config.version;pkg.engines={node:'>=22'};
  pkg.scripts={start:'node host/serve.mjs',example:'node quickstart.mjs',verify:'node verify.mjs'};writeJSON(path.join(kit,'package.json'),pkg);
  const scope=readScope(),optional=new Set(scope.extensionRoots);
  for(const row of Object.values(scope.exports))if(row.classification==='optional-extension'&&row.module.endsWith('.js'))optional.add(path.basename(row.module,'.js'));
  const manifest={schemaVersion:1,capability:'combat-inventory-release/v1',version:config.version,tag:config.tag,sourceCommit:git(root,['rev-parse','HEAD']).trim(),sourceDirty:git(root,['status','--porcelain']).trim().length>0,
    packages:config.packages,archives:distribution.archives,baseline:scope.baseline,requiredCapabilities:scope.capabilities.map(c=>c.id),
    optionalModuleRoots:[...optional].sort(),questAccountPersistenceRequired:false,physicalDeviceQualified:false,
    ...(profile?{prototypeSource:{commit:profile.lock.commit,sourceLockSha256:sha256(profile.lockBytes)},performanceQualification:'desktop baseline; no device or optimization qualification'}:{}),
    ...(revision?{inventoryRevision:profile.lock.commit,mechanicsBaseline:profile.previous.lock.commit}:{}),
    measuredWorkloadSha256:measuredHash,portableWorkloadSha256:performance.files['workload.mjs'].sha256,originalFixtures:fixtures,
    files:Object.fromEntries(listFiles(kit).map(file=>[file,sha256(fs.readFileSync(path.join(kit,file)))]))};
  assert.equal(manifest.requiredCapabilities.length,27);writeJSON(path.join(kit,'sdk-release.json'),manifest);
  fs.mkdirSync(out,{recursive:true});created=true;const name='hollow-wake-combat-inventory-'+config.version+'.zip',archive=path.join(out,name);
  run(options['--python']??'python',['scripts/combat-inventory-archive.py','pack',kit,archive]);
  // The second pack proves stable ordering, permissions and timestamps on this toolchain.
  const repeated=path.join(work,'repeated.zip');run(options['--python']??'python',['scripts/combat-inventory-archive.py','pack',kit,repeated]);
  assert.equal(sha256(fs.readFileSync(archive)),sha256(fs.readFileSync(repeated)),'Release archive is not reproducible');
  writeJSON(path.join(out,'sdk-release.json'),manifest);
  fs.writeFileSync(path.join(out,'SHA256SUMS'),[name,'sdk-release.json'].map(file=>sha256(fs.readFileSync(path.join(out,file)))+'  '+file).join('\n')+'\n');
  complete=true;console.log(JSON.stringify({passed:true,version:config.version,sourceCommit:manifest.sourceCommit,archive:name,sha256:sha256(fs.readFileSync(archive)),bytes:fs.statSync(archive).size,reproducible:true}));
  });
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  if(created&&!complete){assert.equal(fs.realpathSync(out),out);assert(!fs.existsSync(path.join(out,'.git')));fs.rmSync(out,{recursive:true,force:true,maxRetries:5});}
}
