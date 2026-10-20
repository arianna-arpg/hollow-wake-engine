# Performance targets and measurement

Steam Deck is the primary device target. Older phones and tablets are the
stretch target and a design constraint against unnecessary allocation, loading
and background work. Their actual CPU/memory limits require on-device measurements.

## Current design

Authored content is validated once and may be shared immutably. Skill-local
modifiers, tag contexts and damage coefficients compile when a build changes.
Repeated contacts reuse compact typed numeric arrays. The full exported stat
catalogue remains in baseline evidence; the shipped sample contains only the
definitions needed by its capability and selected content.

Each engine reuses a bounded scratch buffer and retains no hit history.
Stat value caches are bounded, and attack plans are weakly held. The API returns
one receipt per requested contact; it does not claim zero allocation.

A relational database is not assumed to improve in-memory combat math.
Future authoring/storage changes must preserve stable content ids and validated
schemas. Profile content loading and lookup before choosing a database, columnar
catalogue, native storage or additional indexes.

## Reproduction

After preparing the original reference:

```sh
npm run benchmark
```

Run with other CPU-heavy work stopped. The benchmark uses the same selected build,
seed, target resistance and number of contacts in one process, warms both paths,
alternates execution order over seven rounds and verifies damage checksums.
It records raw samples, Node version, CPU model and compile time.

The original path includes dormant full-game hooks and presentation bookkeeping.
The SDK implements the smaller declared contact capability. The measured ratio
does not establish how much faster the full game or a complete extraction will be.
There is no rendering, movement, status ticking or UI in this workload.

The retained report is `evidence/contact-benchmark.json`. Later runs write
`.artifacts/benchmark.json`; do not overwrite accepted evidence merely to get
a better number.

The initial retained Windows/Node 24 run on an Intel i9-10900K measured a median
5.91 ms for 20,000 extracted contacts and 632.16 ms for the original path.
All seven rounds produced matching damage checksums. Content validation took
2.09 ms; per-round build setup is recorded separately. These are local workload
observations, not a device guarantee or a whole-game speedup. Startup and the
smallest timings are particularly sensitive to runtime warmup and machine load.

## Gates and follow-up workloads

| Area | Current gate or planned experiment |
| --- | --- |
| Stable loadout | Exactly one attack-plan build across an unchanged hit sequence |
| Correctness | Equal reference outputs, RNG consumption and benchmark checksums |
| Context churn | Default 256-entry stat cache bound; test 10,000 distinct contexts |
| Package | 96 KiB JS and 64 KiB selected-content ceilings for this first slice |
| Startup | Record validation/compile cost separately from steady-state contacts |
| Steam Deck | Provisional target: 1,000 simple contacts within 1 ms on one core; unverified |
| Build editing | Measure equip/respec and derived-state rebuilding on larger real builds |
| Sustained simulation | Add 100/500/1,000 actors with statuses, projectiles and summons after their extraction |
| Memory | Measure retained memory and allocation profiles under long-running churn |
| Mobile | Repeat on named older devices; track thermal throttling and sustained pacing |
| Native integration | Measure batched calls, serialization and embedding/native-runtime overhead |

The target is dependable headroom for real gameplay. No absolute-optimality claim
is possible from one machine or a small arithmetic workload.

## Milestone-two sustained lifecycle workload

`npm run benchmark:lifecycle` runs each 100/500/1,000-actor workload in a fresh
process, warms 300 frames, then measures 1,200 frames at a fixed 1/60 s step.
Each actor has a distinct character/stat cache, casting state, strongest-wins
effect and plain target. Five speed groups produce bursty completions. Casts
use synthetic zero costs to sustain the workload; resolved effect applications
are supplied by the host. Spatial simulation and rendering are excluded.

The retained desktop i9-10900K/Node 24.9 run measured:

| Actors | p50 frame | p95 frame | Worst sampled frame | Retained heap above pre-setup |
| --- | --- | --- | --- | --- |
| 100 | 0.014 ms | 0.088 ms | 0.231 ms | 2.87 MiB |
| 500 | 0.051 ms | 0.413 ms | 1.271 ms | 12.14 MiB |
| 1,000 | 0.107 ms | 0.794 ms | 1.730 ms | 23.63 MiB |

The measured loop rebuilt no unchanged plans. Retained growth after forced GC
was below 35 KiB per workload; the test permits at most 2 MiB. This measures
retention, not total allocation, peak process memory or a guaranteed lack of
GC pauses. Press/completion events, snapshots and contacts allocate; idle casting
and effect ticks avoid creating receipt/history objects. A native allocation
profile and thermal/on-device tests are still needed.

Keep these as provisional **on-device goals**, not achieved results: Steam Deck,
1,000 actors under 2 ms p95 for this workload and 32 MiB retained state; a named
older phone/tablet, 100 actors under 1 ms p95 and 8 MiB retained state. The phone
model and runtime must be chosen before that target can be verified. Share
immutable definitions, avoid frame-by-frame serialization and measure bridge
overhead independently. A database migration is not justified by this workload.

Raw evidence: `evidence/milestone-two/lifecycle-performance.json`. Each count
has its own process so discarded previous workloads cannot distort heap deltas.
