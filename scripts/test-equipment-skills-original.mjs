import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,materialize,verifyReference,sha256,listFiles} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';import {renderEquipmentSkillProbe} from './equipment-skill-reference.mjs';
import {integrateEquipmentSkills,renderEquipmentSkills} from '../adapters/hollow-wake/integrate-equipment-skills.mjs';

const composed=process.argv[2]==='--composed';assert.equal(process.argv.length,composed?3:2);
const label=composed?'composed':'installed';
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'equipment-skills-'+label+'-owned-'));
const game=path.join(work,'game'),logs={},report={passed:false,composition:composed?'complete-prepared-game':'original-game',results:{},faults:[]};
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'baseline/equipment-skills/acceptance.json')));
report.sources=Object.fromEntries(['src/equipment-skills.ts','adapters/hollow-wake/integrate-equipment-skills.mjs',
  'reference/equipment-skill-observer.ts','scripts/equipment-skill-reference.mjs',
  'scripts/test-equipment-skills-original.mjs','scripts/prepare-game-adapter.mjs',
  'adapters/hollow-wake/integrate-passive-grants.mjs','adapters/hollow-wake/passiveGrantAdapter.ts',
  'reference/export-equipment-passive-grafts.ts','baseline/equipment-passive-grafts/acceptance.json',
  'reference/export-equipment-lookup.ts','scripts/reference-equipment-lookup.mjs','baseline/equipment-lookup/acceptance.json',
  'baseline/equipment-skills/acceptance.json','package.json']
  .map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))]));
