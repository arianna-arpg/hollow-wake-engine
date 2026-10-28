# Resource restoration

The native baseline was committed before implementation. The v0.38 development
candidate provides optional `combat/restoration` and `combat/restoration-content`
entries. The installed game reproduces all 218 native observations and 20 renderer
stages. Measurement, managed-game and public-main acceptance remain open.
This contract extends life recovery with shield/poise gain gates, immediate
restoration and the restore proc branch. It does not authorize a gameplay change.

## Evidence and ownership

The source remains commit `88e135e6c85d301ee7c0c3641f9fc2f92be0e140` plus the
hashed working overlay. Six typed capture programs reproduce 218 observations
in two independent native processes and the installed v0.37 game adapter.
Their complete output bytes agree. The accepted fixture bytes retain their
original exploratory-stage labels as historical capture metadata; the separate
[acceptance record](../baseline/milestone-forty-three/acceptance.json) establishes
their reviewed status. Normal verification never regenerates expectations.

The observations cover 23 restore procs loaded at startup, including generated
registrations, at powers zero, one and two. Other cases cover callback order,
bound receivers, deliberate failures, queue limits and borrowed tag identity.
Ten World courses exercise real updates, streams, recharge, regeneration
conversion, mana reservations, stasis, slow and poise rearm. An authored Mend
cast earns Desperate Reserves; host-resolved attacks earn the block restoration
proc. These are controlled gameplay observations, not physical-input or renderer
tests. Synthetic direct-proc diagnostics deliberately retain the original omitted
presentation color; they do not validate a complete serialized proc definition.

The [caller inventory](../baseline/milestone-forty-three/caller-inventory.json)
records direct calls in Actor, World and damage processing. It is a static
inventory, not proof that no dynamic or aliased caller exists. Source guards
cover 16 relevant Actor members, both World methods and all 22 proc cases.
The existing payment-module delegation of `availableMaxMana` is preserved.

Actors retain their pools, flags and event queues. Shared synchronous ports
supply contextual maxima, gain-method invocation and feeding-cue notification.
The extraction must add no per-actor cache, registry or bound closure.
Stat/condition production, event occurrence, spatial selection, stream creation
and ticking, natural recharge, poise recovery, presentation and saves remain
explicit host responsibilities for this capability.

## Renderer verification

The [renderer acceptance](../baseline/milestone-forty-three/restoration-ui-acceptance.json)
freezes two identical native v0.37 captures before the first SDK renderer
comparison. All 20 SDK-backed stages match the recorded JSON bytes. Numbers in
those observations are rounded to six decimals; queue and trace membership and
order are preserved. Screenshots support inspection, not a pixel-equality claim.

The harness checks the mana fill and reservation band, feeding-cue appearance
and expiry, shield recharge tracks, stream pause/slow/completion, broken-poise
rearm and the additional overcharge arc. Authored Mend input earns Desperate
Reserves; controlled native attack contacts earn Censer Refrain. Their resource
gains and three visible proc glyphs are checked independently of fixture equality.

The browser clock and ambient animation pump are controlled before startup, and
the installation and exact native frame deltas are asserted. This matters at a
stream's endpoint: an uncontrolled fractional frame origin can leave a tiny
remaining amount for another frame. The game arithmetic is preserved. A zero
recharge modifier also retains the native stat's 1%/second minimum.

Use a complete isolated game copy with this adapter and installed SDK, including
its renderer configuration, HTML, assets and launcher. The headless source capsule
alone does not provide that shell. Build a new output with
`node scripts/build-game-item-ui.mjs --game <game> --output <new-bundle>`, then run
`npm run adapter:restoration-ui -- --game <game> --dist <new-bundle> --electron <electron>`.
The verifier checks source/runtime/build identities, uses fresh profile and save
directories, and refuses changed expected data. It preserves game source, the
installed package and build outputs. Canonical harness source uses LF endings.

