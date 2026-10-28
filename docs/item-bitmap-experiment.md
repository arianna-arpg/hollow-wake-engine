# Content-owned bitmap experiment

This isolated candidate replaces the numeric Set used by the rejected
[item-index experiment](item-index-experiment.md). Production sources, public
entries, content and the 201 runtime outputs remain unchanged. This experiment
does not establish Unity, Godot, Unreal, Steam Deck or mobile support.

## Representation and invariants

Each immutable ItemContent owns one sparse tag-to-row index. A pool query marks
matching rows in a temporary Uint32Array, then visits set bits in ascending row
order. For the current 3,929-affix catalogue, this scratch array has 492 bytes of
payload, excluding its object and allocator overhead. Numeric Set insertion and
sorting are removed; the small set of string-valued base tags remains.

Missing tags, empty tags, explicit pools, category membership, exclusions and
authored order keep their original meanings. Each base and owner still gets its
own result arrays and weighted caches. Random state and identity allocation
remain owner-local. The shared index has no global registry or database access.

This tests a representation change suggested by the preceding runtime profile
and hash-source model. It does not change the pinned JavaScript runtime or assume
that its behavior generalizes to another engine.

## Correctness and measurement contract

The isolated build runs all 850 SDK tests, 430 original pool queries, 1,200
interleaved random item mints and 36 restores per variant. The affinity checks
include 100 paired seeds that distinguish otherwise similar bases. Both C++ and
C# consumers replay 60 original session requests per variant and check disposal.

An additional 197 queries compare directly with the original implementation at
catalogue widths 0, 1, 31, 32, 33, 63, 64, 65, 127, 128, 129, 255, 256, 257,
4,095, 4,096 and 4,097. These cover the signed high bit, word transitions, partial
last words, empty catalogues, exclusions and independent queries.

The timing and memory thresholds in `bitmap-plan.json` are unchanged from the
Set experiment: at least 10% improvement in inventory median for each host and
order; at most 5% median and 10% p95 regression in controls; at most 4 MiB extra
incremental native memory for eight warmed owners; zero tracked disposal bytes
and blocks. Content memory is reported separately. All samples remain in the
record. Native allocation counts exclude reallocations and allocator overhead;
they are not whole-process memory measurements.

The first two timing attempts completed their forward courses and refused to
start reverse courses because CPU preflight observations exceeded 15%. They
remain incomplete evidence, with no acceptance result. Before another attempt,
the protocol was revised prospectively to allow a bounded wait before an order:
three two-second observations must all be at most 15%; otherwise wait 15 seconds
and check again, up to three attempts. The original runner is retained with the
raw evidence. No sample count or timing, CPU or memory threshold was relaxed.
Six deterministic guard tests cover the wait, refusal, limit boundary and
invalid observations. A quiet preflight does not prove isolation during work.

## Recorded result

The third attempt completed both orders: 1,000 measured batch/checkpoint
samples, 320 warmups, 200 fresh-process initialization samples, 64 startup
warmups and two native memory trials. Both CPU preflights passed on their first
observation, with means between 3.4% and 9.9%; the bounded wait was not needed.

Inventory medians improved by 45.2% / 47.1% in Node and 60.2% / 61.1% in the
.NET/QuickJS host (forward / reverse). Native first-forge medians improved by
42.2% / 41.9%. The earlier large native numeric-Set penalty was absent in this
comparison; this is not an attribution of every timing difference to the bitmap.

Two of 24 comparisons failed: forward native steady-forge p95 regressed by
29.3%, while reverse Node first-forge median and p95 regressed by 6.5% and 10.6%.
The candidate is therefore **not accepted or promoted**. The next performance
work must distinguish repeatable control costs from host variability while
retaining these failures and the same acceptance limits.

A subsequent diagnostic compared fresh workers loading the identical original
bundle for the two affected workloads: three pairs in each order, 600 measured
samples and 192 warmups, following two untimed checks. Six of twelve pairs would
exceed the original control limits. Its forward preflight waited twice before
passing; all observations and samples are retained. This demonstrates variation
in this setup, not the cause of the bitmap's failures. The original candidate
decision remains unchanged. There were no managed collection events in the
measured native steady-forge samples; native allocator activity varied and the
available counters do not identify native garbage-collection or scheduling cost.

Content added 146,673 tracked native bytes. Eight warmed owners used 678,440
fewer incremental bytes than the baseline; both variants disposed with zero tracked
bytes and blocks. This passes the memory gate, but does not excuse timing
failures or establish device performance. Milestone 43 acceptance remains open.

The [machine-readable evidence](../evidence/item-index/windows-bitmap-index.json)
includes every completed and interrupted attempt, source hashes, raw worker
records and the prospective protocol revision.

## Reproduce

Use the verified Windows x64 library, session and cost inputs described in
[host costs](embedded-host-costs.md). These commands create fresh directories:

```sh
node scripts/test-content-index.mjs --library-proof LIBRARY_RESULT --session-proof SESSION_RESULT --index bitmap
node scripts/benchmark-content-index.mjs --verify --candidate-proof CANDIDATE_RESULT --cost-proof COST_VERIFICATION_RESULT --index bitmap
npm run benchmark
node scripts/benchmark-content-index.mjs --measure --verification INDEX_VERIFICATION_RESULT --index bitmap
```

Run the required repository benchmark and the measurement with other local
builds and verification jobs stopped. The measurement uses the exact verified
inputs. A busy preflight refuses an order instead of yielding an acceptance
result. Hosted CI runs both isolated implementations and untimed cost controls;
it does not run the timing course. The Set-specific diagnostic profiler is not
used with the bitmap candidate.
