import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,materialize,verifyReference,sha256} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';import {renderEquipmentSkillProbe} from './equipment-skill-reference.mjs';
import {integrateEquipmentSkills,renderEquipmentSkills} from '../adapters/hollow-wake/integrate-equipment-skills.mjs';

assert.equal(process.argv.length,2);
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'equipment-skills-installed-owned-'));
const game=path.join(work,'game'),logs={},report={passed:false,results:{},faults:[]};
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'baseline/equipment-skills/acceptance.json')));
report.sources=Object.fromEntries(['src/equipment-skills.ts','adapters/hollow-wake/integrate-equipment-skills.mjs',
  'reference/equipment-skill-observer.ts','scripts/equipment-skill-reference.mjs',
  'scripts/test-equipment-skills-original.mjs','baseline/equipment-skills/acceptance.json','package.json']
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
  success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
  const packed=JSON.parse(logs.pack)[0],archive=path.join(work,packed.filename);report.archiveSha256=sha256(fs.readFileSync(archive));
  materialize(undefined,lock,game);verifyReference(game,lock);
  const modules=path.join(game,'node_modules');fs.mkdirSync(modules);
  // Reuse tooling without copying dependencies or modifying their directories.
  const deps=fs.realpathSync(path.join(root,'.reference/node_modules'));
  for(const entry of fs.readdirSync(deps,{withFileTypes:true})){
    if(entry.name==='.bin'||entry.name==='@hollow-wake'||!entry.isDirectory()&&!entry.isSymbolicLink())continue;
    fs.symlinkSync(path.join(deps,entry.name),path.join(modules,entry.name),process.platform==='win32'?'junction':'dir');
  }
  const installed=path.join(modules,'@hollow-wake/engine');fs.mkdirSync(installed,{recursive:true});
  execFileSync('tar',['-xf',archive,'-C',installed,'--strip-components=1'],{windowsHide:true});
  const module=path.join(installed,'dist/equipment-skills.js'),original=fs.readFileSync(module,'utf8');
  assert.equal(original,fs.readFileSync(path.join(root,'dist/equipment-skills.js'),'utf8'));report.runtimeSha256=sha256(original);
  report.adapter=integrateEquipmentSkills(game);
  for(const config of ['tsconfig.json','tsconfig.launcher.json','tsconfig.sim.json'])success('types-'+config,[path.join(deps,'typescript/bin/tsc'),'--noEmit','-p',config]);
  report.types=true;
  const helper=path.join(game,'balance/hwe-equipment-helper.ts');fs.copyFileSync(path.join(root,manifest.helper),helper);
  assert.equal(sha256(fs.readFileSync(helper)),manifest.helperSha256);
  const expected={};
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
  ];
  for(const [name,probe,needle,replacement] of faults){
    assert.equal(original.split(needle).length,2,name+' target must be unique');
    fs.writeFileSync(module,original.replace(needle,replacement));
    try{
      const result=path.join(work,name+'.json');
      const child=run(name,['--import','tsx',path.join(game,'balance/hwe-equipment-'+probe+'.ts'),result]);
      const observed=child.status===0&&fs.existsSync(result);
      assert(observed||child.status===1&&/ERR_ASSERTION/.test(logs[name]),name+' failed outside a behavior assertion');
      if(observed)assert(!fs.readFileSync(result).equals(expected[probe]),name+' escaped');
      report.faults.push({name,probe,detected:true,kind:observed?'observation-difference':'original-assertion',logSha256:sha256(logs[name])});
    }finally{fs.writeFileSync(module,original);}
  }
  for(const probe of ['legends','slotgraft']){
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
    try{fs.writeFileSync(path.join(owned,'equipment-skills-installed.logs.json.gz'),gzipSync(JSON.stringify(logs),{level:9}));}
    finally{
      assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));
      fs.rmSync(work,{recursive:true,force:true});report.cleaned=!fs.existsSync(work);
      fs.writeFileSync(path.join(owned,'equipment-skills-installed.json'),JSON.stringify(report,null,2)+'\n');
    }
  }
}
console.log(report);
