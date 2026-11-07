import assert from 'node:assert/strict';

/** Require every crash boundary and both journal modes, including zero-byte WALs. */
export function verifyInventoryPlatform(proof, gameSha256) {
  assert(proof.passed&&proof.uid===13,'completed inventory Platform course');
  assert.equal(proof.gameSha256,gameSha256,'matched shipping archive');
  assert.deepEqual(proof.loadedLibraries,['libhwe_embedded.so','libhwe_godot.so','libhwe_slot_store.so']);
  const expected=['wal','delete'].flatMap(mode=>['before-stage','after-stage','after-commit'].map(phase=>[mode,phase]));
  assert.deepEqual(proof.crashes.map(row=>[row.journalMode,row.phase]),expected,'all journal crash boundaries');
  for(const row of proof.crashes){
    assert(row.barrierVerified===true&&row.terminated===true,'observed process termination');
    assert.deepEqual(Object.keys(row.journalBytes).sort(),['-journal','-wal']);
    assert(Object.values(row.journalBytes).every(n=>Number.isSafeInteger(n)&&n>=0),'journal size observation');
    assert.equal(row.recovery.revision,row.phase==='after-commit'?2:1,'recovered revision');
    assert(row.recovery.gameEqualsDatabase===true&&/^[a-f0-9]{64}$/.test(row.recovery.observedSha256),'both recovered owners observed');
    for(const suffix of ['seed','interrupt','shipping-recovery','inspect'])
      assert(proof.checks.includes(row.journalMode+'-'+row.phase+'-'+suffix),'complete crash observation sequence');
  }
  for(const name of ['seed','transfer','shipping-reopen','inspect-committed','equipment-cards'])
    assert(proof.checks.includes(name),'uninterrupted control and item cards');
}