These are software-rendered desktop Electron observations at 1280×800. They do
not establish physical input coverage, device performance or complete native
engine packages. The [renderer checkpoint](../evidence/milestone-forty-three/renderer-checkpoint.json)
records the tested archive and the remaining acceptance work.

## Native transitions

`gainEnergyShield` rejects a nonpositive amount or an actor already dead before
querying the maximum. A nonpositive maximum returns zero. Otherwise the current
pool is sampled after the maximum query, clamped with native binary64 arithmetic
and returned as the actual difference. An overfull pool can therefore produce a
negative correction. The existing full flag is set when crossing the
`maximum - 0.001` threshold and is never cleared by this gain operation.

`gainPoise` follows the same early gate, then samples maximum, overcharge and
current poise in that order. Its cap is `maximum * (1 + overcharge)`. It does not
clear the broken flag. The World course confirms that a fed broken bar remains
broken until the existing timer update performs rearm.

Immediate restoration selects the life/shield/poise gain method before evaluating
the effect's amount. The shared host invocation port must retain that ordering
and native method-call syntax. This preserves receiver binding, method replacement
during a getter, and callables with their own `call` property. Mana instead samples
its before value, queries available capacity, then reads current mana and amount
for its clamp. Native negative mana restores can drain the pool, and this path
does not add the shield/poise dead-actor gate.

Shield delay reset follows the gain call even when the gain is zero; it does not
directly mark recharge active. Life, mana and shield feeding cues use the gain
method's returned amount. Poise does not read the feeding-cue option. A positive
returned gain creates one restore event when `noEvent` is false and the existing
queue has fewer than 64 entries. Tags retain the supplied array identity.
Queue selection, option reads and short-circuit ordering remain observable.

Proc restoration receives an already power-scaled effect. It samples the pool
before amount queries, computes flat plus percentage times the total maximum,
and then applies the relevant gain. Mana percentages use `maxMana`; the later
clamp uses `availableMaxMana`. Poise percentages use `maxPoise` before overcharge.
The maximum query still occurs with a missing or zero percentage. Gain-method
selection occurs after these amount queries. The operation reports whether the
observed pool grew, allowing the original World to emit its proc cue in place.
It does not manufacture an immediate-restoration event.

The return-value and pool-growth contracts intentionally differ. A custom method
can return a positive value without changing a pool, or change the pool while
returning zero. The accepted observations preserve both cases.

## Failures, reentry and content

Ports are synchronous. Same-actor nested calls retain native live-read order.
Exceptions propagate with prior state intact: a failed delay reset can leave
the gain applied; a later event failure can leave both the gain and feeding cue.
These transitions are not rollback transactions. Fourteen expected query/failure
exceptions are part of the baseline, not unexpected test failures.

The content compilers own frozen plain data records with exact fields:

| Effect | Required fields | Optional fields |
| --- | --- | --- |
| Immediate restore | `type: restore`, `resource`, finite `amount` | Boolean `resetEsDelay` |
| Proc restore | `type: restore`, `resource` | Finite `flat`, finite `pctMax`, Boolean `resetEsDelay` |

Immediate resources are life, mana, shield (`es`) and poise. Proc restoration
accepts mana, shield and poise; proc healing uses the separate life-recovery
schema. Unknown fields, hidden properties, symbols and accessors must be rejected
without invoking accessors. Signed finite numbers and signed zero are preserved.
Raw runtime NaN/infinity observations preserve native arithmetic but do not
authorize nonfinite authored content.

## Reproduction and remaining acceptance

After reconstructing and installing the pinned reference, run
`node scripts/run-restoration-reference.mjs`. It type-checks every capture tool,
checks source/fixture hashes and compares new native observations with the frozen
bytes. The output goes to a fresh directory under `.artifacts`.

The runtime passes independent arithmetic and content tests, deliberate fault
checks, a clean packed consumer and all 218 installed-game observations.
Adapter preparation rejects 222 source faults before writing and preserves
other members, existing delegations and the other 21 proc cases. Eighteen
installed faults are detected in a separate copied graph, including lost cue
payloads, borrowed-tag identity, reservation capacity and native invocation.
Timed World cases exercise host composition; they do not claim that stream
scheduling or all defensive lifecycle rules have been extracted.

