# Hit preparation

The optional `@hollow-wake/engine/combat/hit-preparation` service owns the first
23 statements of `World.resolveHit`, through shell interception and before
damage admission: fuse admission, ordered contextual multipliers, packet scaling
and affliction carry. The original baseline was frozen before extraction. Complete
hit orchestration, fuse execution/cancellation, damage aftermath and death remain
separate work; the existing shared damage, hit/status and effect-dispatch services
keep their accepted contracts.

## Captures and ownership

The original observer invokes the real complete hit resolver. It records stat
queries, random draws, host calls, packets, delayed queues, status/source removal,
cues, final state and partial failures. Normal captures do not instrument or
replace source. Selected cases replace a callback to exercise nested hits, a
target-specific instance, or an explicit failure; native guard and shell cases
separately exercise the original implementations.

The 122 courses include fuse timing and socket precedence; reference versus copy
ownership; effective proc depth; combat and possession stamps; noise; reverse
shatter consumption; concealment/ambush; strict rear-angle and proximity limits;
owned breakable affinity; armed victim scopes; packet scaling; affliction
conversion; tone capture; guard/shell priority; reentry and partial failures.
Two original captures and the installed predecessor agree byte-for-byte.

The source deliberately captures `def` before `attackSequences.forTarget` can
replace `inst`. Definition-based shatter, backstab and later damage admission
therefore use the incoming definition, while modifiers and the damage roller use
the replacement instance. A test supplies distinct definitions and confirms the
resulting cold packet independently.

Fuse admission precedes combat stamps, guise breaking, target replacement and
rolling. Its queue record borrows the instance, flat additions and delivery-effect
list. It copies the origin and preserves explicit tier zero. The segment contact
latch clears after cues; a failed tell leaves the queued hit and the old latch.
Scheduling does not prove deferred execution or zone cancellation is extracted.

Shatter visits the live status list backward. Each splice commits before modifier
source removal, and a failed removal retains that partial state. Status records
are borrowed, not cloned. Stack-based multipliers sum the consumed stack counts.
The observer retains removed records so both identity and state remain visible.

Packet tone is captured after contextual scaling and before affliction conversion.
Full conversion can leave a zero-damage carrier that still conveys its original
tone and an affliction. Guard and shell read the post-conversion packet, run in
that order, and are skipped when raw damage is zero. A successful interception
ends the entire hit. Shell overflow mutates the packet that proceeds downstream.

## Portable contract

`createHitPreparation(ports).prepare(...)` uses explicit synchronous ports for world/seat accounting,
target-specific instances, positions and spatial observations, concealment and
victim conditions, the existing damage roller, guard/shell behavior, perception
noise and presentation. Positions are a host-defined generic type; an independent
consumer uses opaque positions without coordinates. Time and the delayed queue
remain instance-owned; no process-global clock, RNG, registry or scratch frame is
permitted. Nested calls retain their own locals and snapshots. The host retains
actor, instance, modifier, status, packet and queue ownership. Input records are
trusted and may be changed by synchronous callbacks; this API is not a serialized
command parser or a concurrent mutation protocol.

The positional arguments preserve the original hit entry: caster, instance,
target, damage multiplier, depth, flat additions, forced damage, fuse bypass,
delivery effects, origin and tier. Successful preparation calls `ports.continue`
synchronously with the captured definition, replacement instance, modifiers,
packet, rear-hit flag, tone and affliction carry. Intercepted or queued hits do
not call it. Its return value is forwarded. Errors propagate with already
committed changes intact; the service does not roll them back.

The continuation passes borrowed records and scalar values without adding a
per-hit result wrapper, continuation closure or argument array. The game binding uses explicit
parameters and moves the remaining resolver body into `continuePreparedHit`.
The integration checks that body's exact text before and after the move. It also
checks the original preparation statements, signature and affected imports.
This is an extraction of preparation policy, not acceptance of all remaining
hit aftermath or native guard/shell behavior as standalone SDK services.

Fuse scheduling captures the queue and its `push` method before evaluating the
queued fields. A host stat query that replaces the queue must not redirect that
already-started insertion. The independent test replaces both the queue and its
method during the delay query. Cues retain their original ordering and live reads
inside the game binding.

