# Content-owned item affix index experiment

The set-based candidate is **rejected for promotion**. This experiment leaves
production sources, published content and all 201
production build outputs unchanged. Its isolated candidate prepares an affix
membership index when immutable item content is loaded. Promotion requires the
predeclared correctness, timing and memory gates; device and milestone 43
acceptance remain separate.

## Observed cost and proposed change

Diagnostic CPU profiles of the existing JSON host identified repeated full
affix-catalogue scans in inventory work. The catalogue contains 3,929 affixes,
11,419 tag postings and 79 bases. The startup profile instead emphasized copying,
freezing and validating content. The combat profile was too sparse to support
fine-grained conclusions. Profiles use the official
[Node inspector CPU profiler](https://nodejs.org/download/release/v24.9.0/docs/api/inspector.html);
sampling overhead and sample counts prevent treating these profiles as timing
acceptance results.

The first candidate built a lazy index per generator. It passed the SDK suite
and ordered-pool comparisons, but ownership review found that every generator
would repeat the same immutable postings. It remains a recorded, untimed
alternative. The second candidate puts compact numeric postings on ItemContent,
behind an internal symbol and private fields, and shares them with its generators.
It has no global registry, runtime dependency, database connection or serialized
content change.

Queries merge matching tag postings, restore original registry order, apply
exclusions and return separate prefix/suffix arrays. Missing tags retain the
open-pool rule; empty tags retain their different meaning. Each generator owns
its base-pool and weighted caches, random state and identity allocator. Even
bases with identical tags need separate arrays because their affinity weights
can differ. Direct internal callers retain a lazy fallback.

This is a small data-oriented preparation step. It does not select a database
for authoring, saves or account services, or imply that database queries belong
inside combat processing.

## Proof and measurement boundaries

The candidate is compiled into a separate directory. A recorded loader directs
every current SDK test file to those outputs (850 tests in the original evidence).
The verifier reads the runner's complete totals and requires every test to pass,
with no failures, cancellations, skips or pending tests. Its former fixed count
incorrectly rejected the later 923-test suite despite all tests passing; that
hosted failure and the repaired Set/bitmap comparisons are retained in
`evidence/cooldowns/renderer.json`. This repair does not accept either rejected
optimization or repeat its timing experiment. Test-only pool probes compare
430 ordered queries, including all authored bases and synthetic missing, empty,
duplicate, reserved and excluded tags. Four interleaved owners exercise 1,200
randomly filled items and 36 restores per implementation. Paired bases share
level and rarity while differing in affinity; additional seed pairs confirm
that this difference actually affects selection.

C++ and C# consumers replay the same 60 original session requests through both
bundles, checking full responses and native ownership/disposal contracts.
The comparison then reuses the verified host-cost workers and their timing
boundaries. Every response and final snapshot must match the baseline.

The plans in `experiments/item-index/content-plan.json` and
`measurement-plan.json` precede timing. They require at least a 10% inventory
median improvement in each host and order. Controls permit at most 5% median
and 10% p95 regression. Eight warmups and 25 retained samples are used; startup
gets separate fresh processes. Eight warmed owners must add no more than 4 MiB
of tracked native live bytes relative to the baseline's owner cost. Content
memory is reported separately, and disposal must leave zero tracked allocations.

The initial workload check caught a harness mistake: ordinary forging does not
randomly fill unspecified affixes. Before timing, forge controls were corrected
to use an explicit legal intelligence affix with random roll quality. Owner
tests separately enable random filling and assert nonempty affixes. The earlier
insufficient owner check and failed untimed workload attempt are retained.

The desktop is not isolated. System CPU observations, all samples and both
orders are retained. These measurements are neither Steam Deck/mobile results
nor whole-game frame budgets. The native counters exclude managed memory,
allocator overhead and process memory; allocation counts omit reallocations.

## Recorded result

All correctness checks passed. The full comparison retained 1,000 measured
batch/checkpoint samples, 320 warmups, 200 fresh-process initialization samples,
64 initialization warmups and two native memory trials. Additional first-forge
timings emitted by startup workers remain in the raw records and are not used
as throughput samples.

Inventory medians improved by 60.1% / 61.0% in the Node host but regressed by
20.7% / 23.7% in the .NET/QuickJS host (forward / reverse order). Native first
forging took 35.42 / 31.92 ms versus 5.00 / 4.80 ms. Several control gates also
failed. The candidate therefore remains isolated; no threshold was relaxed.
Content used 145,437 additional tracked bytes, while eight warmed owners used
678,440 fewer incremental bytes. Both native variants disposed with zero tracked
bytes and blocks. These memory observations do not excuse timing failures.

Ambient CPU observations were 24.0–47.1%, substantially busier than the earlier
host-cost run. Control regressions cannot all be attributed to this algorithm
on that evidence. The large native first-forge regression reproduced in both
orders and motivated a separate diagnostic.

That diagnostic instruments a copy of the bundle with coarse wall clocks and
replays the 60 original requests unchanged. In its second run, three pool
queries spent 64 ms merging membership, 1 ms materializing rows, 3 ms sorting
and 5 ms producing results. This is diagnostic attribution, not acceptance
timing. A model of the hash function in the exact pinned QuickJS-NG source
places the ring's 3,769 numeric row keys into only four of 2,048 buckets, with
1,862 keys in the largest bucket. The model omits common XOR salts, which
permute bucket labels without changing collisions. It is not a native bucket
counter. Together, the diagnostic and source model support testing a bounded
bitmap to replace numeric Set membership. That alternative has not yet passed
the acceptance gates; its separate evaluation and retained control failures are
documented in the [bitmap experiment](item-bitmap-experiment.md).

The machine-readable decision and full raw records are in
[the recorded evidence](../evidence/item-index/windows-set-index.json).

## Reproduce

Use the Windows x64 prerequisites and passing library/session/cost verification
results described in [host costs](embedded-host-costs.md). The source overlay
is deliberately locked to the current v0.38 development sources and refuses
an unreviewed source change.

```sh
node scripts/test-content-index.mjs --library-proof LIBRARY_RESULT --session-proof SESSION_RESULT
node scripts/benchmark-content-index.mjs --verify --candidate-proof CANDIDATE_RESULT --cost-proof COST_VERIFICATION_RESULT
```

Each command creates a fresh result directory and prints it. The matching
`content-index-*-latest.json` file also records that location. Stop local builds
and verification jobs, run the required repository benchmark, then measure the
exact verified inputs:

```sh
npm run benchmark
node scripts/benchmark-content-index.mjs --measure --verification INDEX_VERIFICATION_RESULT
node scripts/profile-content-index.mjs --candidate-proof CANDIDATE_RESULT --amalgam-dir PINNED_RUNTIME_SOURCE
```

The final command is optional, separate diagnostic instrumentation. Hosted CI
runs correctness and untimed controls; it does not accept timing results or
promote this rejected candidate.
