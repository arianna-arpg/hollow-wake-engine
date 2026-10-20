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
