# Buff lifecycle contract

Milestone 41 starts from forty original observations, captured before the SDK
implementation. The [manifest](../baseline/milestone-forty-one/acceptance.json)
retains four unchanged helpers and fixtures, including their historical discovery
wording. Two original runs, a measured v0.35 installation and an independent final
v0.35 installation reproduce the same bytes. Implementation acceptance is pending.

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

`npm run reference:buffs` replays the unchanged original. Normal verification never
regenerates accepted fixtures. The source record captures five methods, the exact
timer loop and its neighboring statements. The adapter must guard these regions
before delegating them.

Stable in-place clock compaction is a candidate replacement for repeated interior
splices. Preserve array identity, surviving order, publication timing and detached
values. Benchmark it against the retained v0.35 graph only after equivalence and
independent invariants pass. No speed, allocation-volume, Steam Deck, mobile,
renderer or native-engine compatibility claim follows from the current baseline.
