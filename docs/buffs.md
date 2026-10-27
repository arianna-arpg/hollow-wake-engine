# Buff lifecycle contract

Milestone 41 starts from forty original observations, captured before the SDK
implementation. The [manifest](../baseline/milestone-forty-one/acceptance.json)
retains four unchanged helpers and fixtures, including their historical discovery
wording. Two original runs, a measured v0.35 installation and an independent final
v0.35 installation reproduce the same bytes. The [v0.36 acceptance record](../evidence/milestone-forty-one/verification.json)
connects the selected runtime, installed comparisons, renderer observations and
preserved managed-game integration. Exact final archive installation is recorded
separately. This remains an alpha capability within an incomplete SDK.

The boundary covers named grants, shared and independent clocks, modifier sources,
event-gated consumption, explicit removal and timer-phase expiry. Recipient and
spatial selection, skill/proc power resolution, next-hit payload execution,
presentation, event processing, frame scheduling and durable saving remain host
responsibilities. This capability does not represent a complete combat engine.

## State and ordering

The runtime borrows an actor's map, records, clock arrays and shared gain queue.
It has explicit synchronous ports for stat publication/removal and a consumption
cue. A standalone caller can supply plain records and a `StatSheet`; engine objects
are unnecessary. No renderer, filesystem, ambient clock, random stream or shared
mutable registry belongs in the runtime.

Every grant, including a capped grant or refresh, attempts to append a gain event
before modifying the map. The shared queue admits at most 64 events. Its full state
does not prevent the buff grant. The definition and tags remain borrowed references.
Shared refresh retains the record and replaces its definition. Independent refresh
retains the first definition and adds application clocks up to the incoming cap.
The presence of a clock array controls expiry, including native mode transitions.

Stat publication reads the current map record and copies each modifier with its
value multiplied by the stack count. Publication follows map/event changes.
Removal deletes the map entry before removing its stat source. Failures preserve
earlier commits; these operations are not transactions. An explicit synchronization
operation can repair a stale source after the host recovers from a failed callback.

The consumption cue runs before subtraction. Nested grants, removals and spends
retain the native captured-record/current-map distinction. Event consumption takes
a shallow map snapshot; expiry uses live map iteration. Nested expiry of the same
actor is rejected before another tick. Calls for another actor may proceed.
Callback nesting is bounded to 64 runtime operations, and expiry visits at most
65,536 records per call. Budget errors retain earlier commits. The guard must clear
after failure so the host can recover.

The host calls expiry at the original actor phase, after charges/conduits and before
statuses. A buff granted later by cast completion starts with its full duration.
World/actor time scaling is already resolved by the host. Expired records retain
their detached native scalar values; deletion is not an implicit record reset.

## Explicit independent-consumption correction

The original independent-stack spend reduces `stacks` without removing clocks.
The recorded synthetic course spends four stacks down to two, then a timer-only
advance restores the count to three. The loaded catalogue's only independent buff,
Deep Carve, does not configure consumption; this is not established ordinary player
behavior.

The [decision](../baseline/milestone-forty-one/independent-consumption-decision.json)
specifies consumption in original application order. Remove the oldest application
clocks, retain survivor order and recompute remaining time after a partial spend.
A timer-only advance cannot restore spent stacks. The original fixture is unchanged;
four expected fields in one diagnostic and two assertions are separately declared.
All 39 other courses, including every authored World flow, must remain unchanged.
Mixed durations, over-consumption and callback replacement require independent
tests before runtime acceptance. This decision does not rebalance per-stack
modifier multiplication or Deep Carve's grant on a completed miss.

## Input and ownership obligations

Typed native definitions retain their additional host metadata. Records must be
plain coherent host state: finite nonnegative clocks, safe integer positive grant
counts/caps, and at most 65,536 clocks per buff. A zero duration or duration scale
is allowed; it expires at the next timer phase. Time steps and spend counts must
be finite and nonnegative; spend counts are integers. Native over-consumption may
leave a negative detached stack count after the active record is removed.