const run=(label,args,cwd=game)=>{
  const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:16*1024*1024,
    env:{...process.env,TEMP:work,TMP:work,TMPDIR:work}});
  logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');
  assert(!child.error&&!child.signal,label+': '+child.error);
  return child;
};
const success=(label,args,cwd)=>{const child=run(label,args,cwd);assert.equal(child.status,0,logs[label].slice(-5000));return child;};
try{
  verifyReference(path.join(root,'.reference'),lock);
  assert.equal(sha256(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),manifest.sourceLockSha256);
  assert.equal(sha256(fs.readFileSync(path.join(root,'scripts/equipment-skill-reference.mjs'))),manifest.rendererSha256);
  const source=fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8').replaceAll('\r\n','\n');
  for(const nl of ['\n','\r\n']){
    const raw=source.replaceAll('\n',nl),marker=nl+'// unrelated host extension'+nl,out=renderEquipmentSkills(raw+marker,raw);
    assert(out.endsWith(marker));assert.equal(out.includes('\r\n'),nl==='\r\n');
    assert.throws(()=>renderEquipmentSkills(out,raw),/already present/);
    assert.throws(()=>renderEquipmentSkills(raw.replace('const grantStats = new Set<string>();','const grantStats = new Set<string>(); /* edited */'),raw),/Unreviewed/);
  }
  materialize(undefined,lock,game);verifyReference(game,lock);
  const deps=fs.realpathSync(path.join(root,'.reference/node_modules'));
  let installed;
  if(composed){
    const location=path.join(work,'location.json');
    success('prepare',[path.join(root,'scripts/prepare-game-adapter.mjs'),'--game',game,'--location-out',location,'--reuse-tools',deps,'--scratch-root',work],root);
    const loc=JSON.parse(fs.readFileSync(location));assert.equal(loc.game,game);
    assert(loc.equipmentSkillsDecision);assert.equal(loc.equipmentSkillsPassiveSource,'compiled');
    for(const key of ['skillRackDecision','conduitsDecision','vestigeDecision','gemResidenceDecision','craftingDecision','statContextDecision'])assert(loc[key],key);
    installed=path.join(game,'node_modules/@hollow-wake/engine');
    report.archiveSha256=sha256(fs.readFileSync(loc.archive));
    report.adapter={files:[...new Set(loc.files)].sort(),decision:loc.equipmentSkillsDecision,passiveGrafts:loc.equipmentSkillsPassiveSource};
    assert(fs.readFileSync(path.join(game,'src/engine/world.ts'),'utf8').includes('passiveGrafts:()=>passiveBuild.grafts,'));
  }else{
    success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
    const packed=JSON.parse(logs.pack)[0],archive=path.join(work,packed.filename);report.archiveSha256=sha256(fs.readFileSync(archive));
    const modules=path.join(game,'node_modules');fs.mkdirSync(modules);
    // Reuse tooling without copying dependencies or modifying their directories.
    for(const entry of fs.readdirSync(deps,{withFileTypes:true})){
      if(entry.name==='.bin'||entry.name==='@hollow-wake'||!entry.isDirectory()&&!entry.isSymbolicLink())continue;
      fs.symlinkSync(path.join(deps,entry.name),path.join(modules,entry.name),process.platform==='win32'?'junction':'dir');
    }
    installed=path.join(modules,'@hollow-wake/engine');fs.mkdirSync(installed,{recursive:true});
    execFileSync('tar',['-xf',archive,'-C',installed,'--strip-components=1'],{windowsHide:true});
    report.adapter=integrateEquipmentSkills(game);
  }
  for(const file of listFiles(path.join(root,'dist')))assert(fs.readFileSync(path.join(installed,'dist',file)).equals(fs.readFileSync(path.join(root,'dist',file))),file+' installed bytes differ');
  const module=path.join(installed,'dist/equipment-skills.js'),original=fs.readFileSync(module,'utf8');
  assert.equal(original,fs.readFileSync(path.join(root,'dist/equipment-skills.js'),'utf8'));report.runtimeSha256=sha256(original);
  const lookupManifest=JSON.parse(fs.readFileSync(path.join(root,'baseline/equipment-lookup/acceptance.json')));
  assert.equal(lookupManifest.sourceLockSha256,manifest.sourceLockSha256);
  const lookupProbe=path.join(game,'balance/hwe-equipment-lookup.ts');fs.copyFileSync(path.join(root,lookupManifest.source),lookupProbe);
  assert.equal(sha256(fs.readFileSync(lookupProbe)),lookupManifest.sourceSha256);
  for(const config of ['tsconfig.json','tsconfig.launcher.json','tsconfig.sim.json'])success('types-'+config,[path.join(deps,'typescript/bin/tsc'),'--noEmit','-p',config]);
  report.types=true;
  const helper=path.join(game,'balance/hwe-equipment-helper.ts');fs.copyFileSync(path.join(root,manifest.helper),helper);
  assert.equal(sha256(fs.readFileSync(helper)),manifest.helperSha256);
  const graftManifest=JSON.parse(fs.readFileSync(path.join(root,'baseline/equipment-passive-grafts/acceptance.json')));
  const graftSource=fs.readFileSync(path.join(root,graftManifest.source),'utf8');assert.equal(sha256(graftSource),graftManifest.sourceSha256);
  assert.equal(graftManifest.helperSha256,manifest.helperSha256);assert.equal(graftManifest.sourceLockSha256,manifest.sourceLockSha256);
  assert.equal(graftSource.split('__EQUIPMENT_OBSERVER__').length,2);
  const graftProbe=path.join(game,'balance/hwe-equipment-passive-grafts.ts');
  fs.writeFileSync(graftProbe,graftSource.replace('__EQUIPMENT_OBSERVER__','./hwe-equipment-helper.ts'));
  const graftExpected=gunzipSync(fs.readFileSync(path.join(root,'baseline/equipment-passive-grafts/observations.json.gz')));
  assert.equal(sha256(graftExpected),graftManifest.sha256);
  const graftOutput=path.join(work,'passive-graft-lifecycle.json');
  success('passive-graft-lifecycle',['--import','tsx',graftProbe,graftOutput,...(composed?['--sdk']:[])]);
  assert(fs.readFileSync(graftOutput).equals(graftExpected),'Actual passive graft lifecycle differs from original');
  report.results.passiveGrafts={cases:graftManifest.cases,sha256:graftManifest.sha256};
  if(composed){
    const results={};
    for(const name of ['passive-grants','passive-grant-refresh']){
      const file=path.join(game,'balance','hwe-'+name+'.ts');fs.copyFileSync(path.join(root,'reference/export-'+name+'.ts'),file);
      const output=path.join(work,name);success(name,['--import','tsx',file,output,...(name.endsWith('refresh')?['--sdk']:[])]);
      const expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-nine',name+'.json.gz')));
      assert(fs.readFileSync(path.join(output,name+'.json')).equals(expected),name+' differs after composition');
      results[name]={rows:JSON.parse(expected).rows.length,sha256:sha256(expected)};
    }
    report.results.passives=results;
    // A wrong handoff must fail the original graft observations even when the
    // rest of the passive and equipment runtimes remain intact.
    const world=path.join(game,'src/engine/world.ts'),source=fs.readFileSync(world,'utf8'),needle='passiveGrafts:()=>passiveBuild.grafts,';
    assert.equal(source.split(needle).length,2);fs.writeFileSync(world,source.replace(needle,'passiveGrafts:()=>[],'));
    try{
      const output=path.join(work,'missing-passive-grafts.json');
      const child=run('missing-passive-grafts',['--import','tsx',graftProbe,output,'--sdk']);
      const sensitive=JSON.parse(graftExpected).rows.filter(row=>JSON.parse(row.detail).expected.some(lane=>lane.length)).length;
      assert(sensitive>0);assert.equal(child.status,1);assert(logs['missing-passive-grafts'].includes('ERR_ASSERTION'));
      assert(logs['missing-passive-grafts'].includes(sensitive+' !== 0'),'Handoff fault did not reach the expected live-graft checks');
      report.compiledHandoffFaultDetected=true;
      report.compiledHandoffFault={failingCheckpoints:sensitive,logSha256:sha256(logs['missing-passive-grafts'])};
    }finally{fs.writeFileSync(world,source);}
    const restored=path.join(work,'restored-passive-grafts.json');
    success('restored-passive-grafts',['--import','tsx',graftProbe,restored,'--sdk']);
    assert(fs.readFileSync(restored).equals(graftExpected),'Restored compiled graft handoff differs from original');
    report.compiledHandoffRestored=true;
    success('simulation-smoke',['--import','tsx','balance/cli.ts','run','--suite','smoke']);report.simulationSmoke=true;
  }
  const expected={lookup:gunzipSync(fs.readFileSync(path.join(root,'baseline/equipment-lookup/observations.json.gz')))};
  assert.equal(sha256(expected.lookup),lookupManifest.sha256);
  const lookupOutput=path.join(work,'lookup.json');success('lookup',['--import','tsx',lookupProbe,lookupOutput]);
  assert(fs.readFileSync(lookupOutput).equals(expected.lookup),'Cold lookup and character resume differ from original');
  report.results.lookup={cases:lookupManifest.cases,sha256:lookupManifest.sha256};
  for(const name of ['legends','slotgraft']){
    const probe=path.join(game,'balance/hwe-equipment-'+name+'.ts');
    fs.writeFileSync(probe,renderEquipmentSkillProbe(fs.readFileSync(path.join(game,manifest.results[name].source),'utf8'),'./hwe-equipment-helper.ts'));
    expected[name]=gunzipSync(fs.readFileSync(path.join(root,'baseline/equipment-skills',name+'.json.gz')));
    assert.equal(sha256(expected[name]),manifest.results[name].sha256);
    const output=path.join(work,name+'.json');success(name,['--import','tsx',probe,output]);
    assert(fs.readFileSync(output).equals(expected[name]),name+' differs from original observed state');
    report.results[name]={cases:manifest.results[name].cases,sha256:sha256(expected[name])};console.log({name,passed:true});
  }
  const catalogue=path.join(game,'balance/hwe-equipment-catalogue.ts');fs.copyFileSync(path.join(root,'reference/export-equipment-catalogue.ts'),catalogue);
  const catalogueManifest=JSON.parse(fs.readFileSync(path.join(root,'baseline/equipment-catalogue/acceptance.json')));
  assert.equal(sha256(fs.readFileSync(catalogue)),catalogueManifest.sourceSha256);
  const output=path.join(work,'catalogue.json');success('catalogue',['--import','tsx',catalogue,output]);
  const frozen=gunzipSync(fs.readFileSync(path.join(root,'baseline/equipment-catalogue/observations.json.gz')));
  assert.equal(sha256(frozen),catalogueManifest.sha256);
  assert(fs.readFileSync(output).equals(frozen),'Installed equipment catalogue differs from original');
  report.results.catalogue={cases:JSON.parse(frozen).rows.length,sha256:sha256(frozen)};
  const faults=[
    ['forget-grant-investment','legends','r.packGrant(inst)','({...r.packGrant(inst), sockets: []})'],
    ['compound-bonus-levels','legends','inst.bonusLevels = bonus;','inst.bonusLevels = (inst.bonusLevels ?? 0) + bonus;'],
    ['retain-derived-grafts','slotgraft','inst.grafts = undefined;','void inst.grafts;'],
    ['skip-support-fixed-point','slotgraft','for (let flipped = true; flipped;)','for (let flipped = false; flipped;)'],
    ['retain-retired-bar-instance','legends','p.skills[i] = null;','void p.skills[i];'],
    ['ignore-learned-lookup-priority','lookup','if (known)\n            return known;','if (false)\n            return known;','learned ownership wins without replacing the granted copy'],
    ['omit-cold-investment','lookup','if (state)\n            r.restoreGrant(inst, state);','if (false)\n            r.restoreGrant(inst, state);','cold lookup restores bounded item investment'],
    ['omit-cold-cache','lookup','(seat.grantedInsts ??= new Map()).set(skillId, inst);','void inst;','cold lookup leaves other grants and the bar untouched'],
    ['replace-grant-sum-with-last-line','lookup','level += gm.value;','level = gm.value;','cold lookup sums worn grants and takes the first host'],
    ['replace-first-grant-host','lookup','host ??= worn;','host = worn;','cold lookup sums worn grants and takes the first host'],
  ];
  for(const [name,probe,needle,replacement,checkpoint] of faults){
    assert.equal(original.split(needle).length,2,name+' target must be unique');
    fs.writeFileSync(module,original.replace(needle,replacement));
    try{
      const result=path.join(work,name+'.json');
      const child=run(name,['--import','tsx',path.join(game,'balance/hwe-equipment-'+probe+'.ts'),result]);
      const observed=child.status===0&&fs.existsSync(result);
      assert(observed||child.status===1&&/ERR_ASSERTION/.test(logs[name]),name+' failed outside a behavior assertion');
      if(checkpoint){assert.equal(child.status,1);assert(logs[name].includes(checkpoint),name+' missed its expected checkpoint');}
      if(observed)assert(!fs.readFileSync(result).equals(expected[probe]),name+' escaped');
      report.faults.push({name,probe,detected:true,kind:observed?'observation-difference':'original-assertion',checkpoint,logSha256:sha256(logs[name])});
    }finally{fs.writeFileSync(module,original);}
  }
  for(const probe of ['legends','slotgraft','lookup']){
    const output=path.join(work,'restored-'+probe+'.json');
    success('restored-'+probe,['--import','tsx',path.join(game,'balance/hwe-equipment-'+probe+'.ts'),output]);
    assert(fs.readFileSync(output).equals(expected[probe]));
  }
  report.restored=true;
  report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
  try{
    verifyReference(path.join(root,'.reference'),lock);
    for(const[file,hash]of Object.entries(report.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file+' changed during qualification');
    report.inputsUnchanged=true;
  }finally{
    try{fs.writeFileSync(path.join(owned,'equipment-skills-'+label+'.logs.json.gz'),gzipSync(JSON.stringify(logs),{level:9}));}
    finally{
      assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));
      fs.rmSync(work,{recursive:true,force:true});report.cleaned=!fs.existsSync(work);
      fs.writeFileSync(path.join(owned,'equipment-skills-'+label+'.json'),JSON.stringify(report,null,2)+'\n');
    }
  }
}
console.log(report);
