import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,listFiles,sha256,writeJSON,materialize,verifyReference,git} from './reference-utils.mjs';

const args=process.argv.slice(2);
assert(args.length===0 || (args.length===1 && args[0]==='--prepare-only'));
const prepareOnly=args.length===1, read=f=>JSON.parse(fs.readFileSync(f));
const planFile=path.join(root,'baseline/milestone-forty-three/linux-diagnosis-plan.json');
const planBytes=fs.readFileSync(planFile),plan=JSON.parse(planBytes);
assert.equal(plan.decision,'restoration-linux-measurement-diagnosis/v1');
assert.equal(plan.status,'diagnostic-only-frozen-before-collection');
assert.equal(process.version,plan.node);
if(!prepareOnly) assert.equal(process.platform,'linux','Measurement mode requires the planned Linux environment');
assert(!process.env.NODE_OPTIONS && !process.env.NODE_V8_COVERAGE);
assert(process.env.npm_execpath && fs.existsSync(process.env.npm_execpath),
  'Run through npm run diagnose:restoration so child installs use the active npm');
const artifacts=path.join(root,'.artifacts'),receipt=path.join(artifacts,'restoration-diagnosis-ci.json');
assert(!fs.existsSync(receipt),'Preserve the existing run and use a fresh checkout');
assert(!fs.existsSync(path.join(artifacts,'adapter-location.json')),'Preserve existing adapter work and use a fresh checkout');
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(f=>[f,sha256(fs.readFileSync(path.join(dir,f)))]));
const runtime=snapshot(path.join(root,'dist'));
assert.equal(Object.keys(runtime).length,plan.runtimeOutputs);
assert.equal(sha256(JSON.stringify(runtime)),plan.runtimeMapSha256);
const lock=read(path.join(root,'baseline/source-lock.json'));
const verify=()=>{
  assert(fs.readFileSync(planFile).equals(planBytes));
  for(const [file,hash] of Object.entries(plan.pinnedFiles)) assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
  assert.deepEqual(snapshot(path.join(root,'dist')),runtime);
  verifyReference(path.join(root,'.reference'),lock);
};
verify();
fs.mkdirSync(artifacts,{recursive:true});
const directory=fs.mkdtempSync(path.join(artifacts,'restoration-diagnosis-ci-'));
const locations={},state={status:'preparing',directory,prepareOnly,planSha256:sha256(planBytes)};
writeJSON(receipt,state);
const environment={node:process.version,versions:process.versions,platform:process.platform,arch:process.arch,
  osRelease:os.release(),osVersion:os.version(),cpus:os.cpus().map(({model,speed})=>({model,speed})),
  totalMemoryBytes:os.totalmem(),execArgv:process.execArgv,runnerImage:process.env.ImageOS??null,
  runnerImageVersion:process.env.ImageVersion??null,runnerOs:process.env.RUNNER_OS??null,
  runnerArch:process.env.RUNNER_ARCH??null,commit:process.env.GITHUB_SHA??null};
if(environment.commit) assert.equal(git(root,['rev-parse','HEAD']).trim(),environment.commit);
writeJSON(path.join(directory,'environment.json'),environment);
const run=(label,script,argv=[])=>{
  state.phase=label;writeJSON(receipt,state);console.log(label);
  const fd=fs.openSync(path.join(directory,label+'.txt'),'wx');
  try { execFileSync(process.execPath,[path.join(root,'scripts',script),...argv],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]}); }
  finally { fs.closeSync(fd);verify(); }
};
let passed=false;
try {
  let firstPackage;
  for(const name of ['A','B']) {
    const game=path.join(directory,name,'game');
    materialize(null,lock,game);verifyReference(game,lock);
    run('prepare-'+name,'prepare-game-adapter.mjs',['--game',game]);
    const location=read(path.join(artifacts,'adapter-location.json'));
    assert.equal(location.game,game);
    const source=snapshot(path.join(game,'src'));
    assert.equal(Object.keys(source).length,plan.gameSourceFiles);
    assert.equal(sha256(JSON.stringify(source)),plan.gameSourceMapSha256);
    const installed=path.join(game,'node_modules/@hollow-wake/engine');
    assert.deepEqual(snapshot(path.join(installed,'dist')),runtime);
    const packageFiles=snapshot(installed);
    if(firstPackage) assert.deepEqual(packageFiles,firstPackage);
    else firstPackage=packageFiles;
    locations[name]=path.join(directory,name+'.json');writeJSON(locations[name],location);
  }
  writeJSON(path.join(directory,'preparation.json'),{passed:true,locations,runtimeMapSha256:plan.runtimeMapSha256,
    gameSourceMapSha256:plan.gameSourceMapSha256,identicalPackages:true,prepareOnly});
  if(!prepareOnly) {
    const calibration=path.join(directory,'calibration.json');
    run('calibration','calibrate-restoration-cpu.mjs',[calibration]);
    run('diagnosis','diagnose-restoration-timing.mjs',['--a',locations.A,'--b',locations.B,'--calibration',calibration]);
    const result=read(path.join(artifacts,'restoration-timing-diagnosis-location.json'));
    const summary=read(path.join(result.directory,'summary.json'));
    assert(summary.passed && summary.acceptedOutcomesMatched && summary.inputsUnchanged);
    assert.equal(summary.measuredSamples,1200);assert.equal(summary.runs.length,8);
    state.diagnosis=result;
  }
  passed=true;
} finally {
  state.status=passed?'completed':'failed';state.protocolPassed=passed;state.optimizationAccepted=false;
  writeJSON(receipt,state);console.log({directory,passed,prepareOnly});
}
