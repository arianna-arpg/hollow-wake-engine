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

A separate owned-content entry will validate and freeze serialized stat-buff
definitions. It must reject unknown fields/accessors, unsupported modifiers,
nonfinite values and excessive collections before mutation. Spatial/payload
metadata is not silently implemented by that compiler. Typed borrowed content is
an explicit host-trust boundary, not a serialized-content validator. Persistence
remains host-owned; live maps are not a validated save format.

Sinks return `undefined` and must complete synchronously. Ports and borrowed state
must not be replaced asynchronously during an operation. Proxies, accessor-based
records and instrumented clock-array methods are outside the borrowed-state
contract; controlled queue/cue callbacks in the fixtures are separately exercised.

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
