import assert from 'node:assert/strict';
import {replayGodotSession} from './godot-session-replay.mjs';
replayGodotSession({capability:'progression',probe:'test/godot-progression/probe.gd',runner:'scripts/test-godot-progression.mjs',
  scope:'Account purchases, class claims, storage with opaque items, memory RNG continuation, isolated disk save/restore and eight profiles in Godot. Peak bytes report tracked embedded allocations only; no device claim.',
  validate(result,name){
  assert(result.assertions>=65);
  assert.equal(result.partial.spent,17);assert.equal(result.finished.spent,43);assert.equal(result.storage.spent,40);assert.equal(result.power.spent,25);
  assert.equal(result.first.spent,30);assert.equal(result.first.draws,1);assert.equal(result.continuations.length,10);assert.equal(result.continuations.at(-1).sequence,11);
  assert(result.large_profiles>0,'Near-limit save/restore must execute, not only refuse inputs');
  assert.equal(result.exact_integer,'9007199254740991');
  assert(result.catalogue_total>190);
  for(const metrics of [result.metrics,result.resumed_metrics]){assert.equal(metrics.live_bytes,0);assert.equal(metrics.live_blocks,0);assert(metrics.peak_bytes>0&&metrics.peak_bytes<=32*1024*1024);}
  }
});
