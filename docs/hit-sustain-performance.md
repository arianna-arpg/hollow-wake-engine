# Hit sustain performance workload

This experiment measures the complete game hit path with active skill siphon,
nearby sharing, life bonds and Tree of Life storage. It complements the
[98-course behavior boundary](hit-sustain-boundary.md); it does not replace those
mutation, reentrancy and partial-failure cases.

## Reproduction

Build the SDK and prepare its isolated game adapter. Keep a separately installed
predecessor adapter to distinguish the cost of this extraction from earlier
changes. Both location files are produced by `scripts/prepare-game-adapter.mjs`.
The pinned original game is reconstructed with `npm run reference:prepare`.

```sh
node scripts/benchmark-hit-sustain.mjs --previous <previous-location.json> --location <current-location.json> --verify-only
node scripts/test-hit-sustain-benchmark-observer.mjs --location <current-location.json>
node scripts/benchmark-hit-sustain.mjs --previous <previous-location.json> --location <current-location.json> --control
node scripts/benchmark-hit-sustain.mjs --previous <previous-location.json> --location <current-location.json>
```

Run timing commands serially with competing CPU work stopped. `--control` runs
three isolated copies of the current installed adapter; its lane names remain
`original`, `previous` and `current` only to preserve the measurement schedule.
The ordinary run uses the pinned original, the supplied predecessor and the
current installed package. `--verify-only` runs the workload checks without warmup
or timing. A successful receipt establishes completed behavior checks, not a
performance acceptance threshold.

## Work and observation

The fixed plan covers seven workloads at 8, 64 and 256 actors: no sustain,
siphon, dense sharing, sparse sharing, a life bond, dense trees, and combined
sustain. Sparse sharing includes dead, hostile, other-story and distant bodies.
Every actor is a real game actor; actual recovery and cue generation execute.
The test does not replace healing with a constant return value or mock the hit.

Three audit hits check each body's measured healing count, total healing, final
life, healing ledger, resource flows and tree storage/radius against independent
arithmetic. Audit captures additionally check recipient order. The three game
versions must agree on the complete captured state, text, cues and random-draw
count. The fault command changes every worker equally: skipping a hit, removing
siphon healing, reversing reported healing order, or adding a draw must fail the
independent checks even when peer outputs agree.

Each timing case has 1,500 warmup hits and twelve rounds of 2,000 hits per worker.
All six worker orders occur twice. Every round repeats the arithmetic/state
checks and compares all three versions. Records retain every timing, observation
digest, aggregate healing and hit/draw count; full audits and final states remain
in the experiment directory. Sources, installed packages and benchmark helpers
must remain unchanged during the run.

Timing includes equal life/tree/text resets, real healing callbacks, cue
coalescing, read-only hit/heal counters and random-draw counting. IPC, snapshot
creation, cross-worker comparisons and explicit garbage collection are outside
the measured interval. World time remains fixed; these are warm repeated hits,
not actor-update, rendering, construction or whole-frame measurements. Cue rows
persist and coalesce; no-cue and cold-cue costs are not isolated here.

The report includes absolute median batch times as well as current/predecessor
and current/original ratios. Retained heap after collection is reported separately
and must not be described as total allocations. Repeat or profile an apparent
regression before attributing it to the sustain extraction, especially where the
identical-input control is also noisy. Desktop timings do not establish Steam
Deck or older-phone/tablet performance.

## Windows checkpoint and binding experiment

The [checkpoint evidence](../evidence/hit-sustain/performance-windows.json) retains
the short run, longer run, identical-input controls and an isolated adapter
experiment. All 21 cases agree across the pinned original and both installed
adapters. Four deliberate benchmark faults are detected, including faults applied
equally to every worker. Production runtime files and the maintained game binding
are unchanged by this checkpoint.

The first plan used 300 warmup hits and 200-hit batches. Its identical-input
median ratios spanned 0.937–1.122, which was too noisy for the small differences
under investigation. The retained second plan increases those counts to 1,500
and 2,000 without changing workloads or arithmetic checks. The longer run finds
overhead against the immediate pre-sustain adapter, particularly in larger
populations. The following rows use 256 actors; times include the reset and
observation work described above.

| Workload | Identical-input ratio | Sustain / predecessor | Sustain median per hit |
| --- | ---: | ---: | ---: |
| Dense sharing | 0.984 | 1.089 | 259.7 µs |
| Sparse sharing | 1.010 | 1.121 | 118.9 µs |
| Dense trees | 0.993 | 1.134 | 109.1 µs |
| Combined sustain | 0.982 | 1.039 | 252.6 µs |

These observations use Node 24.9.0 on Windows x64 with an Intel i9-10900K.
The current/original comparisons include all earlier SDK and stat-cache changes;
they cannot isolate the effect of this sustain extraction. The 98-course original
baseline remains the authority for live mutations, reentrancy and partial failures.

An isolated prototype replaced the game adapter's object-literal callbacks and
getter with shared class methods. Only `src/engine/hitSustain.ts` changed in its
disposable game. The complete 98-course trace still matched. An isolated factory
inspection confirms that twenty bindings create twenty copies of each of five
functions in the maintained adapter, but share one of each in the prototype.
An internal V8 diagnostic reported fast properties for the class instances and
not for the literal bindings. This is local diagnostic evidence, not a portable
API requirement or proof of the whole timing difference.

The prototype improved the median in 18 of 21 cases in each of two comparisons.
The 256-actor combined case was 7.9% lower in the first run (12 of 12 rounds) and
7.4% lower after reversing worker startup/warmup order (10 of 12 rounds). However,
the repeated 256-actor tree case was 5.17% slower. This exceeded the 5% maximum
slowdown recorded before examining that repeat. **The prototype was not adopted.**
Its source, construction diagnostic, results and decision are retained for further
profiling. The benchmark and evidence are delivered; an accepted sustain
optimization, allocation-volume measurements and device acceptance remain open.

The first untimed development audit predates the helper immutability guard: its
controller/checker were edited while it ran, so its final hashes cannot attest
the executed code. It is retained but excluded from acceptance. Subsequent
fault-control and measurement runs require unchanged helpers throughout.

The subsequent [CPU profiling checkpoint](hit-sustain-profiling.md) retains eight
isolated profiles and 72 profiles within the original workload schedule. It does
not explain away the failed gate or promote the prototype.