The initial runtime passes 210 focused tests: 200 frozen native observations
replayed over borrowed state (numeric/event projections, query traces, invocation
and failure boundaries), plus ten independent arithmetic, ordering and content
tests. The complete installed-game comparison additionally checks native cue
payloads and the ten World/eight pool-base courses. Twenty-three runtime faults are
detected without changing the production runtime. An independently installed
package runs with host APIs disabled; its type consumer rejects all eleven
asynchronous ports, an asynchronous event queue and incompatible host payloads.
The two optional JavaScript modules total 6,074 bytes, within the fixed 8 KiB
allowance. This is a size result, not a speed or allocation claim.

The full SDK verification gate passes 846 tests and the existing package/fault
checks; all 195 predecessor compiled outputs remain byte-identical. The guarded
adapter preserves 994 other source files and adds no Actor fields. Public
preparation from the frozen source capsule reproduces all 997 candidate source
files and 201 compiled SDK files. See the
[runtime checkpoint](../evidence/milestone-forty-three/runtime-checkpoint.json)
and [adapter checkpoint](../evidence/milestone-forty-three/adapter-checkpoint.json).
The latter records the exact initial archive; later metadata or release packages
must be checked separately before publication.

`npm run adapter:prepare` now includes restoration. Use
`npm run adapter:restoration -- --location <location.json>` for a read-only
installed comparison. `adapter:restoration-faults` creates a separate source and
SDK copy before changing any bytes, even when supplied a retained control.
`adapter:restoration-source -- --game <predecessor>` tests source transformations
on temporary copies. Normal verification never overwrites accepted expectations.

Consumers import `gainEnergyShield`, `gainPoise`, `applyInstantRestoration` and
`applyProcRestoration` from `@hollow-wake/engine/combat/restoration`. Use
`compileInstantRestorationEffect` and `compileProcRestorationEffect` from the
separate content entry on ingestion. The
[installed example](../examples/resource-restoration.mjs) demonstrates shared
ports, distinct actor state, reserved mana and borrowed tags. A proc caller
applies its existing power scaling before invoking restoration and owns the
subsequent presentation cue.

The [measurement plan](../baseline/milestone-forty-three/performance-plan.json)
requires receipt-checked paired comparisons and profiles before adopting an
optimization. Its [concrete workloads](../baseline/milestone-forty-three/performance-workloads.json)
were frozen after both independent game graphs passed all 16 path cases and four
memory cases, before recording timing or memory-byte results. The
[validation receipt](../evidence/milestone-forty-three/performance-validation.json)
records the helper, plan, outcomes and input hashes.

The seven direct paths each perform 32 calls per Actor at 1,024 and 4,096 Actors.
They exercise positive/full shield, ordinary/overcharge poise, immediate mana with
events and feeding cues, reserved-mana proc restoration and poise proc restoration.
The eighth path advances real Worlds with 16 and 64 Actors through 120 steps of
1/64 second, converting life regeneration to shield. These controlled batches do
not represent an estimated production event frequency.

Prepare separate v0.37 and candidate game/package graphs, then run:

```sh
npm run benchmark:restoration -- --location <candidate-location.json> --previous-adapter <v0.37-game> --validate-only
npm run benchmark:restoration -- --location <candidate-location.json> --previous-adapter <v0.37-game>
npm run benchmark:restoration -- --location <candidate-location.json> --previous-adapter <v0.37-game> --order current,previous
```

Each process uses actual Actor/World entry points. Fresh Actor construction, stat
cache warming, GC and receipt checks stay outside each timed batch. Scalar return
accumulation and RNG counting are included; gain methods are not wrapped. All 25
samples follow eight warmups and must retain the validated state, event/cue and
Actor-field hashes. Memory cases collect seven samples, distinguish used from
retained heap, and require every discarded Actor's weak reference to clear.
Retained heap is neither total allocation nor peak memory. The runner preserves
both source/package graphs, the source capsule, helper and accepted plan.

