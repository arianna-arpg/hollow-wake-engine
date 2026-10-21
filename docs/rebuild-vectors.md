# Attribute rebuild experiments and regression guards

Version 0.16.1 leaves every compiled runtime file unchanged from v0.16.0. It adds
seven independent rebuild contracts, one behavioral fault control and a repeatable
three-implementation benchmark. None of the experimental implementations is shipped.

## Investigation

CPU sampling of 80,000 complete level/choose/choose/reset sequences put
`World.recalcSeat` on about 73% of sampled stacks. Passive-grant construction,
attribute derivation and stat queries were prominent costs. The diagnostic includes
per-batch preparation and uses the TypeScript development runner; its function-naming
helpers also appear in samples. This identifies investigation targets, not the cause
of the v0.16 regression or a release-renderer/device performance result.

Four candidates kept content and all game source unchanged:

- **A:** Fill the owned base-attribute typed array directly in authored order.
- **B:** Also cache a validated derived typed array within each rebuild accumulator.
- **C:** Use a directly filled ordinary array for that private cache.
- **D:** Construct the private ordinary array with own data indices through `Array.from`.

Candidate C invoked an inherited array-index setter during an attribute read.
A dedicated regression test reproduced that difference, passed on the retained
v0.16 implementation, and passed on D. C was rejected regardless of its timings.
The candidate sources and the failing observation are retained as experimental
evidence. They are not alternate production implementations.

D's first run improved the measured workloads, but confirmation did not reproduce
those gains. The simpler A was then measured twice more. Its complete skill-action
course improved in both final runs, while full-equipment rebuilds regressed in both.
The runtime was restored to the verified v0.16 implementation. No broad rebuild
speedup, allocation reduction or target-device improvement is claimed.

## Complete workload comparisons

The retained control is the actual v0.16 game adapter. Before timing, the runner
requires identical game source and checks every installed runtime file against the
candidate build. Only the passive-grant implementation and its source map may differ
between runtime controls. Original source hashes are verified before and after.

The rebuild course visits 39 recorded class allocations with authored rare gear.
Each sample performs 117 complete rebuilds, with one Lapis Ring or all nine enabled
equipment slots. Six warmups precede 25 rotating samples. Every class's attributes,
ordered stat sources, conduits, life and mana are checked outside timing after every
batch. These static loadouts measure rebuilds, not item acquisition or equip legality.

The skill course uses five warmups and 25 rotating samples for fresh compilation of
all 132 trees, ten complete Inventory preview passes and forty complete
level/choose/choose/reset sequences. It preserves native cleanup, recalculation and
presentation callbacks. Every result agrees across original, retained and candidate.

Final A medians in milliseconds on Windows, Node 24.9.0, Intel i9-10900K:

| Workload | Run | Original | v0.16 | A |
| --- | ---: | ---: | ---: | ---: |
| One-ring rebuilds | 1 | 6.5513 | 8.9830 | 8.6755 |
| One-ring rebuilds | 2 | 6.8650 | 9.2883 | 9.3107 |
| Full-equipment rebuilds | 1 | 8.9697 | 18.1665 | 18.6116 |
| Full-equipment rebuilds | 2 | 8.1533 | 16.8294 | 17.1028 |
| Complete skill actions | 1 | 3.5405 | 4.5091 | 4.2658 |
| Complete skill actions | 2 | 2.9727 | 3.6464 | 3.5196 |

The final action medians improve about 3.5–5.4%; full-equipment medians regress
about 1.6–2.5%. The unchanged tree-preview code also varies between controls,
illustrating the limits of small timing differences. Retain both final runs and the
earlier experiments rather than selecting the most favorable sample.

## Preserved contracts and next work

The new tests cover ordered one-time base reads, rejection without coercion,
validation of attributes with no per-point modifiers, detached outputs, independent
accumulators, reentrant item-input reads, recovery after derived overflow and
inherited array-index setters. The same seven contracts pass against the retained
v0.16 package. A deliberate duplicate-base-read fault must fail them. Accepted
original-game fixtures are unchanged.

The remaining rebuild cost needs a larger-path profile, particularly full equipment
and validated item/modifier copying. Any compiled-input or batching API must retain
ownership, live-content refresh, source ordering and invalid-input atomicity. The
rest of the gameplay extraction, native packages and named-device validation remain
open in `completion.json`.

Run `npm run verify` for the regression guards. For controlled experiments, use
`npm run benchmark:rebuild-vectors -- --previous-adapter <retained-v0.16-game>` after
building and installing a candidate in a separate game adapter. The script rejects
changes to other runtime modules or game source. Candidate source snapshots live
under `evidence/milestone-twenty/experiments`; evaluate them only in a separate
experimental checkout. Stop other CPU-heavy local work before measurement.

The current release compares identical runtime implementations, so running this
benchmark on unchanged v0.16.1 is a control comparison. It cannot demonstrate an
optimization in this release. The full verifier contains 168 tests, 35 deliberate
fault controls and eight isolated packed consumers.
