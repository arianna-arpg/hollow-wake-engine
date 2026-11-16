# Milestone five: composed performance qualification

This milestone keeps the combat/Inventory boundary. Quests, campaigns, accounts,
world generation and persistence remain optional or supplied by the host. No
changes are made to either game checkout. Physical Steam Deck and older mobile
hardware were unavailable; the authorized delivery is desktop measurement plus
a portable runner, with device qualification explicitly deferred.

## Reproduction and acceptance

The reference platform is Windows 10.0.19045, Intel i9-10900K, 64 GB RAM and Node
24.9.0. Scripted courses use seed 711; courses using the imported reference scene
retain its fixed seed 71, with seed 711 for additional Inventory item rolls.
The workload uses 1/60-second steps, 120 warmup steps and
600 measured steps for each combat course. Non-combat courses use five warmup
operations and 30 measured operations. Native encounter bodies have deliberately
high resources and scripted inputs; this is repeatable simulation load rather
than autonomous enemy AI or a renderer.
Reference-host frame construction is included. JSON wire encoding, socket
transport and the Godot client are outside these timing budgets; their functional
editor/exported-player verification is recorded separately.

The courses cover 32 and 128 actors with authored mixed skills/statuses, a
32-actor proc/summon course that grows to 96 bodies, a live character with
equipment/support/passive investment, character creation, populated Inventory
with 24 additional rings and their item cards, three preview/apply build edits,
and repeated character/combat creation and release. Default storage is memory.

The published milestone-four composition at `e8c56b39` is preserved as one
3.56 MiB compressed benchmark bundle under `baseline/combat-performance`, with
its source commit, package hashes and uncompressed digest. This is a prior SDK
comparison, not a replacement original-game oracle. Accepted original fixtures
remain unchanged. The baseline and candidate run the same workload and runner
in the same Node version; exact per-operation traces, final state, RNG draws and
work counts must match. Six negative controls detect missing courses, shortened
clocks, missing casts/procs, changed frames and changed continuation.

`npm run test:combat-performance` builds an isolated installed consumer and
checks the frozen baseline without timing gates. It is part of `npm run verify`.
Temporary installations, caches and decompressed comparison files are removed
in `finally`, including failures. The browser acceptance uses the existing
Chromium/Electron tool; it neither downloads a browser nor keeps its profile.

Numerical desktop budgets and the first measurements were recorded before
runtime optimization in `evidence/combat-inventory-milestone-five`. Timing uses
seven alternating fresh-process pairs. Profiling and forced-GC memory courses
run separately, with no concurrent heavy verification during timings. Reports
retain operation median/p95/p99, CPU totals, setup/content import, allocation
estimates, retained heap and process peak RSS. V8 allocation sampling includes
setup and warmup; it is not an exact native-allocation count. Operation timings
exclude setup; CPU totals include setup performed between sampled operations.

## Measured changes

Stat sheets keep cached values when changed conditions or gauges are unrelated
to their owned modifier sources. Revisions still advance, extra modifiers remain
uncached, and links/trades invalidate when any referenced input changes. Plain
stat reads use stable identifiers directly, in a separate cache namespace with
the same combined capacity limit. Tests compare against an uncached evaluator
through changing conditions, gauges, sources, links, trades, forks and hostile
stat names.

The character browser-size gate exposed a 105-byte overrun during verification.
Invalidation now scans each source-reference set once instead of enumerating
both old and new inputs. The original 256 KiB ceiling is unchanged; the final
minified character composition is 262,139 bytes. This leaves little size headroom
and is a packaging constraint, not a license to increase the budget silently.

There is one explicit raw-package tradeoff: the stat cache has a separate maximum
2 KiB code-growth allowance over milestone four. Its previous `stats.js` was
11,941 bytes, SHA-256
`eae2c8a50887fb33956819973d3fdae73cb8086046aa84722749f517850863c7`,
read directly from the preserved 0.62 archive. Only actual growth of that module
is attributed to the new allowance; the historical gates still constrain all
other code. The browser ceiling and frozen performance budgets are unchanged.

Each combat owner retains the ordered charge catalogue enumeration when its
query catalogue is frozen. Mutable custom catalogues keep live enumeration.
The private enumeration is not published to hosts. Keeping its internal rows
ordinary arrays avoids V8 iterator allocations observed with frozen row arrays;
the underlying authored definitions remain frozen. No charge phase is skipped.

The reference scene shares its immutable validated character/item catalogue.
Character investment, random streams, item identity allocation and combat state
remain separate for every scene. The Node adapter reuses the detached hero view
already captured for the frame rather than making three redundant inspections.
Possession and retired-body fallback behavior remain covered.

These changes preserve the editable-content/compiled-runtime architecture.
The profiles do not justify introducing SQL into per-hit or per-frame execution.
The 128-actor course remains a stress tier: its tail latency leaves less room for
rendering and host physics than the ordinary 32-actor tier. Build edits are
synchronous user actions and should not be scheduled repeatedly every frame.