The [initial desktop measurements](../evidence/milestone-forty-three/restoration-initial-performance.json)
contain both reversed-order runs and their complete raw samples. All state checks
passed, and all four retained-memory medians matched exactly in both runs.
Shield gain at both Actor counts and ordinary poise gain at 4,096 Actors had
median regressions above five percent in both runs. Representative 4,096-Actor
batches, each containing 131,072 gain calls, measured:

| Path | Run 1 native / SDK median | Run 2 native / SDK median |
| --- | --- | --- |
| Positive shield | 8.90 / 16.65 ms | 8.86 / 11.74 ms |
| Full shield | 8.47 / 15.11 ms | 8.67 / 13.63 ms |
| Positive poise | 19.64 / 24.05 ms | 17.41 / 19.29 ms |

These are Windows/Node 24.9 measurements on an i9-10900K. The variation between
runs is retained in the evidence; the initial runtime has not earned a speed
improvement claim. The repeated regressions require profiling and an explicit
optimization experiment before performance acceptance. The five-percent grouping
identifies investigation targets; the original acceptance rule still evaluates a
proposed optimization against this initial SDK, across every workload in both
orders. No optimization is accepted by these initial results.

Separate [CPU and allocation diagnostics](../evidence/milestone-forty-three/restoration-initial-profiles.json)
preserve the accepted outcomes. CPU samples concentrate in the existing stat
queries, and the diagnostic trace shows SDK gain functions and forwarding queries
being inlined. Allocation sampling includes a positive control for discarded
objects using the documented [HeapProfiler collection flags](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/#method-startSampling).
The instrumented helper adds asynchronous sampling boundaries and substantial
profiler-control overhead. Its timing and sample-count differences therefore do
not explain the uninstrumented regression.

An unchanged-helper compiler trace also observes the gain and query functions
being inlined. Its diagnostic results and the subsequent
[immutable-export experiment](../evidence/milestone-forty-three/restoration-immutable-export-experiment.json)
are retained separately from acceptance measurements. The experiment changed only
the two gain exports to immutable named function expressions. Their bodies and
callable metadata stayed identical; 218 installed observations, all 18 installed
faults and all 20 renderer stages passed. No Actor fields were added.

The preselected target was positive shield gain at 4,096 Actors, with 32 calls
per Actor. Two reversed-order comparisons measured the native game, initial SDK
and candidate across all 16 workloads and four memory cases. The target improved
6.27% in the first order and regressed 220.09% in the reverse order. The first
order also exceeded the full-shield p95 limit and the 64-Actor World median limit;
22 limits failed overall. The unchanged native comparator varied widely too.
These observations reject the proposal under the frozen rules; they do not
identify the cause or establish a general performance rule about const exports.

All 2,400 timing samples and the reproducible patch are preserved. At the recorded
baseline commit, apply the zero-context patch with `git apply --unidiff-zero`;
its application and reversal are checked against both source hashes. Cleanup checks
passed, and retained memory showed no repeatable reduction. The
[initial runtime is restored](../evidence/milestone-forty-three/restoration-immutable-rollback-verification.json),
including all 201 compiled outputs. The syntax-tree fault selector remains so
faults cannot accidentally target adjacent exports or decoy strings. Performance
acceptance is still open; another proposal needs an explicit hypothesis and the
same improvement and regression limits.

### Measurement repeatability

The [identical-code diagnosis](../evidence/milestone-forty-three/restoration-measurement-diagnosis.json)
uses two independent installations with byte-identical source and packages.
Eight fresh processes exercise the unchanged first six workload/count cases,
with ordinary and CPU-counter helpers in reversed orders. Both helpers type-check;
all outcomes and all 1,200 measured samples are retained. The accepted benchmark
helper and performance thresholds stay unchanged.

Seven of twelve ordinary paired comparisons differ by more than five percent in
median time; seven exceed ten percent at p95. For positive shield at 4,096 Actors,
copy B appears 28.05% faster in the first order and 13.14% slower in the reverse
order. The same implementation cannot justify an optimization claim from those
opposite apparent advantages. This Windows setup has not demonstrated the
repeatability needed to accept small changes for these cases.

CPU-counter calibration distinguishes busy from idle work, but observed readings
advance in 15–16 ms steps. The instrumented helpers report zero thread CPU time in
256 of 600 measured batches; that does not mean the operations used no CPU. Even
sums combine disjoint, coarsely accounted windows. They cannot reliably attribute
small differences to scheduling, runtime compilation, clock frequency or other
causes. The [Node counter contract](https://nodejs.org/download/release/v24.9.0/docs/api/process.html#processcpuusagepreviousvalue)
also permits whole-process CPU to exceed wall time when runtime threads work in
parallel. These diagnostics are not replacement acceptance measurements.

Reproduce from two independently prepared initial-v0.38 game locations with
identical packages and the matching SDK build, using Node 24.9.0:

```sh
node scripts/calibrate-restoration-cpu.mjs .artifacts/cpu-calibration-new.json
node scripts/diagnose-restoration-timing.mjs --a /path/to/first/location.json --b /path/to/second/location.json --calibration .artifacts/cpu-calibration-new.json
```

The calibration output must be new. The diagnosis checks package and source
identity, refuses inherited Node instrumentation, and writes a fresh output
directory. Keep other CPU-heavy jobs stopped. Further performance proposals need
better measurement controls and demonstrated repeatability; no threshold is
relaxed and no faster sample is selected as the result.

### Linux repeatability check

The [Linux diagnosis plan](../baseline/milestone-forty-three/linux-diagnosis-plan.json)
repeats that same protocol on Node 24.9.0 in a separate Ubuntu 24.04 job. It pins
the original 201 runtime outputs and 997 adapted game source files by hash. Two
fresh installs must also have identical complete packages. Build and installation
finish before measurement; every raw run and failure log is retained as a workflow
artifact. A successful job means the protocol and gameplay outcomes passed; it
does not mean the timings satisfy optimization acceptance.

Use a fresh checkout to preserve existing adapter work:

```sh
npm ci
npm run build
npm run reference:prepare
npm run reference:install
npm run diagnose:restoration
```

`npm run diagnose:restoration -- --prepare-only` validates the two-install setup without collecting timings and
also works on Windows. Measurement mode requires Linux. The workflow records a
small explicit environment description without collecting credentials. GitHub's
[runner contract](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
provides a fresh VM for this runner class; it does not establish exclusive physical
hardware or stable timing. Evaluate the retained pairs before using this runner
for performance decisions. Cross-OS timings do not measure a code improvement or
represent Steam Deck or mobile hardware.

The first hosted attempt stopped during preparation because a direct Node launch
left the adapter without npm's executable path. No timings were collected. The
npm script now supplies that path to child installations, and the driver refuses
direct launches without it. The failed run remains available in the
[setup correction record](../evidence/milestone-forty-three/linux-diagnosis-setup-correction.json).

The corrected [Linux run](../evidence/milestone-forty-three/linux-diagnosis/summary.json)
completes all eight processes and preserves all 1,200 samples and accepted gameplay
outcomes. Calibration observes one-microsecond CPU-counter increments, and none of
the 600 instrumented measured batches reports zero thread CPU. However, ten of
twelve ordinary identical-code pairs exceed five percent in median time; seven
exceed ten percent at p95. The two 4,096-Actor positive-shield comparisons make
copy B appear 14.89% and 6.36% slower despite identical code. Moving to this Linux
job alone therefore does not establish the required repeatability. No optimization
is accepted, no threshold changes, and these results do not identify the cause.

Neither these observations nor desktop measurements establish
Steam Deck, mobile, Unity, Godot or Unreal compatibility. Those deliverables,
current-source/content reconciliation and the remaining system families stay open.
