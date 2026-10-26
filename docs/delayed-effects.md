# Delayed effects: runtime and cancellation contract

Milestone 40 starts with 48 pinned-original observations. The SDK scheduler and
owned-content compiler are implemented. The first installed game adapter matches
all 48 original scenarios with exactly the six predeclared repairs. Controlled
headless frame and performance comparisons are recorded below; renderer and
managed-game acceptance remain pending. The [acceptance manifest](../baseline/milestone-forty/acceptance.json)
retains the original helper and fixture bytes, including their historical
discovery-scope wording. It does not adopt the recorded defects as SDK behavior.

Each group passed two original runs and one run against the retained, published
v0.34 installation. Both graphs type-check the helpers; all three outputs match
byte-for-byte. Existing effect observations in [M39](proc-effects.md) remain
unchanged.

| Group | Cases | Observations |
| --- | ---: | --- |
| Ordering | 15 | Reverse traversal, live clock, append/re-entry/reset diagnostics, target-array iteration, borrowed payloads and tangent range |
| Defenses | 14 | Immunity versus invulnerability, ward/shield spending, text/break/sweep/death ordering and partial commits |
| Native descent | 2 | Real death, wipe, resurface and queue replacement; an earlier future entry exposes the indexing failure |
| Frame and scheduling | 7 | Native frame phases, deferred heal reactions, pause/slow motion and warning failures |
| Authored contact workload | 6 | Original Sanctified Strike contacts with three proc grants, overlapping queues and native delivery |
| Departed-area targets | 2 | The old actor iterator damages an ally already removed by native zone loading |
| Passive registrations | 2 | Native summon death and completed Versicle execution, cooldown rejection and exact ready-time admission |

## Loaded content

The loaded original contains five delayed effects: Radiant Reprisal, Radiant
Cascade, Sainted Ash, Parting Blessing and Song of Return. The last two are
registered by `passiveNotables.ts` during boot. Static inspection of
`data/procs.ts` alone misses them. Exact loaded definitions, source hashes,
schedule/drain/queue text, the reset path and frame placement are retained in
[source boundaries](../baseline/milestone-forty/source-boundaries.json).

The contact workload preserves the original skill and proc definitions. It
supplies four batches of native hits to 1, 8 or 32 rare targets at 0.25 or 0.75
second intervals, then invokes the native drain. Observed queue peaks range
from 6 to 195 entries. These are controlled contact-batch observations: no
intermediate full frames, input admission, ordinary cast pacing or player
population distribution is inferred. They justify including overlapping
queues in later benchmarks, not a fixed capacity or a performance claim.

## Ordering and ownership to preserve

Scheduling copies the location, deadline, tier, depth and color while retaining
the owner and scaled payload references. Resolution samples owner level once
per removed burst, but team and payload fields remain live for each target.
The reverse-array drain checks the current clock for each entry. It removes an
entry before any delivery, so a subsequent failure does not retry that entry.
Newly appended entries wait until the next drain in the observed cases.

The target loop retains its chosen array iterator. Appending/removing actors
affects iteration; replacing the array property does not replace that iterator.
Native healing, mitigation, visual notification, shield-break dispatch, defense
sweeping and death retain their separate observable boundaries.

Stat-based damage immunity bypasses defense spending. Native base
invulnerability is checked after mitigation; it can leave spent pools and a
pending shield-break flag. These are recorded behaviors, not newly introduced
regressions. Their redesign is outside the zone-reset correction.

World updates run delayed bursts after temporary ground and evaporation,
before contagions and terrain effects. A burst's heal response is consumed on
the following actor frame. Pause prevents delivery and slow motion scales its
clock. A warning failure occurs after enqueue; it leaves that entry pending
and skips the executor's rider tail.

## Required intentional repair

Native delayed damage can kill the last player during a descent. The real
death/wipe/resurface path calls `loadZone`, which replaces the pending queue.
The current target iterator still visits actors from the departed area; a
remaining queue index can then throw `TypeError`. The single-entry case proves
that eliminating the exception alone would leave the stale-target damage.

The [runtime contract](../baseline/milestone-forty/runtime-contract.json) records
the intended behavior before implementation. The SDK must cancel the current
delivery and old pending work when the host resets or replaces the queue.
Already committed damage, death and zone loading remain committed. Generation
and queue identity are checked after external delivery callbacks. New work in
the replacement queue waits until the next advance.

Each independent host queue gets its own scheduler and re-entry guard. Nested
advance on the same instance fails before another entry is visited; independent
instances may nest. The guard releases after success, cancellation or failure.
Explicit reset invalidates the generation before clearing the host queue, so
restoring an old array reference cannot conceal that reset.

