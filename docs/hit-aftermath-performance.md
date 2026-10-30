# Hit aftermath measurements

The [runtime evidence](../evidence/hit-aftermath/runtime-windows.json) records
desktop measurements of the complete hit resolver with active damage sharing,
status spread, splash and their combination. This is an extraction checkpoint,
not acceptance of an optimized whole game or a target device.

## Workload and independent checks

Each workload uses 8, 64 and 256 actors. A real native spell lands positive
physical damage. Sharing refunds half the captured wound and distributes it
among the victim's minions. Spread transplants an existing burn to the last
equally near eligible peer, scaling its magnitude and remaining duration.
Splash resolves real nested hits on the surrounding actors. The combined case
requires all three interactions, including their order.

Before timing, three hits in each of the 12 cases must match between the pinned
original, the immediate installed predecessor and the extracted runtime. Separate
arithmetic assertions check actual hit counts and damage, life after sharing and
splash, status recipients, magnitudes, clocks and actor identity/order. Six
deliberate native helper faults must fail these assertions: disabled sharing,
disabled spread, disabled splash, false root counts, skipped hits and missing
status reset. Worker exceptions do not count as successful fault detection.

The comparison uses 12 rounds with all six worker orderings repeated twice.
Workers retain their worlds and actors; identical life/status/text reset and
read-only hit/random counters remain inside each timed batch. Snapshots, IPC
and explicit garbage collection occur outside timing. Sharing and spread use
1,000 roots per batch. Splash and combined batches scale down with population
to bound nested-hit work. Every timed batch must reproduce the audited state
and random-draw schedule.

An identical-input run uses the current game in all three worker slots. The
older five-case common-hit benchmark has a separate predecessor-versus-itself
control. These controls expose process/order variation; their ratios are not
automatically subtracted from the comparisons or treated as confidence bounds.

## Desktop result

Measured on Intel(R) Core(TM) i9-10900K CPU @ 3.70GHz, Windows x64, Node v24.9.0.
Positive percentages mean slower. Values are medians of round-by-round ratios,
not ratios of independently computed median durations. The control uses identical
current builds; the final column compares the cumulative SDK with the original.

| Workload | Actors | Current vs predecessor | Identical-build control | Current/original ratio |
| --- | ---: | ---: | ---: | ---: |
| sharing | 8 | -2.08% | -2.64% | 0.638 |
| spread | 8 | -0.95% | +3.74% | 0.801 |
| splash | 8 | +3.62% | -0.90% | 0.620 |
| combined | 8 | +0.99% | +1.94% | 0.779 |
| sharing | 64 | -1.22% | +2.10% | 0.676 |
| spread | 64 | +3.03% | +4.28% | 0.857 |
| splash | 64 | +5.37% | -1.49% | 0.611 |
| combined | 64 | +2.75% | +3.53% | 0.769 |
| sharing | 256 | -4.12% | +4.70% | 0.764 |
| spread | 256 | +0.40% | -2.71% | 0.927 |
| splash | 256 | +3.30% | +1.89% | 0.597 |
| combined | 256 | +1.58% | +1.19% | 0.779 |

The new boundary has mixed active-workload medians, from 4.12% faster to 5.37% slower than the immediate predecessor. Identical current-build controls range from 2.71% faster to 4.70% slower between worker slots. These controls demonstrate variation, not a confidence interval or a correction factor. Splash at 64 actors is slower in all twelve rounds, making it a specific follow-up concern. No causal speedup, allocation reduction, whole-frame or target-device improvement is claimed.

The 64-actor splash comparison used 32 root hits per batch; median batch
durations were 68.59 ms for the predecessor and 72.55 ms for the current build.
This is the next profiling target. The five common-hit workloads ranged from
3.58% faster to 5.22% slower; their identical-input control also varied, including
a 7.68% apparent improvement on Impale. No optimization claim is accepted here.

## Focused confirmation

A follow-up retained the same helper, checker, runtime and 32-root splash batch,
but isolated 64 actors and increased the comparison to 48 rounds. All six worker
orders ran eight times. A separate identical-current-build control used the same
plan. Both runs preserved source/package hashes and matched all outcome checks.

| Comparison | Median paired ratio | Current faster in |
| --- | ---: | ---: |
| Identical-build control | 0.99695 | 25/48 rounds |
| Current versus predecessor | 0.96586 | 28/48 rounds |

The initial 5.37% slowdown did not reproduce. The new comparison's median paired
time is 3.41% lower, while the control differs by 0.31%. These are observations,
not a stable improvement or a confidence bound. The changed direction leaves
causal overhead unresolved, so no runtime rewrite was accepted. The diagnostic
CPU-profile draft was prepared but not run. The original evidence above remains
unchanged; [confirmation evidence](../evidence/hit-aftermath/splash-confirmation-windows.json)
retains the exact diagnostic plan, raw rounds and receipts.

## Interpretation boundaries

This is a warm resolver benchmark at a fixed simulation clock. It includes
the original game's data, actor implementation and adapters. It does not measure
frame scheduling, rendering, input, world updates, save/load or a complete
Steam Deck/mobile build. Post-collection retained heap is not allocation volume.
The native replay independently checks behavior; its full-game memory numbers
include content, headless shims and observation storage, so they are not an SDK
memory budget.

The new optional module adds 21,402 bytes of unminified JavaScript. All 282
predecessor compiled files remain unchanged; total runtime JavaScript is 689,889
bytes against the retained 674 KiB cap. Optional imports keep this module out of
the core entry. This is package-size accounting, not a claim about resident memory.

Further optimization must preserve borrowed record identity, callback order,
partial failures and reentrant hits. In particular, sharing snapshots recipients
while splash iterates the host query; exchanging these semantics to avoid an
allocation is not an equivalent optimization. Profile demonstrated costs before
changing layout or caching. The content database remains an authoring/query
option outside the per-hit path; see [content storage](content-storage.md).

## Reproduction

Prepare the pinned reference and two isolated adapter locations, with the current
installed package matching `dist`. Stop other CPU-heavy work, then run:

```text
npm run benchmark
npm run benchmark:hit-aftermath -- --previous <previous-location> --location <current-location> --verify-only
npm run test:hit-aftermath-benchmark-observer
npm run benchmark:hit-aftermath -- --previous <previous-location> --location <current-location> --control
npm run benchmark:hit-aftermath -- --previous <previous-location> --location <current-location>
```

Each run retains a unique directory and verification receipt. The root receipt
is only a latest-run pointer; retain the per-run receipt when linking an observer
proof or comparing timing runs. CI runs the audit and six fault controls, without
enforcing desktop timings on shared runners.