A separate owned-content entry validates and freezes serialized stat-buff
definitions. It rejects unknown fields/accessors, unsupported modifiers,
nonfinite values and excessive collections before runtime mutation. Spatial/payload
metadata is not silently implemented by that compiler. Typed borrowed content is
an explicit host-trust boundary, not a serialized-content validator. Persistence
remains host-owned; live maps are not a validated save format.

Sinks return `undefined` and must complete synchronously. Ports and borrowed state
must not be replaced asynchronously during an operation. Proxies, accessor-based
records and instrumented clock-array methods are outside the borrowed-state
contract; controlled queue/cue callbacks in the fixtures are separately exercised.

## Standalone API

Import `BuffRuntime` from `@hollow-wake/engine/combat/buffs` and
`compileBuffDefinition` from `@hollow-wake/engine/combat/buff-content`.
Both are optional entries. The timer runtime has no imports; the compiler uses
the shared stat validation outside the simulation loop. The two new modules have
an 18 KiB combined unminified JavaScript allowance. The
[size decision](../baseline/milestone-forty-one/size-budget-decision.json) retains
the previous 500 KiB allowance for existing runtime modules and 96 KiB for the
core; adding the optional buff allowance gives a 518 KiB total ceiling. Every
previous module-specific limit remains unchanged. This accounts for added
capability without treating code size as a CPU or allocation measurement.

`grant(owner, definition, durationScale?, chainDepth?, tags?)` retains native
definitions and tag identity. `consume(owner, id, count?)` spends directly;
`spend(owner, event, tags?, skillId?)` applies event gates. `advance(owner, delta)`
belongs at the host timer phase. `remove(owner, id)` removes an active buff and
`synchronize(owner, id)` explicitly republishes or removes its source.

Supply synchronous `publish`, `removeSource` and `release` callbacks. The optional
`consume` callback preserves a host's instrumented method dispatch and must call
through to the same runtime. A frozen copy of the supplied port table fixes its
callbacks at construction. Use the same runtime for all operations on its owners
so callback guards remain effective. See the [plain-record example](../examples/buffs.mjs).

The compiler accepts stat modifiers plus duration, stack settings, consumption
gates and an optional label. Tags and skill lists preserve order, including empty
lists. An omitted `consumeOnUse.tags` means every completed use. Modifier and link
source ids must exist in the supplied `StatRules`. Limits are 4,096 modifiers,
256 entries per tag/skill list, 256 characters per id/tag and 1,024 per label.
It owns and freezes every accepted object/array without freezing the input.

Borrowed scalar validation after a gain-queue callback can fail with that event
already committed. Likewise, native mode transitions retain their recorded
scalar/clock mismatches; the spending correction does not normalize those prior
transitions. The owned compiler is the ingress path for serialized content, while
native typed callers retain responsibility for coherent host records and metadata.

## Verification and optimization

The [game adapter contract](../baseline/milestone-forty-one/adapter-contract.json)
guards all five methods, the complete timer method and native state/definition
shapes before integration. Each actor creates its runtime on first use. Actors
with no buff history avoid runtime allocation during empty timer/consumption
checks; restored nonempty maps initialize the runtime when they advance. The
shared port table contains immutable callbacks, while state remains actor-owned.

The binding preserves native stat publication, release cues and instrumented
`consumeBuffStacks` dispatch. The existing `syncBuffSource` method becomes public
for explicit recovery after a failed stat callback; all other method signatures
retain their original visibility and parameters. No compiler check is disabled.
The integration removes the two cue imports that moved into the binding and
retains every unrelated actor member and timer statement.