The [repair expectations](../baseline/milestone-forty/repair-expectations.json)
specify exactly six changed courses: three queue/re-entry diagnostics and three
native descent cases. They check every original before-value and both case
hashes. The other 42 courses and all unaffected fields remain exact. The original
failing fixtures are unchanged; `scripts/check-delayed-contract.mjs` produces
only detached expected copies for future installed comparisons.

Same-array queue splicing during a drain remains unsupported. Recursive advance
deliberately rejects with `Error('Delayed burst advance is already active')`;
the caller may catch it and let the outer invocation continue. These diagnostic
cases are distinct from the reproduced native descent path.

## SDK boundary

The optional `@hollow-wake/engine/combat/delayed` entry owns scheduling,
reverse queue traversal, target filtering, magnitude arithmetic and ordered
delivery. Shared synchronous host ports supply the clock, queue, actor array,
warning/impact visuals, native healing/mitigation, text, defense events and
death. One scheduler per host owns only its drain guard and generation; the
host retains its actor and queue records. Port tables need no per-frame or
per-actor wrappers. The game adapter delegates scheduling, draining and
the native queue-reset site, preserving other proc branches and the rider tail.

The optional `compileDelayedBurstEffect(input, damageTypes)` compiler validates
the complete delayed shape, including supported damage type membership, finite
numeric fields and nonnegative delay/radius, then freezes a copied definition. Finite negative
magnitudes and visual-only payloads remain representable. The trusted native
binding retains borrowed payload identity and live edits. These are separate
ownership choices; imported content alone does not prove executable support.
Serialized input must contain plain enumerable data fields. Unknown fields,
symbols, accessors and exotic prototypes are rejected; getters are not evaluated.

Create one `DelayedBursts(ports)` per host queue. Call `schedule(host, owner,
effect, color, depth, target)` with an already-scaled effect; `depth` defaults to
zero, and a missing target falls back to the owner. Advance at the host's delayed
effect phase with `advance(host)`. Call `reset(host)` on scene/zone replacement.
The host must implement `clearQueue`; changing a generation does not itself erase
host records. Read ports must be coherent, synchronous observations over plain
records. Keep the shared port table immutable. Sink ports return `undefined`,
which rejects asynchronous implementations in TypeScript; wrap a native `void`
method in a block-bodied callback if necessary. JavaScript hosts must obey the
same synchronous contract.

The packaged [example](../examples/delayed-bursts.mjs) runs independent encounters
and demonstrates cancellation from death. Its healing and mitigation are small
example policies, not substitutes for a game's real defense rules. The installed
consumer verifies both encounter outcomes, subtype preservation and rejection
of asynchronous implementations of all 12 ports without Node or DOM types.

The focused SDK suite has 42 checks, separate from the 48 original observations.
It covers all five loaded definitions, mutation/ownership rules, iteration,
cancellation after every delivery callback, exceptions and nested invocation.
Twenty-four injected runtime defects must fail behavioral assertions, including
removing each cancellation checkpoint. The separate installed-game comparison
passes all 48 courses against the explicit six repairs.

## Native game adapter

The [source integration contract](../baseline/milestone-forty/adapter-contract.json)
guards the scheduling case, queue declaration/accesses, drain, zone reset and
frame adjacency before writing either host file. Its five member hashes match
the retained M39 installation. Source tests reconstruct those members from the
pinned original with the earlier ward and bank transformations, then reject
100 faults across LF and CRLF inputs without partial writes. The other 21 effect
branches, method signatures, executor context, rider tail, other World members
and unrelated declarations remain unchanged.

Each World owns a scheduler. A shared frozen callback table invokes native
`healBy`, `mitigateTyped`, text, defense dispatch/sweeping and death at the
original boundaries. The original pending queue remains host-owned. There are
no new per-frame wrapper objects or per-target callback closures. This is a
structural property, not a measured allocation-volume result.

The installed comparison uses unchanged original helpers except six explicitly
listed assertion edits in temporary copies. Each edit is restricted to complete
assert calls in its named diagnostic; setup, catches and observations remain
intact. Every output field matches the separately committed repair expectations.
Four additional host cases verify exact warning/impact shapes and independent
world nesting, plus real zone loading followed by restoration of the old queue
reference at flash and healing callbacks. The latter diagnose generation
cancellation without claiming that ordinary gameplay restores that private array.

`adapter:delayed` is read-only by default. `--faults` requires a disposable
installation under `.artifacts`, rejects retained game/tooling aliases and
restores source/runtime bytes after every injected defect. Faults exercise the
installed module, callback table and World delegation separately; all 17 are
detected by assertions or complete output differences. The ordinary
adapter preparation path and hosted verification include the new integration.

The built module is 8,143 bytes of unminified JavaScript, within the previously
declared 8 KiB allowance. The combined JavaScript ceiling is 500 KiB; prior
module/core limits remain unchanged. It has no imports and is not an eager core
dependency. This size result is not a speed or allocation measurement.

