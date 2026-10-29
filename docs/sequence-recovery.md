# Attack-sequence recovery

`@hollow-wake/engine/combat/sequence-recovery` owns recovery holds, active-cast
settlement, catch-bank reset and release/miss clocks. It operates on borrowed
state through synchronous observations. It has no runtime imports, ambient clock,
random source, actor registry or rendering dependency.

The [example](../examples/sequence-recovery.mjs) follows flight, an airborne catch
window, a fallen pickup, return, and a subsequent missed throw. The Hollow Wake
adapter delegates these decisions from `AttackSequences`; the rest of that
controller still owns geometry, hit cycles, status application, projectiles,
catch rewards, scheduled execution and retirement cleanup.

## Ownership and phase order

1. After admitting a recoverable cast, add it to the active set and call
   `lockSequenceRecovery`. The lock set blocks admission. The paired one-second
   clocks present the hold on the hotbar; they are not its lifetime.
2. After the host processes movement, due work and recoverable objects, call
   `settleSequenceRecoveries` with reusable ports. Observe this cast's flight,
   pending work and outstanding objects in that order. The adapter's pending
   observation checks scheduled throws, salvos, repeats and fuses in order.
3. Once flight, pending work and airborne objects end, mark the cast done. An
   uncaught cast with catch policy clears its bank and calls `clearCatch` once.
   Grounded objects continue holding recovery until retrieved or removed.
4. Remove a cast after all its outstanding work and objects end. Only the last
   active cast of that same state releases it. That last cast's `connected` flag
   determines whether to stamp the authored positive miss penalty.
5. Retirement removes the host's queues, objects and active casts and calls
   `releaseSequenceRecovery(state, false)`. Ordinary clock advancement stays in
   the existing cooldown phase. Settlement never advances time itself.

State equality is object identity. IDs must retain the game's ownership policy;
the module does not introduce a global registry or merge separate states by ID.
The host must expose current observations and apply its existing admission check
against `skillRecoveryLocks`. A Unity/Godot/Unreal wrapper must implement that
ownership and phase order before claiming this capability.

## Ordering and failure contract

Store writes and identity/policy reads remain live. Locking writes the lock,
remaining clock and total clock in order. Release removes them in that order
before reading and writing a miss penalty. A miss requires a recovery policy;
retirement does not. Exceptions propagate, retaining earlier mutations.

Iteration snapshots preserve the original reentrant behavior: a cast added by
`clearCatch` can block release, but waits until the next settlement; a removed
cast already in the snapshot still receives its turn. `done` and the bank reset
precede the callback. A callback that retires the sequence does not abort the
already executing settlement; a miss clock can subsequently be stamped. These
are recorded original behaviors, not newly promised transactional semantics.

## Evidence and cost limits

The [frozen acceptance](../baseline/sequence-recovery/acceptance.json) contains 49
courses from two independent original captures, also matched by the installed
predecessor. Ten intentionally failing operations capture partial writes. Queue
fixtures isolate settlement; `balance/probe_cleave.ts` exercises actual game
delivery separately. Normal tests compare the frozen fixture without updating it.

The focused suite contains 28 tests. Separate runtime mutation, source-boundary
and installed-adapter controls check that missing behavior is detected. Run:

```sh
npm run verify
npm run reference:verify
npm run reference:sequence-recovery
npm run adapter:prepare
npm run adapter:sequence-recovery
npm run adapter:sequence-recovery-faults
```

Use a fresh adapter destination; preparation refuses to replace dependencies.
In that adapter, run the game type checks, simulation smoke suite and
`node --import tsx balance/probe_cleave.ts`. Package tests use an independently
installed consumer and reject asynchronous observations/publication in types.

This first extraction preserves snapshot allocation and the original queue and
pickup scans. With many active casts it can scan the active set repeatedly.
It establishes the comparison needed for measured indexing/batching work; it
does not establish a speedup, allocation-free execution, physical-device
performance, renderer equivalence or new native-host API coverage.