## Desktop results

Seven alternating fresh-process pairs passed the frozen budgets. These are
median-of-round percentiles in milliseconds, with exact trace/state/work-count
agreement. They do not measure full-game FPS.

| Course | Before median | Final median | Final p95 | Final p99 |
| --- | ---: | ---: | ---: | ---: |
| Mixed combat, 32 actors | 0.913 | 0.647 | 2.419 | 3.774 |
| Mixed combat, 128 actors | 3.281 | 2.287 | 8.795 | 13.213 |
| Procs/summons, 32 to 96 bodies | 2.359 | 1.808 | 3.657 | 6.231 |
| Live build plus 32-body combat | 0.985 | 0.731 | 2.393 | 3.799 |
| Character creation | 2.220 | 2.199 | 2.635 | 5.411 |
| Inventory plus 24 rings/cards | 6.385 | 6.266 | 7.020 | 7.599 |
| Three previews + three edits | 54.595 | 53.687 | 55.327 | 55.903 |
| Create/step/close/release | 17.131 | 17.345 | 21.281 | 21.452 |

Cold content import was 851.4 ms before and
1273.1 ms after, within the 1,500 ms ceiling.
The shared catalogue's eager validation accounts for this startup tradeoff.

Peak process RSS across the full memory course was
910.0 MiB before and 469.3 MiB after
(the ceiling is 512 MiB). This is a cumulative process peak across these courses,
not an isolated combat-memory or full-game footprint. The largest positive
post-collection retained-heap increase across the five-repeat courses was
0.054 MiB.

The separately sampled 128-actor course allocated approximately
21.6% fewer V8 bytes, meeting the 20% reduction goal.
Those totals include setup, warmup and observation. Large allocation savings
in reset-heavy build/Inventory courses must not be mistaken for equivalent
reductions in the timed edit latency shown above.

The 1,000-cycle create/release probe retained
435.2 KiB after collection, below its 4 MiB ceiling,
with the same trace as the baseline and no active-resource growth.

The retained component benchmark is a smaller selected damage kernel. Its
speed ratio is not a composed-combat or whole-game speed ratio. Complete paired
raw samples are in the compressed evidence archive; the individual final
profile, memory and lifetime reports retain their environment and manifests.

## Portable runner

Build with `node scripts/build-combat-benchmark.mjs --out <new-directory>` after
the normal SDK build and pinned-reference preparation. To reuse a packaged
reference distribution, add `--distribution <reference-directory>`. The output
has no runtime imports and needs no npm install, source checkout, account service
or Internet connection to run. Its README documents desktop/Linux/Steam Deck Node
commands and a local browser page for phones/tablets with ES2022 support.

For paired measurements, use the included `compare.mjs` with two runner folders,
`--baseline`, `--candidate`, and a new `--out` directory. Timings alone do not
establish whole-game frame rate, battery use, sustained thermals or device
compatibility. Browser timings use the same workload but expose timer-resolution
limits and do not invent unavailable memory/allocation measurements.

The original comparison runner can be reconstructed from the committed capsule:

```sh
node scripts/build-combat-benchmark.mjs --baseline baseline/combat-performance --out .artifacts/perf-before
node scripts/build-combat-benchmark.mjs --out .artifacts/perf-after
node tools/combat-performance/compare.mjs --baseline .artifacts/perf-before --candidate .artifacts/perf-after --out .artifacts/perf-pairs --budgets evidence/combat-inventory-milestone-five/budgets.json
```

All three output directories must be new. The builder checks both compressed
and decompressed baseline hashes and refuses a changed workload definition.
The paired runner disables Node's disk compile cache for comparable cold imports.

The interruption during this milestone left one incomplete trial profile.
Its invalid JSON was rejected; completed source and baseline hashes were
rechecked, and profiling restarted in new report files. Preliminary trials are
not substituted for the final paired acceptance.

Final measurements and verification are recorded in the adjacent evidence
directory. Milestone six remains the bounded packaging/release walkthrough;
additional campaign/save systems and additional complete engine ecosystems are
not hidden requirements of this milestone.

## Qualification boundary

The measured Inventory course has 24 additional rings, not the 64/256-item
exploratory cases in the initial matrix. The timed build-edit course covers
equipment, supports and passives. Vocation, Reliquary and awakening interactions
retain their original-game correctness coverage, but are not individually
timing-qualified here. The matrix preserves those wider measurement ideas as
unqualified follow-up cases. This milestone qualifies only the named representative
operation envelope, not every possible build, item population or content family.

The whole-content import and process peak are reported alongside combat speed.
Sharing the validated immutable scene catalogue moves validation into module
initialization; that setup cost must not disappear from the result. These figures
are not a rendered frame-time budget or an assurance that the full content pack
fits every older device. The portable package provides the next measurement on
actual target hardware without importing campaign or account infrastructure.
