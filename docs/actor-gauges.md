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
Status stacks and reserve pips may be absent (`undefined`); those records are
omitted, matching sparse records in the original admission scenarios. Present
nonfinite counts still throw. Zero/negative values are omitted. Duplicate entries retain their order; the
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

Two controlled desktop Node runs compare the corrected compact cache with the
frozen original, retained v0.30 and the initial row cache. The corrected cache
saves 208.1 retained heap bytes per populated actor and 30.6 per empty actor
against that initial implementation. It still costs about 717–721 additional
bytes per populated actor and 80 per empty actor against v0.30.

Median empty, stable-populated and changing gauge-sampling times are respectively
62–65%, 55–56% and 35–37% lower than v0.30 in these workloads. The quiet native
world-update case is about 2% faster than v0.30, but 2–3% slower than the initial
row cache and 4–14% slower than the frozen original. These are explicit costs
and do not establish a general frame-rate improvement.

Each run checks equal gameplay receipts. The original bank/gauge fixtures,
separate namespace correction and sparse-count addendum are verified outside
the timing loop. The initial implementation remains a reproducible comparison
control; the repaired runtime has its own complete verification and measurements.

See the [corrected measurements and decision](../evidence/milestone-thirty-six/compatibility-repair/benchmark-decision.json).
The [earlier compact measurements](../evidence/milestone-thirty-six/benchmark-decision.json)
remain historical evidence; the sparse-count repair was measured separately.

The [original-only sparse-count addendum](../baseline/milestone-thirty-six/absent-counts-acceptance.json)
records two courses and ten transitions before the repair. Existing fixtures
and the six-case namespace decision remain unchanged. Memory samples retain
1,024 real actors after forced collection; they do not measure allocation volume,
collection cost, peak process memory or a device memory budget. These desktop
observations are not Steam Deck or mobile acceptance.
