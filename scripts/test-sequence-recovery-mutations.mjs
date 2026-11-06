import assert from 'node:assert/strict';
import {readMutationSource,runMutationFixture} from './mutation-fixture.mjs';
import {exportedFunctionBody} from './exported-function-body.mjs';
import {sha256} from './reference-utils.mjs';

const faults=[
  [
    "omit-lock",
    "lockSequenceRecovery",
    "state.owner.skillRecoveryLocks.add(state.host.def.id);",
    "void state;"
  ],
  [
    "zero-hold",
    "lockSequenceRecovery",
    "state.owner.cooldowns.set(state.host.def.id, 1);",
    "state.owner.cooldowns.set(state.host.def.id, 0);"
  ],
  [
    "omit-hold-total",
    "lockSequenceRecovery",
    "state.owner.cooldownTotals.set(state.host.def.id, 1);",
    "void state;"
  ],
  [
    "omit-unlock",
    "releaseSequenceRecovery",
    "state.owner.skillRecoveryLocks.delete(state.host.def.id);",
    "void state;"
  ],
  [
    "omit-clock-clear",
    "releaseSequenceRecovery",
    "state.owner.cooldowns.delete(state.host.def.id);",
    "void state;"
  ],
  [
    "omit-miss",
    "releaseSequenceRecovery",
    "miss &&",
    "false &&"
  ],
  [
    "wrong-total",
    "releaseSequenceRecovery",
    "state.owner.cooldownTotals.set(state.host.def.id, state.spec.recovery.missCooldown);",
    "state.owner.cooldownTotals.set(state.host.def.id, 1);"
  ],
  [
    "ignore-pending",
    "settleSequenceRecoveries",
    "const pending = ports.pending(cast);",
    "ports.pending(cast); const pending = false;"
  ],
  [
    "ignore-airborne",
    "settleSequenceRecoveries",
    "!objects.some(object => object.airborne)",
    "true"
  ],
  [
    "ignore-done",
    "settleSequenceRecoveries",
    "&& !cast.done",
    "&& true"
  ],
  [
    "ignore-caught",
    "settleSequenceRecoveries",
    "!cast.caught &&",
    "true &&"
  ],
  [
    "omit-bank-reset",
    "settleSequenceRecoveries",
    "state.caught = 0;",
    "void state;"
  ],
  [
    "ignore-pickups",
    "settleSequenceRecoveries",
    "!objects.length",
    "true"
  ],
  [
    "omit-active-removal",
    "settleSequenceRecoveries",
    "active.delete(cast);",
    "void cast;"
  ],
  [
    "ignore-siblings",
    "settleSequenceRecoveries",
    "![...active].some(other => other.state === state)",
    "true"
  ],
  [
    "live-iteration",
    "settleSequenceRecoveries",
    "for (const cast of [...active])",
    "for (const cast of active)"
  ]
];

const sourceFile='dist/sequence-recovery.js',testFile='test/sequence-recovery.test.mjs';
const source=readMutationSource(sourceFile);
const metadata={moduleSha256:sha256(source),testSha256:sha256(readMutationSource(testFile))};
runMutationFixture({suite:'sequence-recovery',testFile,metadata},run=>{
  for(const [name,fn,before,after] of faults){
    const region=exportedFunctionBody(source,fn),body=source.slice(region.start,region.end);
    assert.equal(body.split(before).length,2,name);
    run(name,sourceFile,source.slice(0,region.start)+body.replace(before,after)+source.slice(region.end));
  }
});
