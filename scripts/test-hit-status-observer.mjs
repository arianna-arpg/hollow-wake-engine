// Verify that the frozen observer distinguishes meaningful faults in original
// source. Every mutation runs in a separate materialized copy of the game.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {root,materialize,verifyReference,sha256,writeJSON} from './reference-utils.mjs';

assert.equal(process.argv.length,2,'This observer control takes no arguments');
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const acceptedPath=path.join(root,'baseline/hit-status/acceptance.json');
const acceptedBytes=fs.readFileSync(acceptedPath);
const accepted=JSON.parse(acceptedBytes);
const helperPath=path.join(root,accepted.helper);
assert.equal(sha256(fs.readFileSync(helperPath)),accepted.helperSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-status-observer-'));
const game=path.join(directory,'game');
materialize(null,lock,game);
verifyReference(game,lock);
fs.symlinkSync(fs.realpathSync(path.join(root,'.reference/node_modules')),
  path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
const world=path.join(game,'src/engine/world.ts');
const original=fs.readFileSync(world,'utf8');
const mutations=[
  ['critical-scale','dpsOut *= cm;','dpsOut *= 1;'],
  ['stat-pool-banking','dps * (STATUS_DEFS[sid]?.duration ?? 0) * durScale',
    'dpsOut2 * (STATUS_DEFS[sid]?.duration ?? 0) * durScale'],
  ['rider-consumption','caster.consumeBuffStacks(bid, 1);','caster.consumeBuffStacks(bid, 0);'],
  ['held-discharge','if (s.holdDischarge || !STATUS_DEFS[s.id]?.dischargeOnHit',
    'if (false || !STATUS_DEFS[s.id]?.dischargeOnHit'],
  ['duration-override','fx.durationOverride / (STATUS_DEFS[fx.status]?.duration || 1)',
    '2 * fx.durationOverride / (STATUS_DEFS[fx.status]?.duration || 1)'],
];
const results=[];
let passed=false;
try{
  for(const[name,needle,replacement]of [['control',null,null],...mutations]){
    if(needle){
      assert.equal(original.split(needle).length-1,1,'Fault selector '+name);
      fs.writeFileSync(world,original.replace(needle,replacement));
    }
    try{
      const run=spawnSync(process.execPath,
        ['scripts/run-hit-status-reference.mjs','--game',game],
        {cwd:root,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024,windowsHide:true});
      const output=(run.stdout??'')+(run.stderr??'');
      fs.writeFileSync(path.join(directory,name+'.txt'),output,{flag:'wx'});
      assert(!run.error,name);assert.equal(run.signal,null,name);
      assert.equal(run.status,name==='control'?0:1,name);
      if(name!=='control'){
        assert.match(output,/Hit status trace differs from accepted original/,name);
        assert(!/SyntaxError|ERR_MODULE_NOT_FOUND|error TS\d+/.test(output),name);
      }
      const proof=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/hit-status-reference-verification.json')));
      assert.equal(proof.game,fs.realpathSync(game));
      assert.equal(proof.acceptanceSha256,sha256(acceptedBytes));
      assert.equal(proof.passed,name==='control');
      assert.equal(proof.observationsSha256===accepted.observationsSha256,name==='control');
      results.push({name,detected:name!=='control',exitCode:run.status,reference:proof});
    }finally{
      fs.writeFileSync(world,original);
    }
  }
  passed=true;
}finally{
  fs.writeFileSync(world,original);
  verifyReference(game,lock);
  assert(fs.readFileSync(acceptedPath).equals(acceptedBytes));
  assert.equal(sha256(fs.readFileSync(helperPath)),accepted.helperSha256);
  const report={passed,directory,game,faults:results.filter(r=>r.detected).length,
    originalRestored:true,expectedFilesRewritten:false,results,
    scope:'Original-source observer controls before runtime extraction'};
  writeJSON(path.join(directory,'verification.json'),report);
  writeJSON(path.join(root,'.artifacts/hit-status-observer-verification.json'),report);
  console.log({passed,directory,faults:report.faults});
}
