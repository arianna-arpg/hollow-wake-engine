# Empty support admission cost

Version 0.27.1 changes `SupportRules.hostSockets`. It scans the live socket/graft
sequence until it finds a support. If none exists, it returns a fresh empty array
without constructing admission flags or requesting base tags. A nonempty sequence
continues through the original ordered tag-closure algorithm.

This is a runtime optimization of the existing support capability. Definitions,
exports, content packs, saves and game source are unchanged. It adds no cache,
content revision counter, database query or runtime dependency. The existing
32 KiB support-module allowance and other package limits remain in force.

## Contract and decision

The existing [support port contract](support-rules.md) requires synchronous,
coherent, side-effect-free observations. Empty admission now omits the unused
`baseTags` observation. Its invocation count and timing are deliberately changed;
a host must not use that observation as an event or authorization callback.
An exception from that unused observation is consequently not requested either.
Other support/action queries retain their own observation requirements.

Socket and graft changes are read on every call. Empty results are new arrays;
nonempty results retain support identity and original slot/graft order. The
optimization does not cache an empty result or skip a graft-only loadout. Partial
null arrays, zero-length arrays, later socket insertion and later graft insertion
are covered independently. Nonempty admission still preserves exclusion timing,
positive tag closure, unseeded cycles and live definition changes.

The original source fixtures remain immutable. Both experimental candidates match
all four original support captures byte-for-byte: 435,978 compatibility pairs,
954 resolver states, 301 changed compositions and 35 World action transitions.
The fixtures also cover the original content projection. No expected gameplay
result was regenerated to admit the optimization.

## Why investigate this path

The preceding v0.27 extraction had a small measured native-start regression.
CPU sampling of complete native queries/cast starts identified original stat
calculation and skill-tag construction as the largest sampled costs. The new
intent modules accounted for a small sampled share. That observation identifies
work to investigate; sampling overhead and inlining prevent attributing the
regression to those percentages.

The [profile record](../evidence/milestone-thirty-two/profile.json) contains the
sampling method, equal gameplay receipt hashes and per-implementation results.
The underlying workloads create tag pools even when no socket can consume them.
A content database would not remove those repeated calculations. Validated
resident content and optional authoring storage keep their existing boundaries.

Two isolated candidates were evaluated:

- **Scan:** find whether any live support exists before building admission state.
- **Lazy:** build the tag pool only when the closure loop first visits a support.

Only `support-rules.js` and its source map differed from retained v0.27. All 989
host source files remained byte-identical in each headless experiment. The scan
variant had the larger repeatable combat-query gain. The lazy variant had a
smaller combat gain and inconsistent preview/action timing direction. Its source
is retained as an experiment, not a second runtime implementation.

## Experimental measurements

These are Windows desktop Node 24.9.0 measurements on an Intel i9-10900K, using
the TypeScript development runner. Compare implementations within each run;
separate processes and runs have different warmup and machine conditions.

The first comparisons use five warmups and 25 rotating samples. Every returned
gameplay receipt is equal across original, retained v0.27 and the candidate.
Median milliseconds for the selected scan variant:

| Complete workload | Run | Retained v0.27 | Scan candidate |
| --- | ---: | ---: | ---: |
| 9,216 HUD/press/face queries | 1 | 37.2025 | 23.1699 |
| 9,216 HUD/press/face queries | 2 | 36.0637 | 22.6839 |
| 1,024 native query/cast starts | 1 | 48.5196 | 31.3150 |
| 1,024 native query/cast starts | 2 | 50.6624 | 31.5035 |
| Populated preview of all 954 skills | 1 | 9.0084 | 9.4966 |
| Populated preview of all 954 skills | 2 | 13.5292 | 14.6750 |
| 40 socket/unsocket cycles with rebuilds | 1 | 2.9273 | 2.7539 |
| 40 socket/unsocket cycles with rebuilds | 2 | 3.5443 | 3.7744 |

Combat-query time decreases about 35–38% in these experiments. Populated previews
increase 5.42–8.47%, while action timings change direction. These results do not
justify a universal performance-improvement claim.

An additional four-way comparison uses 50 warmups and 101 rotating samples,
including both candidates together with original and retained implementations:

| Complete workload | Run | v0.27 | Scan | Lazy |
| --- | ---: | ---: | ---: | ---: |
| Populated skill previews | 1 | 10.0141 | 10.1868 | 10.4403 |
| Populated skill previews | 2 | 8.7158 | 8.9421 | 8.6721 |
| Socket/unsocket and rebuilds | 1 | 2.2028 | 2.0803 | 2.1115 |
| Socket/unsocket and rebuilds | 2 | 2.0011 | 1.9984 | 2.0306 |