Trusted runtime records remain separate from untrusted content import. A database
or content compiler may produce those records; neither belongs in the per-hit
loop. This extraction changes no storage format. Its optional entry has a separate
8 KiB unminified JavaScript limit; every predecessor package limit is retained.
No new module is imported by the eager core. Allocation volume and physical
Steam Deck/mobile acceptance still require direct measurement.

## Verification

The first draft's tier-zero course also used a caster on tier zero. A deliberate
`??` to `||` fault survived because both branches selected the same value. The
revised course places the caster on tier two and explicitly supplies tier zero.
Its rejected draft is retained in the evidence; expectations were not accepted
until the corrected observer distinguished the fault.

The stat service also masked a removed local affliction clamp: even an authored
value of two arrived at preparation already capped to one. Two additional cases
explicitly supply uncapped host-query results and confirm that preparation caps
them. This preserves the local rule for other hosts without claiming the original
game normally emits those values. The definition-capture fault reassigns the
definition after target replacement while retaining its earlier initialization,
so it cannot pass as a mere use-before-initialization exception.

```sh
npm run reference:hit-preparation
node scripts/run-hit-preparation-reference.mjs --game <prepared-game>
npm run test:hit-preparation-observer
npm run test:hit-preparation-package
npm run test:hit-preparation-mutations
npm run adapter:hit-preparation-source
node scripts/test-game-hit-preparation.mjs --location <adapter-location.json>
node scripts/test-game-hit-preparation-faults.mjs --location <adapter-location.json>
```

Normal verification checks the accepted helper, source lock and compressed
observations without rewriting them. Source faults must change behavior while
retaining the three intentional failure outcomes, except that removing the source
cleanup call must also remove that callback's deliberate error. Parsing failures
and unrelated exceptions do not count as detections. Separate audits check native guard precedence,
delayed ownership, reverse removal and arithmetic boundaries.

The [baseline evidence](../evidence/hit-preparation/baseline-windows.json) retains
the captures, rejected drafts, corrected controls and verification receipts.

The extraction adds 28 independent tests, 35 runtime faults, 35 source/collision
controls and six installed-runtime faults. The clean consumer checks TypeScript
contracts and browser bundling with ambient randomness and network calls disabled.
The existing voice diagnostic follows the moved disguise caption into
`hitPreparation.ts`; its assertions remain unchanged. Its original source-only
census correctly failed when that location was initially omitted, and the failed
run is retained rather than reclassified as a passing game gate.

## Extraction acceptance

The [runtime evidence](../evidence/hit-preparation/runtime-windows.json) records
1,159 passing SDK tests, the 122 installed preparation courses, 28 independent
tests on Node 22 and 24, all 35 runtime faults on both versions, 35 source
controls, six installed faults and the clean package/type/browser consumer.
All sixteen game verification groups pass, including the earlier damage/status/
attack comparisons, six rule probes and 25 smoke episodes. The pinned reference
verification also passes without changing accepted expectations.

The new optional entry contributes 5,564 JavaScript bytes. All 255 predecessor
compiled files remain byte-identical. The native full-attack comparison matches
original and installed execution in QuickJS-NG; its previously accepted small
facing-angle differences from Node remain separately bounded. This is a native
execution experiment, not a completed Unity, Godot or Unreal package.

The following desktop measurements cover the complete warmed hit resolver, with
equal reset/setup costs in both graphs, 1,500 warmups, nine batches of 1,000 hits,
and alternating previous/current/current/previous runs. Each table time is the
median of the two run medians. A ratio above one means higher measured time.

| Workload | Previous µs/hit | Current µs/hit | Current / previous |
| --- | ---: | ---: | ---: |
| plain | 85.58 | 86.57 | 1.012 |
| authored | 103.24 | 106.57 | 1.032 |
| stat | 96.56 | 95.91 | 0.993 |
| rider | 172.30 | 170.98 | 0.992 |
| impale | 93.77 | 93.83 | 1.001 |

Machine: Intel(R) Core(TM) i9-10900K CPU @ 3.70GHz, win32/x64.
These are initial desktop observations, not a general speedup claim or physical
Steam Deck/mobile acceptance. Retained heap after forced GC is recorded in the
evidence and does not measure total allocation volume. Core benchmarks passed
separately; unrelated heavy verification was stopped during measurement.