`npm run adapter:buff-source` checks source rejection/preservation with both line
ending styles. `npm run adapter:buffs -- --location <location.json>` compares an
installed adapter read-only by default. Explicit `--faults` requires a disposable
candidate; retained controls, source/runtime aliases and linked target files are
rejected. The game preparer stores each package archive in its own tooling folder,
so preparing another candidate cannot overwrite an earlier archive of that version.

The [renderer baseline](../baseline/milestone-forty-one/buff-ui-acceptance.json)
retains fourteen observations from two byte-identical original runs, frozen before
the adapter comparison. The installed adapter matches every recorded field,
including instrumented global random draw counts. Unchanged War Cry, Deep Carve
and Flame Imbuement definitions run through native admission/casting and real 25 ms frames. Synthetic
pilot input and dispatched canvas mouse events exercise casting and hover handlers.
Resource/rate overrides, a safe sheltered arena and a stationary unarmed target are
explicit test setup. Every instrumented game and paint method calls through.

Visual review of the first comparison found variable weather outside the recorded
buff fields. An explicit [environment revision](../baseline/milestone-forty-one/buff-ui-environment-decision.json)
sets the synthetic arena's native sky exposure to sheltered. Two revised original
runs preserved every accepted observation byte before the revised adapter comparison;
the expected file and all assertions remain unchanged. This constrains the fixture,
without changing production weather or claiming whole-image equality.

The course checks full duration at grant, pause/slow progression, independent stack
expiry, tagged consumption, native stat values, actual hover text and stack pips,
and stored/release glyph drawing. It retains native per-stack wording and the
48-to-40 added-fire transition after spending one of six eight-point stacks.
Observations round numeric fields to six decimals. Screenshots were inspected;
the byte comparison covers recorded observations, not every pixel. This is a local
Windows software-renderer course, not physical-input or hardware-performance evidence.
Run `npm run adapter:buff-ui -- --game <game> --dist <build> --electron <executable>`
against a build made with `scripts/build-game-item-ui.mjs`. The verifier checks
source, installed package and bundle identity and never rewrites the baseline.

`npm run reference:buffs` replays the unchanged original. Normal verification never
regenerates accepted fixtures. The source record captures five methods, the exact
timer loop and its neighboring statements. The adapter must guard these regions
before delegating them.

The runtime uses stable in-place clock compaction in place of repeated interior
splices, preserving array identity, surviving order, publication timing and detached
values. The initial comparison against retained v0.35 is recorded below; it does
not establish a general speed improvement. Steam Deck, mobile and native-engine
compatibility remain unverified.

The [performance plan](../baseline/milestone-forty-one/performance-plan.json)
freezes thirteen native workloads and six retained-memory cases before timing.
They cover never-used and previously-used actors, live clocks, refresh/grants,
tagged consumption, expiry and full World frames. Deep Carve's authored cap is
twelve; grants at that cap do not refresh its clocks. A separate 4,096-clock
case stresses partial expiry and does not represent normal gameplay occupancy.

`npm run benchmark:buffs -- --location <location.json> --previous-adapter <v0.35-game>`
compares isolated installed graphs without writing their source or packages.
Use `--validate-only` to check receipts and released-Actor witnesses without
recording timing or memory results. After optimization, pass the retained initial
installation as `--comparison-adapter <initial-game>`. The helper and plan hashes
must match. Timed comparisons require two independent runs with different initial
`--order` values and no competing build, verification or renderer work.

The consumption workload records intermediate damage values and stacks, alongside
native callback counts and final state. Retained-memory batches include Actor and
stat state with warmed query caches; they measure neither allocation volume nor
peak memory. Independent consumption's intentional behavior repair is covered by
correctness checks and excluded from equal-work comparisons with the original.

Two [initial comparison runs](../evidence/milestone-forty-one/buffs-initial-performance.json)
retain all 1,300 timed samples and 168 retained-heap observations, with matching
canonical receipts. Shared refresh medians are 41.6–51.2% above the original;
capped independent grants are 18.9–27.1% above. Used/active Actor batches retain
approximately 240 additional bytes per Actor, while never-buffed batches show no
consistent increase. These are costs to investigate before milestone acceptance.

