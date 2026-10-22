# Actor gauge publication

`ActorGaugePublisher` is an optional service from
`@hollow-wake/engine/stats/gauges`. Create a publisher for each independently
owned stat-gauge slot. `refresh(source, sink)` returns whether it synchronously
published a complete replacement. It borrows source maps and arrays without
mutating or retaining the source actor.

The sampling order is positive status stacks, charges, rounded brim pips,
reserve pips, then derived gauges. Status/charge/brim/reserve keys receive
their respective prefixes; derived keys are already authored gauge names.
Only brim fill is quantized, with `Math.round(fill * 5)`. Hosts supply coherent
finite counts and remain responsible for integer-valued gauge semantics.
Zero/negative values are omitted. Duplicate entries retain their order; the
sink retains its own duplicate-resolution policy.

Exact comparison includes source kind, identifier, value and order. Stable
samples build neither publication arrays nor new prefixed keys. Changed
samples allocate detached tuples for the sink; those tuples never alias the
publisher's comparison cache. A compact comparison array is created only for
positive entries, trimmed to the current count and released when empty.
Map iteration and garbage-collector allocations still require
measurement; this is not a zero-allocation claim.

The publisher remembers the actual sink identity. A replacement stat sheet
receives a full publication even when values are unchanged. It has exclusive
ownership of that sink's gauge slot: after external writes, call `invalidate()`
to force the next publication. `reset()` releases the comparison cache and the sink
reference. Neither operation modifies an actor or immediately writes a sink.

Sampling and `setGauges` are synchronous. A source or sink exception propagates
and invalidates the cache for retry on the next refresh, including after partial
sink application. No automatic rollback or scheduled retry is promised. Reentry
is rejected before reading the recursive source. Reset during a refresh is
rejected. Invalidation during a callback requests another publication on the
next refresh, even if the current callback succeeds. Source writes during the
callback become visible on the next sample; the callback receives the values
already sampled for the current publication.

## Intentional correction and preserved timing

`gauge-namespace-refresh/v1` corrects the original raw-id fingerprint omission.
Swapping a Communion charge for an equally sized brim gauge now updates the
namespaced values at the next existing sampling opportunity. The independent
diagnostic requires damage 5 from the current brim, instead of stale damage 2
from the spent charge. Historical original fixtures remain unchanged.

The Hollow Wake adapter replaces the gauge block inside `refreshConditions`
and gives each actor its own publisher. Condition-mask computation, condition
events and `condSheet` handling remain in place. World decay still occurs
later in the frame. A decay-induced pip change therefore affects the stat sheet
at the next sample, preserving the original timing.

The initial failure/reentry policies above define the new host-independent
boundary; successful native calls did not establish them. Focused tests cover
them independently. Installed comparison, fault detection, broader regression
and hardware acceptance remain distinct release requirements.

## Measured cost

Two controlled desktop Node runs compare the frozen original, retained v0.30,
the first exact-cache implementation and the compact cache directly. The compact
cache saves 205–209 retained heap bytes per populated actor and about 30 bytes
per empty actor versus the first implementation. It still costs 722–724 extra
bytes per populated actor and 80 per empty actor versus v0.30. This is an
explicit cost of exact cached observations, not a claim of lower memory than
the original fingerprint approach.

Median empty, stable-populated and changing sampling times are respectively
60–64%, 55–57% and 34–37% lower than v0.30 in those workloads. The quiet full
world-update case changes direction against the first exact-cache version;
no general frame-rate improvement follows. Each sample checks equal gameplay
receipts, with the namespace correction exercised separately by its diagnostic
courses. See the [measurements and decision](../evidence/milestone-thirty-six/benchmark-decision.json),
including the retained initial source needed to reproduce the comparison.

Memory samples retain 1,024 real actors after forced collection. They do not
measure allocation volume, collection cost, peak process memory or a device's
memory budget. These desktop observations are not Steam Deck or mobile acceptance.
