import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';
import {hitAftermathDecision} from '../adapters/hollow-wake/integrate-hit-aftermath.mjs';
import {assertHitAftermathObservations} from './hit-aftermath-observation-checks.mjs';
const args=process.argv.slice(2);assert((args.length===2||args.length===3&&args[2]==='--only-world-forwarding')&&args[0]==='--location');
const forwardingOnly=args.length===3;
const location=JSON.parse(fs.readFileSync(path.resolve(root,args[1]))),game=fs.realpathSync(location.game);
assert(game.startsWith(path.join(root,'.artifacts')+path.sep),'Fault tests require a disposable adapter');assert.equal(location.hitAftermathDecision,hitAftermathDecision);
const installed=fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine'));assert(installed.startsWith(path.join(root,'.artifacts')+path.sep));
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))]));
assert.deepEqual(snapshot(path.join(installed,'dist')),snapshot(path.join(root,'dist')));
const before=snapshot(path.join(game,'src')),pkg=snapshot(installed),files={runtime:path.join(installed,'dist/hit-aftermath.js'),binding:path.join(game,'src/engine/hitAftermath.ts'),world:path.join(game,'src/engine/world.ts')};
const originals=Object.fromEntries(Object.entries(files).map(([k,f])=>[k,fs.readFileSync(f)]));
const acceptanceFile=path.join(root,'baseline/hit-aftermath/acceptance.json'),acceptanceBytes=fs.readFileSync(acceptanceFile),accepted=JSON.parse(acceptanceBytes);
const sealed=new Map([[acceptanceFile,sha256(acceptanceBytes)]]);
for(const [f,h]of [[accepted.helper,accepted.helperSha256],[accepted.positiveAssertions,accepted.positiveAssertionsSha256],[accepted.observations,accepted.compressedSha256],[accepted.sourceBoundary,accepted.sourceBoundarySha256]]){const file=path.join(root,f);assert.equal(sha256(fs.readFileSync(file)),h);sealed.set(file,h);}
const expected=gunzipSync(fs.readFileSync(path.join(root,accepted.observations)));assert.equal(sha256(expected),accepted.observationsSha256);
const helper=fs.readFileSync(path.join(root,accepted.helper),'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/game-hit-aftermath-faults-')),runtime=path.join(directory,'capture.ts');
fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)),{flag:'wx'});
const faults=[
 ['volatile-zero-scale','runtime','target.volatile.dmgMult ?? 1','target.volatile.dmgMult || 1'],
 ['contagion-shared-history','runtime','chain?.seen ?? new Set()','new Set(chain?.seen)'],
 ['spread-tie','runtime','dd <= bd','dd < bd'],
 ['curse-live-map','runtime','of caster.hexToggles.values()','of [...caster.hexToggles.values()]'],
 ['sharing-ceiling','runtime','Math.min(target.lifeCeiling(), target.life + moved)','target.life + moved'],
 ['sharing-recipients','runtime','m.life -= per;','if (m.dead || m.owner !== target) continue; m.life -= per;'],
 ['current-life-floor','runtime','target.life - 1','target.life'],
 ['lethal-capture','runtime','const lethal = target.life <= 0 && !target.dead;','const lethal = false;'],
 ['spawn-reset','runtime','s.gauge = 0;','s.gauge = 1;'],
 ['sequence-live-physical','runtime','packet.amounts.physical ?? 0','dealt'],
 ['final-death-live','runtime','if (target.life <= 0 && !target.dead) {','if (lethal) {'],
 ['copy-coordinate','binding','vec(actor.pos.x, actor.pos.y)','vec(actor.pos.y, actor.pos.x)'],
 ['scatter-extent','binding','actor.pos.x + rand(-extent, extent)','actor.pos.x + rand(0, extent)'],
 ['retaliation-delivery','binding','w.executeSkill(caster, inst, at, options)','w.executeSkill(caster, inst, at, {...options,dmgMult:0})'],
 ['status-carry','binding',"w['engineHitStatuses'].prepare(caster, inst, target, def, extra, packet, dealt, depth, afflictionCarry)","w['engineHitStatuses'].prepare(caster, inst, target, def, extra, packet, dealt, depth, afflictionCarry+1)"],
 ['surface-tier','binding','radius, undefined, undefined, tier)','radius, undefined, undefined, undefined)'],
 ['world-damage-multiplier','world','this.engineHitAftermath.apply(caster, inst, target, dmgMult, depth','this.engineHitAftermath.apply(caster, inst, target, dmgMult * 0.5, depth'],
];
for(const [name,kind,needle]of faults)assert.equal(originals[kind].toString().split(needle).length-1,1,name+' selector');
const errors=value=>value.rows.flatMap(row=>row.steps.filter(step=>!step.error?.$undefined).map(step=>[row.name,step.error]));
const expectedValue=JSON.parse(expected),expectedErrors=errors(expectedValue),results=[];assertHitAftermathObservations(expectedValue);let passed=false;
try {
 for(const [name,kind,needle,replacement]of [['control',null,null,null],...(forwardingOnly?faults.filter(f=>f[0]==='world-damage-multiplier'):faults)]) {
  if(needle)fs.writeFileSync(files[kind],originals[kind].toString().replace(needle,replacement));
  const out=path.join(directory,name+'.json'),fd=fs.openSync(path.join(directory,name+'.txt'),'wx');
  try{execFileSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,out],{cwd:game,stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});}
  finally{fs.closeSync(fd);for(const [k,f]of Object.entries(files))fs.writeFileSync(f,originals[k]);}
  const actual=fs.readFileSync(out),matches=actual.equals(expected),value=JSON.parse(actual),compressed=gzipSync(actual,{level:9});
  assert(gunzipSync(compressed).equals(actual));fs.writeFileSync(out+'.gz',compressed,{flag:'wx'});fs.unlinkSync(out);
  results.push({name,kind,detected:name!=='control'&&!matches,sha256:sha256(actual),compressedSha256:sha256(compressed),matches});
  assert.equal(matches,name==='control',name);assert.equal(value.courses,260);assert.deepEqual(value.rows.map(r=>r.name),expectedValue.rows.map(r=>r.name));
  for(const [course,error]of errors(value))assert.deepEqual(error,expectedErrors.find(e=>e[0]===course)?.[1],'Unrelated exception: '+name+'/'+course);
  if(name==='control'){assert.deepEqual(errors(value),expectedErrors);assertHitAftermathObservations(value);}
  writeJSON(path.join(directory,'progress.json'),{directory,results});console.log('Verified installed aftermath fault: '+name);
 }
 passed=true;
}finally {
 for(const [k,f]of Object.entries(files))fs.writeFileSync(f,originals[k]);assert.deepEqual(snapshot(path.join(game,'src')),before);assert.deepEqual(snapshot(installed),pkg);
 for(const [f,h]of sealed)assert.equal(sha256(fs.readFileSync(f)),h);
 const report={passed,directory,game,partial:forwardingOnly,declaredFaults:faults.length,faults:results.filter(r=>r.detected).length,results,sourceAndPackageRestored:true,expectedFilesRewritten:false,sourceMapSha256:sha256(JSON.stringify(before)),packageMapSha256:sha256(JSON.stringify(pkg)),verificationInputs:Object.fromEntries(sealed)};
 writeJSON(path.join(directory,'verification.json'),report);writeJSON(forwardingOnly?'.artifacts/game-hit-aftermath-forwarding-verification.json':'.artifacts/game-hit-aftermath-fault-verification.json',report);console.log({passed,directory,faults:report.faults,partial:forwardingOnly});
}