Several timer, consumption and frame rankings reverse between runs, so those
measurements do not establish a stable speed ranking. The synthetic partial-expiry
case improves 81.8–84.6%; that result cannot stand in for ordinary gameplay benefit.
The report includes both orders, all raw observations and the measurement limits.

The [reentry-storage candidate](../baseline/milestone-forty-one/optimization-plan.json)
replaces the per-runtime WeakSet with a current-owner record and a temporary,
bounded ancestor array for nested calls. Five additional behavior/collection cases
pass on both implementations. The candidate passes 558 SDK tests, 29 runtime fault
probes, 22 installed faults and the unchanged native renderer observations.

Its [two three-graph comparisons](../evidence/milestone-forty-one/buffs-reentry-performance.json)
retain 1,950 timing samples and 252 heap observations. Used/active Actor graphs
retain about 96 fewer bytes than the initial extraction: added overhead falls
from about 240 to 144 bytes per Actor. That is 40% less added overhead, below 1%
of the full measured Actor graph. Never-buffed medians remain unchanged.

CPU results remain mixed. Shared refresh costs 33.1–39.0% more than the original,
capped grants 11.9–18.3% more, and independent live timers approximately 11% more
in these runs. The prior order-sensitive observations are still retained. All
graphs share a process and instrumented call sites; those measurements cannot
establish an overall speed improvement for an uninstrumented installed game.
Deep callback nesting is checked for behavior and owner collection, not timed.
Final archive and managed-game acceptance are recorded separately;
physical-device validation remains pending.

The subsequent [live-clock experiment](../baseline/milestone-forty-one/timer-optimization-plan.json)
deferred compaction bookkeeping until a clock expired. Four additional tests cover
510 expiry-position combinations, a shared refresh over independent clocks, a
surviving prefix containing the longest duration, and empty-clock removal. They
passed on the preceding implementation before the experiment and remain in the
suite. [Diagnostic profiles](../evidence/milestone-forty-one/buffs-timer-profile.json)
and their separate input plan are retained; profiler elapsed times are not accepted
performance measurements.

The [adoption criteria](../baseline/milestone-forty-one/timer-adoption-criteria.json)
were committed before comparative timing. Both target-workload medians had to
improve at least 3%, with limits on repeated regressions and retained memory.
The [two complete comparisons](../evidence/milestone-forty-one/buffs-timer-performance.json)
record 1,950 timing samples and 252 heap observations. Live-timer medians were
2.27% and 2.11% below the reentry implementation, so the
[decision](../evidence/milestone-forty-one/buffs-timer-decision.json) rejects the
extra code. No additional trials were run to seek a passing ranking.

The [restored implementation](../evidence/milestone-forty-one/buffs-restoration.json)
passes 562 SDK tests and 31 buff faults. All 189 runtime outputs match the retained
reentry implementation, including declarations and source maps. The four added
tests, rejected candidate, raw samples and diagnostic profiles remain available.
The measured approximately 96-byte reduction in added retained cost is preserved.

The [boundary-cost decision](../evidence/milestone-forty-one/buffs-boundary-cost-decision.json)
records the remaining overhead across all four selected-runtime comparisons:
33.1–40.8% for shared refresh and 11.9–21.9% for capped independent grants.
These correspond to roughly 1.62–1.92 ms and 1.00–1.71 ms extra per batch of
8,192 grants on the measured desktop. Independent live timers remain 11.0–12.0%
above native in these comparisons. Different third graphs and shared-process
instrumentation prevent pooling the runs into a general speed claim.

Those costs are accepted explicitly for this alpha boundary, preserving live
definition observations, callback order, publication and bounded work. Further
optimization remains subject to allocation, whole-frame and device measurements.
Final archive and game integration evidence is linked above. The broader SDK
completion requirements remain open.
