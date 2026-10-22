import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';

const artifacts=path.join(root,'.artifacts');
const location=JSON.parse(fs.readFileSync(path.join(artifacts,'adapter-location.json')));
const installed=path.join(location.tooling,'node_modules/@hollow-wake/engine');
assert.equal(fs.realpathSync(path.join(location.game,'node_modules/@hollow-wake/engine')),fs.realpathSync(installed));
for(const name of ['m30-adapter-location.json','m31-adapter-location.json','m32-adapter-location.json','m33-adapter-location.json','m34-adapter-location.json','m35-initial-candidate/m35-adapter-location.json']) {
  const file=path.join(artifacts,name); if(!fs.existsSync(file)) continue;
  const retained=JSON.parse(fs.readFileSync(file));
  assert.notEqual(fs.realpathSync(path.join(retained.tooling,'node_modules/@hollow-wake/engine')),fs.realpathSync(installed),'Refusing to mutate a retained control');
}
const built=path.join(root,'dist'),files=listFiles(built);
const world=path.join(location.game,'src/engine/world.ts'),worldBytes=fs.readFileSync(world);
assert(worldBytes.includes('this.sdkCastingContinuation.advance(a, dt);'),'Continuation disconnected');
function verifyInstalled() {
  assert.deepEqual(listFiles(path.join(installed,'dist')),files);
  for(const file of files) assert(fs.readFileSync(path.join(installed,'dist',file)).equals(fs.readFileSync(path.join(built,file))),'Stale or unrestored dispatch runtime: '+file);
  assert(fs.readFileSync(world).equals(worldBytes),'Host source was not restored');
}
verifyInstalled();
const baseline=path.join(root,'baseline/milestone-thirty-five');
const acceptance=JSON.parse(fs.readFileSync(path.join(baseline,'acceptance.json')));
const output=fs.mkdtempSync(path.join(artifacts,'game-casting-continuation-'));
const row=acceptance.fixtures[0],source=fs.readFileSync(path.join(root,'reference/export-casting-continuation.ts'));
const compressed=fs.readFileSync(path.join(baseline,'casting-continuation.json.gz')),expected=gunzipSync(compressed);
assert.equal(sha256(source),row.helperSha256);assert.equal(sha256(compressed),row.compressedSha256);assert.equal(sha256(expected),row.fixtureSha256);
const helper=path.join(location.game,'balance/sdk-continuation-'+randomUUID()+'.ts');
function capture(label) {
  const file=path.join(output,label+'.json');
  const stdout=execFileSync(process.execPath,['--import','tsx',helper,file],{cwd:location.game,encoding:'utf8',maxBuffer:16*1024*1024});
  fs.writeFileSync(path.join(output,label+'.txt'),stdout);
  const actual=fs.readFileSync(file);
  assert(actual.equals(expected),'Casting continuation observations changed; raw byte comparison failed');
  return {name:label,sha256:sha256(actual),rawByteEqual:true};
}
const faults=[
  ['continuation-guard-lowering-lost','p.lowerGuard(actor, cs.inst);','void 0;'],
  ['continuation-clinger-replaces-aim','p.assignAim(cs.aim, ridden.pos);','cs.aim = p.copyAim(ridden.pos);'],
  ['continuation-secondary-seat-hold-skipped','&& !p.primary(actor)','&& !p.seated(actor)'],
  ['continuation-charge-cap-lost','Math.min(cs.aiHold, cs.total)','cs.aiHold'],
  ['continuation-los-boundary-delayed','cs.losLost >= this.channelGrace','cs.losLost > this.channelGrace'],
  ['continuation-ai-click-disconnected','p.click(actor);','void 0;'],
  ['continuation-focus-recovery-retained','cs.aiRecovery = undefined;','void 0;'],
  ['continuation-vessel-repeats','vessel.construct.holdOnce = true;','vessel.construct.holdOnce = false;'],
  ['continuation-click-activity-lost','p.acted(actor);','void 0;'],
  ['continuation-flawless-trigger-lost','p.flawless(actor, p.copyAim(cs.aim), cs.inst);','void 0;'],
  ['continuation-native-update-disconnected','this.sdkCastingContinuation.advance(a, dt);','void 0;',true],
  ['continuation-native-click-disconnected','this.sdkCastingContinuation.press(caster);','void 0;',true],

];
const reports=[],observations=[];
try {
  fs.writeFileSync(helper,source,{flag:'wx'});
  for(const config of ['tsconfig.json','tsconfig.launcher.json','tsconfig.sim.json']) {
    fs.writeFileSync(path.join(output,config+'.txt'),execFileSync(process.execPath,
      [path.join(location.game,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:location.game,encoding:'utf8'}));
  }
  observations.push(capture('candidate'));
  if(!process.argv.includes('--skip-faults')) for(const [name,before,after,native] of faults) {
    const target=native?world:path.join(installed,'dist/casting-continuation.js'),original=fs.readFileSync(target),text=original.toString();
    assert.equal(text.split(before).length,2,'Fault site moved: '+name);
    let detected=false;
    try {
      fs.writeFileSync(target,text.replace(before,after));
      try { capture('fault-'+name); }
      catch(error) {
        const detail=String(error.stdout??'')+String(error.stderr??'');
        assert(error.code==='ERR_ASSERTION'||error.status!==undefined&&/AssertionError/.test(detail)
          && !/SyntaxError|ERR_MODULE_NOT_FOUND|TypeError/.test(detail),'Fault did not reach behavior: '+detail);
        fs.writeFileSync(path.join(output,name+'-detected.txt'),String(error)+'\n'+detail); detected=true;
      }
    } finally {fs.writeFileSync(target,original);}
    assert(detected,'Undetected installed fault: '+name);reports.push({name,detected});console.log('Detected installed fault: '+name);
  }
} finally {
  if(fs.existsSync(helper)&&fs.readFileSync(helper).equals(source)) fs.unlinkSync(helper);
  verifyInstalled();
}
writeJSON(path.join(artifacts,'game-casting-continuation-verification.json'),{
  game:location.game,output,version:JSON.parse(fs.readFileSync(path.join(installed,'package.json'))).version,
  packageIntegrity:location.integrity,installedRuntimeFilesMatchBuild:files.length,
  gameLauncherAndCaptureTypeChecks:true,fixtures:acceptance.fixtures,observations,
  installedFaults:reports,allInstalledFilesAndHostRestored:true,
});
console.log('Installed casting continuation matches 60 original courses and 269 transitions without projection.');