The longer comparison retains a 1.72–2.60% preview regression for the scan variant;
its action medians improve 0.13–5.56%. Earlier samples remain published rather than
being replaced by the more favorable values. The decision advances the scan
variant for complete acceptance with that tradeoff explicitly retained.
See the [experiment comparison](../evidence/milestone-thirty-two/experiment-comparison.json)
and its separate raw sample files.

Native-start timing includes reset and receipt construction, but no completed
effect simulation. Support-action timing includes actual socket/unsocket actions
and two character rebuilds per cycle. Preview results cover populated skill
configurations, not the performance of a complete rendered Inventory pane.
Neither avoiding explicit scratch allocations nor a CPU timing improvement proves
allocation volume, retained memory, frame pacing, energy use or device performance.

## Final installed-adapter measurements

The public reproduction command was then run against the complete isolated
v0.27.1 game adapter and the retained v0.27.0 installation. All 150 installed
runtime files matched the candidate build; 148 matched the previous runtime.
All 989 host source files and the checked host configuration files were identical.
The pinned original source was verified before and after both runs. Renderer and
other CPU-heavy work from this session had finished before measurement.

| Complete workload | Run | v0.27.0 median ms | v0.27.1 median ms | Time change |
| --- | ---: | ---: | ---: | ---: |
| 9,216 HUD/press/face queries | 1 | 41.7799 | 25.5643 | -38.81% |
| 9,216 HUD/press/face queries | 2 | 37.1021 | 22.7761 | -38.61% |
| 1,024 native query/cast starts | 1 | 53.9794 | 33.9730 | -37.06% |
| 1,024 native query/cast starts | 2 | 51.6693 | 32.5523 | -37.00% |
| Populated preview of all 954 skills | 1 | 8.6786 | 8.9298 | +2.89% |
| Populated preview of all 954 skills | 2 | 8.6838 | 10.1533 | +16.92% |
| 40 socket/unsocket cycles with rebuilds | 1 | 2.3796 | 2.2141 | -6.95% |
| 40 socket/unsocket cycles with rebuilds | 2 | 2.1652 | 2.0505 | -5.30% |

Every gameplay receipt agrees. The scan is accepted for its repeated query and
cast-start improvement, with the populated-preview regression retained as an
explicit cost. In particular, the final 16.92% preview result is not replaced by
the earlier, more favorable long-warmup results. Actual loadout frequencies and
whole-frame measurements are needed to establish a net gain in any target game.
Raw samples, p95 values and source/runtime controls are linked from the
[benchmark decision](../evidence/milestone-thirty-two/benchmark-decision.json).
The separate core contact benchmark does not measure this support optimization.

## Reproduction and acceptance

Run `npm run verify` for the SDK contracts and clean packed consumers. The
empty-observation fault must be rejected by the new behavioral contract; returning
the correct empty array while still performing the unused tag read fails it.
The packed support consumer also verifies empty admission and live graft changes.

Local acceptance covers 294 SDK tests, 115 deliberate runtime faults, 19 packed
consumers, twelve installed-game suites with 54 faults, nine additional native
game probes, and ten renderer/boot checks. The separately managed game also runs
support and skill-input comparisons with eleven faults, all three type checks
and simulation smoke. Both smoke runs cover five scenarios across five seeds.
The original game remains unchanged; the managed game changes only its local
dependency installation. Receipts and their scope are recorded in
[verification](../evidence/milestone-thirty-two/verification.json),
[renderer acceptance](../evidence/milestone-thirty-two/renderer.json) and the
[managed adapter](../evidence/milestone-thirty-two/managed-adapter.json).
Exact-commit remote CI is a separate publication gate.

Prepare the original reference and a separate current game adapter using the
existing adapter workflow. Keep an installed v0.27.0 game directory as a control.
With other CPU-heavy work stopped, run:

```sh
npm run benchmark:support-admission -- --previous-adapter <retained-v0.27-game>
```

The command runs the existing complete query/cast-start and support-preview/action
workloads twice. It verifies pinned original sources, identical host source/config,
all installed runtime files and that only the support implementation and map differ
between controls. Helpers are type-checked and their hashes are recorded. It never
regenerates expected fixtures or changes the retained adapter.

The longer experimental comparison's helper and the unselected lazy module are
under `evidence/milestone-thirty-two/experiments`. Evaluate alternate modules only
in separate experimental copies; compile them and verify every other runtime and
host-source file against the retained control. Place the four-way helper under an
isolated reference game's `balance` directory and pass retained, scan and lazy game
directories followed by a fresh output path. Its keys are `original`, `previous`,
`current` and `alternate`. The profiler helper similarly takes retained/current
paths and an existing output directory; raw CPU profiles contain local paths.

Full native-engine packages, further effect/dispatch extraction and physical
Steam Deck/older-mobile validation remain separate unfinished requirements.
