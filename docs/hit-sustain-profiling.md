# Hit sustain CPU profiles

CPU sampling complements the [active-sustain benchmark](hit-sustain-performance.md).
It locates time within the complete hit path; it does not replace the benchmark's
adoption gate or establish Steam Deck/mobile performance.

## Reproduction

Keep separately prepared previous and candidate game adapter locations, with the
candidate using the current built SDK. Then run:

```sh
npm run profile:hit-sustain -- --previous <previous-location.json> --location <candidate-location.json>
```

The command generates eight disposable processes: tree storage and combined
sustain at 256 actors, with each adapter first once and second once. Each process
executes the same native workload as the benchmark, audits three hits, warms up
5,000 hits and profiles 50,000 hits. It uses the
[Node inspector CPU profiler](https://nodejs.org/download/release/v24.9.0/docs/api/inspector.html#cpu-profiler)
with a requested 1,000-microsecond sampling interval. The observed interval can
differ; the summary uses recorded sample deltas rather than assuming that rate.

Sampling starts after warmup and explicit collection, and stops before state
snapshots, assertions and file writes. The hit loop still includes equal life,
tree and text resets plus read-only counters. Actual healing, cue coalescing and
all other native hit reactions run. Independent arithmetic checks and exact
cross-adapter comparisons verify the audit and final state. Each generated helper
is type-checked against its game; source/package/helper hashes must remain stable.

The output directory retains `.cpuprofile` files, complete observed states, sample
summaries, generated helpers, type-check logs and a verification receipt. Profiles
can be opened in a CPU-profile viewer. Self time belongs to a frame; inclusive
time also includes its descendants. Inclusive rows overlap and must not be added
as independent costs. Garbage-collection samples are not allocation volume.

## Interpretation and execution history

Fresh-process profiles have different optimization history from the full
21-case benchmark. A separate diagnostic copy of that exact schedule therefore
retains all original cases, 1,500-hit warmups, twelve 2,000-hit rounds, six lane
orders, original-game comparisons and independent checks. It samples only the
tree/256 and combined/256 loops, producing 72 profiles. The cloned worker and
controller are retained with the checkpoint evidence so the instrumentation can
be reviewed. This copy does not alter the maintained benchmark.

Profiler setup and sampling can affect execution. Neither diagnostic run can
overrule the previously failed prototype gate. The shared-method adapter remains
isolated until a distinct change has a supported explanation, preserves the full
behavior boundary and passes the required unprofiled measurements.

## Windows checkpoint

The [retained checkpoint](../evidence/hit-sustain/profile-windows.json) contains
all 80 profiles and their outcome checks. The eight isolated runs pass; all
21 cases also pass in the instrumented full schedule. Runtime files, installed
packages and the maintained benchmark are unchanged.

The following values are accumulated **sampled self time inside sustain's
`apply` function**, not total resolver time or an accepted speedup. Isolated
rows contain 100,000 hits per adapter; scheduled rows contain 24,000.

| Execution history | Workload | Published binding | Shared-method prototype |
| --- | --- | ---: | ---: |
| Isolated | Trees | 1.619 s | 1.074 s |
| Full schedule | Trees | 0.273 s | 0.269 s |
| Isolated | Combined | 2.862 s | 2.417 s |
| Full schedule | Combined | 0.763 s | 0.562 s |

The tree-loop difference visible in isolation is much smaller in the full
schedule. These profiles do not establish the cause of the earlier 5.17%
throughput regression. Stat computation and resource-flow updates remain major
costs elsewhere in the resolver. The profiles also contain inspector boundary
frames: in the short scheduled tree batches these account for about 1.58 s and
1.84 s for the published and prototype bindings respectively. Adding those
frames to hit-loop cost would produce a misleading comparison.

The prototype remains unadopted. No further unchanged-candidate throughput runs
are justified by these results. Continue extracting the remaining landed-hit
reactions; revisit this optimization with a distinct, measured change and the
existing adoption gate. The raw checkpoint retains a corrected analysis:
the first summary failed to group the original reference's stat file under the
same source label. Re-analysis fixes that label without rerunning or changing
any profile, observation or timing.
