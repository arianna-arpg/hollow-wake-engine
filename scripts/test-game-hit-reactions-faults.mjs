import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';import {hitReactionsDecision} from '../adapters/hollow-wake/integrate-hit-reactions.mjs';import {assertHitReactionObservations} from './hit-reactions-observation-checks.mjs';
const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--location');
const location=JSON.parse(fs.readFileSync(path.resolve(root,args[1]))),game=fs.realpathSync(location.game);
assert(game.startsWith(path.join(root,'.artifacts')+path.sep),'Fault tests require a disposable adapter');assert.equal(location.hitReactionsDecision,hitReactionsDecision);
const installed=fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine'));assert(installed.startsWith(path.join(root,'.artifacts')+path.sep));
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))]));
assert.deepEqual(snapshot(path.join(installed,'dist')),snapshot(path.join(root,'dist')));
const before=snapshot(path.join(game,'src')),pkg=snapshot(installed),files={runtime:path.join(installed,'dist/hit-reactions.js'),binding:path.join(game,'src/engine/hitReactions.ts')};
const originals=Object.fromEntries(Object.entries(files).map(([k,f])=>[k,fs.readFileSync(f)]));
const acceptanceFile=path.join(root,'baseline/hit-reactions/acceptance.json'),acceptanceBytes=fs.readFileSync(acceptanceFile),accepted=JSON.parse(acceptanceBytes),compressedExpected=fs.readFileSync(path.join(root,accepted.observations)),expected=gunzipSync(compressedExpected);
assert.equal(sha256(compressedExpected),accepted.compressedSha256);assert.equal(sha256(expected),accepted.observationsSha256);const helper=fs.readFileSync(path.join(root,accepted.helper),'utf8');assert.equal(sha256(helper),accepted.helperSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/game-hit-reactions-faults-')),runtime=path.join(directory,'capture.ts');
fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)),{flag:'wx'});
const faults=[
 ['threat-live-modifiers','runtime','ports.instanceMods(inst)','extra'],
 ['fragile-live-map','runtime','of target.buffs','of [...target.buffs]'],
 ['orb-chance-cap','runtime','Math.min(0.5, c)','Math.min(1, c)'],
 ['stealth-live-list','runtime','of ports.actors()','of [...ports.actors()]'],
 ['watch-point-identity','runtime','if (target.watchAt)','if (false)'],
 ['captured-critical','runtime','if (wasCrit)','if (result.crit)'],
 ['zero-roll-event','runtime','packet.rollT !== undefined','packet.rollT'],
 ['captured-damage-bank','runtime','target, dealt, caster','target, result.total, caster'],
 ['damage-rounding','binding','Math.round(dealt)','Math.floor(dealt)'],
 ['damage-critical-size','binding','result.crit?18:13','13'],
];
const errors=value=>value.rows.flatMap(row=>row.steps.filter(step=>!step.error?.$undefined).map(step=>[row.name,step.error]));
const expectedValue=JSON.parse(expected),expectedErrors=errors(expectedValue),results=[];assertHitReactionObservations(expectedValue);let passed=false;
try{for(const[name,kind,needle,replacement]of [['control',null,null,null],...faults]){
  if(needle){const source=originals[kind].toString();assert.equal(source.split(needle).length-1,1,name);fs.writeFileSync(files[kind],source.replace(needle,replacement));}
  const out=path.join(directory,name+'.json'),fd=fs.openSync(path.join(directory,name+'.txt'),'wx');
  try{execFileSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,out],{cwd:game,stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});}
  finally{fs.closeSync(fd);for(const[k,f]of Object.entries(files))fs.writeFileSync(f,originals[k]);}
  const actual=fs.readFileSync(out),matches=actual.equals(expected),value=JSON.parse(actual);
  const compressed=gzipSync(actual,{level:9});assert(gunzipSync(compressed).equals(actual));fs.writeFileSync(out+'.gz',compressed,{flag:'wx'});fs.unlinkSync(out);
  results.push({name,kind,detected:name!=='control'&&!matches,sha256:sha256(actual),compressedSha256:sha256(compressed),matches});
  assert.equal(matches,name==='control',name);assert.equal(value.rows.length,136);assert.deepEqual(value.rows.map(r=>r.name),expectedValue.rows.map(r=>r.name));assert.deepEqual(errors(value),expectedErrors,'Unrelated exception: '+name);
  if(name==='control')assertHitReactionObservations(value);writeJSON(path.join(directory,'progress.json'),{directory,results});console.log('Verified installed reaction fault: '+name);
 }passed=true;
}finally{for(const[k,f]of Object.entries(files))fs.writeFileSync(f,originals[k]);assert.deepEqual(snapshot(path.join(game,'src')),before);assert.deepEqual(snapshot(installed),pkg);
 assert.equal(sha256(fs.readFileSync(acceptanceFile)),sha256(acceptanceBytes));assert.equal(sha256(fs.readFileSync(path.join(root,accepted.helper))),accepted.helperSha256);assert.equal(sha256(fs.readFileSync(path.join(root,accepted.observations))),accepted.compressedSha256);
 const report={passed,directory,game,faults:results.filter(r=>r.detected).length,results,sourceAndPackageRestored:true,expectedFilesRewritten:false,sourceMapSha256:sha256(JSON.stringify(before)),packageMapSha256:sha256(JSON.stringify(pkg))};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/game-hit-reactions-fault-verification.json',report);console.log({passed,directory,faults:report.faults});}
