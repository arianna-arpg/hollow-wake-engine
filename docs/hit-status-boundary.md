# Hit/status policy and its original boundary

`@hollow-wake/engine/statuses/hits` exposes `createHitStatuses` over host-owned
actor records. It composes status baseline arithmetic and adds no runtime
dependency, global registry, clock, ambient random source or rendering engine.
The accepted original-game fixture below predates the implementation.

The 369 courses exercise all 152 status definitions through both authored effects
and stat-granted application, plus 65 focused cases. They cover linked curses,
duration overrides, resistance/chance, wet grants, rupture conversions, critical
ailments, next-hit riders, delivery-added effects, callback changes and failures,
and held/top-level Impale discharge and drive-in. The observer calls the original
`World.resolveHit`; it does not replace the damage calculation with a stub.

Two original captures and the installed predecessor agree. State, random draws,
stat query values and order, application payloads, pool banking, proc callbacks,
text and flashes are retained. Stat-query traces explicitly represent all three
arguments `(id, tags, extra)`: omitted and explicitly undefined optional arguments
have the same representation. No source call or result is changed by this
normalization. An intentional application exception is recorded after the
application's earlier writes.

The initial draft missed ailment criticals despite a 95% chance because every
course started at the same random sequence. Its critical-scaling mutation
survived. The accepted fixture adds a course that must observe an actual ailment
critical. Five original-source faults are now detected: missing critical scaling,
changed stat-path pool banking, unspent rider stacks, ignored discharge hold and
changed fixed duration. The original source copy is restored after every fault.

## Distinctions the extraction must preserve

- Authored ailments perform the World-level victim resistance roll. The
  stat-granted path does not perform that same roll.
- Authored ailments can apply critical scaling. The stat-granted path has
  different Doom arithmetic and omits the non-damaging `power` option.
- Authored pool banking uses final outgoing DPS. The stat-granted path banks
  its earlier DPS value, before rupture conversion.
- Linked curses apply their first status with a narrower payload, without the
  ordinary authored-effect chance, potency and attribution process.
- Next-hit riders snapshot buff entries, execute their lanes, consume by id,
  and then emit their release cue. Reentrant changes must retain that order.
- Impale discharge precedes Assault planting and stat Impale drive-in. These
  phases must stay distinct across the host boundary.

These differences are observed behavior, not endorsements of balance choices.
Unifying them requires an explicit semantic decision and separate acceptance.

## Host contract

Keep `dischargeOnHit`, the host's Assault planting, and `plantImpale` in that
order. Later, at the original status preparation point, call `prepare` with the
captured skill definition, instance, modifiers, rolled packet, dealt damage,
recursion depth and affliction carry. The definition is an explicit argument:
the original host can replace the instance after capturing its definition.

The returned frame borrows actor, packet, definition and modifier references.
It captures only the original local scalars and context tags. Keep it private
to that hit and do not modify its captured fields. Call `applyRiders`, then
`applyAuthored` at each authored status effect's position in the host's ordered
effect loop. Call `applyGranted` at the later stat-granted phase. These methods
do not implement the intervening effects or the complete hit orchestrator.

Ports are synchronous and may reenter. Each hit has its own frame; no shared
current-hit slot is used. Callback failures retain earlier writes. Definitions,
stats and callbacks remain live at the original read points. The game binding
borrows World's original `STATUS_IDS` list without moving its module-time
initialization. Other hosts supply their own ordered vocabulary through the port.
Actor positions are not part of this policy; presentation maps the supplied
actor and authored screen-height offset into the host's coordinate system.

This is a trusted runtime integration contract over ordinary mutable records,
not an untrusted-input parser or persistence schema. It preserves original
numeric behavior and does not add clamping that would alter content.

## Reproduction

```
node scripts/run-hit-status-reference.mjs
node scripts/run-hit-status-reference.mjs --game <prepared-game>
node scripts/test-hit-status-observer.mjs
npm run test:hit-status-package
npm run test:hit-status-mutations
npm run adapter:hit-status-source
npm run adapter:hit-status -- --location <adapter-location.json>
```

Ordinary runs verify the frozen inputs and never regenerate expectations.
The source lock, method/statement hashes and observer are under `baseline/hit-status`
and `reference/export-hit-status.ts`.

Independent tests use hand-derived values and plain actors, covering live reads,
nested frames, distinct authored/stat arithmetic and partial callback failures.
Runtime mutations must fail assertions rather than import or parsing errors.
Source controls cover all sixteen statement boundaries, atomic preflight,
collisions, repeated installation and both LF/CRLF source files. Installed faults
must change the original trace without introducing unrelated exceptions.

The optional module has a separate 16 KiB unminified JavaScript growth guard.
The core entry point must not import it eagerly. Two per-hit helper closures
are replaced by factory-shared helpers and one hit frame; this is not a measured
allocation or speed claim. Whole-hit cost, retained memory and physical Steam
Deck/mobile measurements remain required before accepting an optimization.
Complete hit orchestration, spatial delivery, death processing and detailed
native APIs remain separate work.

`benchmark:hit-status -- --previous <previous-location.json> --location
<current-location.json>` runs plain, authored, stat-granted, rider and Impale
whole-hit workloads. Four separate processes use previous/current/current/previous
order, 1,500 warmup hits and nine batches of 1,000 measured hits per workload.
Per-hit resource/presentation resets and rider setup are included equally.
Damage, random-draw counts and final status state must agree across every run.
Forced-GC retained-heap deltas are recorded separately; they do not measure
allocation volume. Loading, rendering, timer sweeps and physical-device acceptance
are outside this desktop comparison.

The first Windows/Node 24 comparison on an i9-10900K preserved every benchmark
checksum. Median times, averaging the two process medians, were:

| Workload | Previous (ms/hit) | Extracted (ms/hit) |
| --- | ---: | ---: |
| Plain | 0.126 | 0.110 |
| Authored ailment | 0.144 | 0.130 |
| Stat-granted ailment | 0.140 | 0.125 |
| Loaded rider | 0.248 | 0.219 |
| Impale | 0.130 | 0.122 |

These are an initial desktop observation, not an accepted general speedup or a
Steam Deck/mobile budget. Retained-heap deltas include negative values and JIT/GC
effects; they do not establish allocation savings. The [runtime evidence](../evidence/hit-status/runtime-windows.json)
retains the process samples, comparison scope, source identities and verification
logs. No prior runtime budget or expected fixture was relaxed.