## Initial integration measurements

The [performance plan](../baseline/milestone-forty/performance-plan.json) was
written before timing. [Both complete runs and all samples](../evidence/milestone-forty/initial-delayed-performance.json)
compare the retained published v0.34 game with the initial v0.35 integration.
The 180 previous runtime files and 992 unrelated host files are unchanged.
The measured packages, source graphs, helper and plan are hashed. The initial
v0.35 installation is now a retained control; all three mutating combat harnesses
reject its game, tooling and source/runtime junction aliases (12 checks).

The machine is an Intel i9-10900K running Windows x64 and Node 24.9.0. Each run
has eight warmups and 25 samples per graph per workload, with rotating order.
Every trial and both runs have identical observed outcomes. Setup, forced GC
and receipt construction are excluded from timing. An interrupted attempt
produced no complete receipt; its partial log was retained and excluded, and a
complete replacement run is included. These are desktop measurements, not
Steam Deck/mobile acceptance or rendered FPS.

| Workload | Calls per sample | Median CPU change, run 1 / run 2 |
| --- | ---: | ---: |
| Empty queue | 131,072 drains | +30.6% / +33.3% |
| 32 waiting entries | 16,384 drains | +34.2% / +38.0% |
| Sparse delivery, 128 actors | 2,048 bursts | −2.0% / −2.2% |
| Dense delivery, 64 actors | 2,048 bursts | +2.2% / +0.2% |
| Dead/untargetable/tier filtering, 64 actors | 2,048 bursts | −1.0% / −1.4% |
| Authored contacts, 0.25-second batches | 2,048 contacts | −1.0% / −1.0% |
| Authored contacts, 0.75-second batches | 2,048 contacts | −1.0% / +1.2% |
| Quiet World, 16 actors | 600 frames | +1.0% / +1.0% |
| Casting World, 32 enemies | 600 frames | +0.4% / −1.8% |

Positive changes mean more CPU time. The empty-queue difference is about
4.2–4.5 nanoseconds per drain; the waiting-queue difference is about 19–21
nanoseconds per drain. The quiet-frame difference is about 0.0034 milliseconds
per frame. These are derived batch averages, not individually timed calls.
Busy-workload differences are small and include run-to-run variation; they do
not establish a general speed improvement. The safeguards remain enabled.

Delivery courses drain sixteen prebuilt waves of 128 effects, assigning each
inactive queue before the native drain. Contact courses use the unchanged
Sanctified Strike and three authored grants, seeded native hit rolls and manual
clock advancement. They reach peaks of 191 and 129 entries; the earlier
195-entry discovery used fixed successful rolls. They do not model normal cast
pacing. The separate casting course uses actual `useSkill` and `World.update`,
accepts eight casts, reaches 18 pending effects, and includes a quiet tail that
drains them. Native body separation and other frame work remain active.

Seven rotating paired heap samples at each of 8,192 and 32,768 entries measure
the pending queue while keeping its World alive. Warnings are released before
measurement; clearing the queue then releases the array, positions and retained
payloads. Both implementations retain about 176–178 bytes per entry at these
amplified sizes. This is not normal queue occupancy, total allocation traffic,
peak memory, per-World cost or a mobile memory budget. The results do not justify
introducing a database query, heap, spatial index or fixed-capacity pool into
this ordered, callback-sensitive path. Any optimization must retain this initial
control and pass the cancellation and original-outcome comparisons again.

## Reproduction

After `npm ci`, `npm run reference:prepare` and `npm run reference:install`:

```sh
npm run reference:delayed-effects
npm run test:delayed-package
npm run adapter:delayed-source
npm run adapter:prepare
npm run adapter:delayed -- --location .artifacts/adapter-location.json
```

Preparation creates a fresh disposable game. To inspect an existing installation,
skip preparation and supply its location file; `--faults` is a separate opt-in.

For performance reproduction, retain a v0.34 integrated game and supply its path:

```sh
npm run benchmark:delayed -- --location candidate-location.json --previous-adapter retained-v034-game --validate-only
npm run benchmark:delayed -- --location candidate-location.json --previous-adapter retained-v034-game
```

Run the timed command twice with competing heavy jobs stopped. The harness
checks source/runtime separation and preservation before and after, type-checks
its helper, and saves all samples and input hashes in a fresh artifact directory.
`--comparison-adapter` can add the retained initial v0.35 graph when testing a
later optimization. Validation-only timings and heap readings are diagnostics.

The reference command checks hashes, type-checks the seven helpers, runs the pinned
original and compares exact fixture bytes. It writes diagnostics only under
`.artifacts`; normal verification never regenerates accepted expectations.
These checks establish no device speed, allocation budget, fixed queue capacity,
native-engine support or schema coverage for the remaining effect families.
