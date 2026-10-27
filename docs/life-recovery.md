# Life recovery boundary

Milestone 42 has an unpublished recovery candidate and an installed game adapter.
Its original 101-case baseline is unchanged. Separate three-case method-resolution
and thirteen-case cue addenda record discoveries during implementation and fault
testing. A four-case invocation addendum records customized callable behavior. Version 0.36 remains the published baseline. Renderer, performance and
managed-game acceptance are pending.
Run `npm run reference:life-recovery` after preparing and installing the pinned
reference environment to reproduce all 121 native observations.
The [verification checkpoint](../evidence/milestone-forty-two/adapter-checkpoint.json)
records the passing checks and the remaining release gates.
The later [invocation checkpoint](../evidence/milestone-forty-two/invocation-checkpoint.json)
records the four-case correction, 636-test verification and fresh installation.

## Authority and coverage

The source is commit `88e135e6c85d301ee7c0c3641f9fc2f92be0e140` plus its preserved
working overlay. [Acceptance](../baseline/milestone-forty-two/acceptance.json)
hashes three capture helpers, compressed observations and the source boundary.
Two original executions and one read-only execution through the published v0.36
game produce identical bytes. Existing source, installed packages and retained
controls are preserved.

- 59 Actor cases cover ordinary and silent healing, seals, reserved life, full
  refills, query order, replaced observers, nested calls and partial failure.
- 29 proc cases cover all five loaded heal definitions at three power settings,
  rider behavior, three granted proc triggers and the post-heal sweep.
  Native startup generates `native_field_patch` and `weave_break_for_breath` in
  addition to the three obvious literal definitions.
- 13 delivery cases use targeted self/ally skills, regeneration, restore streams,
  overhealing, on-hit/leech recovery, a delayed bloom and full resource refill.
  Actual World updates and authored admission execute. Native Choir of Light has
  no `castMode` and remains instant, consistent with the earlier channel baseline.
  One separately named synthetic variant enables channel mode to test pulses.
- Three [addendum cases](../baseline/milestone-forty-two/method-resolution-addendum.json)
  replace the heal method while maximum life or effect fields are being read.
  The original method remains selected for that pending call, with its original
  receiver. Two original runs and one published-v0.36 run agree byte for byte.
- Thirteen [cue cases](../baseline/milestone-forty-two/cue-observation-addendum.json)
  observe actual pulse storage, pop events and derived HUD rows. The earlier proc
  fixture records `procCues`, an optional display override, and alone cannot prove
  gain-cue publication. An injected zero-result cue fault exposed that gap. The
  addendum covers positive, zero and negative returns, failed callbacks, disabled
  cues, repeated gains, expiry and death. Both original runs and the published
  predecessor agree byte for byte; existing observations are unchanged.

These are controlled, seeded observations. They do not prove physical input,
rendered equivalence, every healing caller, device performance or native-engine
compatibility. The source inventory identifies 31 direct `healBy` calls; it is
not a proof that dynamic or aliased calls are absent.

## Candidate ownership

The recovery capability implements the transitions of `Actor.healBy`, `Actor.refillLife` and the numeric
application of the proc `heal` branch. State remains owned by the caller. Shared
synchronous ports supply the existing life ceiling, maximum life, healing rate,
observation hooks and recency stamp. No per-actor runtime or copied Actor is needed
for these operations; allocation and throughput still require measurement.

The existing `ResourcePayment.lifeCeiling` remains authoritative for reservation
arithmetic. The game adapter must retain current native method overrides, the sim
tap, progression observer, cue publication and rider tail. It must preserve all
unrelated Actor/World methods and use the actual installed package.

Proc healing has `flat` and `pctMax` fields. Targeted skill healing instead uses
`amount`, `pctMax`, `excludeCaster` and `chain`. They require distinct schemas.
Target selection, critical healing, skill power, chain routing, over-time
conversion, overheal defenses, threat and delivery remain separate policies.
Moving the common recovery gate must not silently claim those policies extracted.

## Observed transition rules

Nonpositive healing or a dead actor returns zero before ceiling/rate queries.
Otherwise the native method saves the old life, resolves the ceiling and seal,
then evaluates the current life plus rate-adjusted healing. A lowered cap can
reduce life and return a negative result. The extraction must retain that result.

For a positive result, the sim tap precedes the current actor observer. Silent
healing invokes both but skips recency and the accumulated heal event. Ordinary
healing stamps recency before adding to the accumulator. Hooks may mutate state,
replace observers, nest another heal or throw. Earlier state changes survive a
failure; no rollback is implied. Query ordering matters: a ceiling callback can
change the seal, while a rate callback runs after the addition's life operand
has already been sampled.

Full refill assigns maximum life directly. It bypasses the seal, reservation,
healing rate and dead check. Only positive growth notifies the actor observer,
with `silent=true`; it does not invoke the sim tap or stamp a heal event.

The proc branch always evaluates maximum life, even for a flat-only effect, and
selects the current `healBy` method before evaluating the amount. Replacing that
method during an amount query affects subsequent calls, not the pending call.
Its cue follows the returned positive result,
not a separate inspection of pool growth. Riders follow successful completion.

Nonfinite inputs in the direct-method fixture are explicit diagnostics of native
IEEE-number behavior. They do not establish validity of untrusted content. Owned
proc content must reject nonfinite fields and incompatible skill-heal fields.

## Standalone use and checks

Import `healLife`, `refillLife` and `applyProcHeal` from
`@hollow-wake/engine/combat/recovery`. Supply caller-owned state and shared ports;
`applyProcHeal(actor, effect, ports, actor.heal)` passes the selected method without
allocating a bound function on each call. Notifications return `undefined` so
TypeScript rejects accidentally asynchronous ports. JavaScript hosts must uphold
the same synchronous contract.

Invocation uses the standard call intrinsic captured once when the module loads.
It never reads the selected function's own `.call` property. The
[invocation addendum](../baseline/milestone-forty-two/invocation-addendum.json)
preserves callable Proxy traps and bound receivers, as demonstrated through the
original World. All four added cases fail against the retained initial SDK and
pass with this correction. No argument array or binding is created per heal;
this source-level property is not a claim of zero runtime allocation.

`@hollow-wake/engine/combat/recovery-content` separately exports
`compileProcHealingEffect`. It accepts plain proc-heal records, validates finite
numbers and returns detached frozen content. Unknown fields, accessors, hidden
properties and the different targeted-skill schema are rejected. Compilation is
a content-loading operation, outside the per-heal path.

Seventy-four focused tests cover native direct transitions, method selection and
invocation, strict content and independent actor isolation. `test:life-recovery-mutations` rejects
seventeen deliberate runtime faults in disposable modules. `test:life-recovery-package`
installs a fresh archive, checks public types and runs the example with ambient
randomness, clocks, browser globals and network access unavailable. The optional
JavaScript modules total 3,669 bytes, within a 4 KiB allowance. This size gate is
not a throughput, allocation-volume or hardware measurement.

## Installed game adapter

The adapter delegates the bodies of `healBy` and `refillLife`, and the `heal` case
of `World.executeProc`. Shared frozen ports use the current native methods and
callbacks. The exclusive Actor tap import moves into the binding; an additional
caller prevents that removal. Actor field layout, other methods, the other 21
proc cases and the rider tail are preserved. No new Actor field is introduced.

The source tests reject 188 changed inputs across LF and CRLF files before any
target is written. `adapter:prepare` runs those controls before applying the
recovery overlay. For a separate prepared predecessor, use
`adapter:recovery-source -- --game <path>`.

`adapter:recovery -- --location <location.json>` checks the installed archive and
compares all 121 native observations without changing game source or the package.
`adapter:recovery-faults -- --location <location.json>` then requires that matching
receipt, copies the source and installed SDK into a fresh disposable graph, and
tests runtime, port and World faults there. Legacy mutation harnesses must finish
before either comparison; input hashes reject a graph changed by another test.
All seventeen injected integration faults are detected, including a healing cue
incorrectly emitted for a zero result. Supplied source and package files remain
unchanged; the disposable copies are restored after every fault.

Game, launcher and simulation type checks and the simulation smoke suite pass.
The prior ward/effect, delayed-effect and buff comparisons also pass. The new
adapter changes two source files and adds one binding; 993 other game source
files and all 189 predecessor runtime outputs are unchanged.

## Desktop measurement baseline

The [frozen plan](../baseline/milestone-forty-two/performance-plan.json) compares
the initial recovery adapter with retained v0.36 in separate Node processes.
Two runs reverse process order and retain 900 timings and 112 heap observations.
All nine workloads produce identical complete outcome records. The
[report and raw samples](../evidence/milestone-forty-two/recovery-initial-performance.json)
retain both runs, including the unfavorable results.

Silent healing is 30.1–51.6% slower in the controlled 131,072-call batches:
11.08/12.77 ms versus 8.51/8.42 ms. Ordinary healing is 3.2–18.1% slower.
Proc and world-update rankings vary substantially between runs; their cause has
not been isolated. Used native Actor batches show identical retained bytes in
both runs at 1,024 and 4,096 Actors. This does not measure allocation volume.

Reproduce with `npm run benchmark:recovery -- --location <candidate-location.json>
--previous-adapter <retained-v036-game> --order previous,current`, then reverse
the order. The installed candidate must match the current runtime build and
guarded adapter output. The runner preserves all inputs and rejects outcomes
that differ from the validation performed before timing. `--validate-only`
checks paths and Actor release without recording performance results.

Each game gets its own process so the versions do not share V8's runtime type
feedback. This isolation is a measurement choice informed by
[V8's description of inline caches](https://v8.dev/blog/system-analyzer).
CPU sampling with [Node's profiler](https://github.com/nodejs/node/blob/v24.9.0/doc/api/cli.md#--cpu-prof)
is diagnostic; instrumented timings are not acceptance measurements.
The [retained diagnostic](../evidence/milestone-forty-two/recovery-profile.json)
includes sanitized profiles and inlining traces. It confirms that `healLife`
can be inlined and identifies stat queries and callback delivery for further
investigation. It does not establish a single cause for the measured overhead.

## Notification-layout experiment

The [notification-layout experiment](../evidence/milestone-forty-two/recovery-notification-performance.json)
compares native v0.36, the invocation-corrected candidate and a proposed private
notification helper. Two runs reverse process order and retain 1,350 timings and
168 heap observations. All complete outcome records agree, and the proposal
passes 74 focused tests, 121 installed observations and seventeen installed faults.

The proposal is **rejected**. Ordinary healing changes by -2.6% and +2.9% against
the corrected control; silent healing changes by -4.8% and +44.1%. Neither target
meets the required improvement in both runs. Refill batches are 6.8% and 18.0%
slower. The already-full path improves 29.7–36.7%, but that does not satisfy the
preselected positive-healing target or waive the regression rule. Both Actor
batch sizes have identical median retained bytes between the two candidates.
The proposed modules add 78 bytes without a qualifying benefit; the selected
runtime remains 3,669 bytes with no new per-Actor fields.

The corrected control's ordinary and silent rankings against v0.36 also change
between runs. These measurements do not establish that the invocation repair
improved performance, or isolate the cause of differences in unchanged paths.
The report preserves every workload, the rejected source patch and raw samples.
To repeat the three-graph comparison, add `--comparison-adapter <corrected-game>`
and use `--order previous,comparison,current`, then reverse that order. Keep each
installed graph distinct and build the proposed runtime before measuring it.

The original 117-case candidate, corrected candidate and rejected experiment are
retained separately.

## Player-visible recovery

The [renderer checkpoint](../evidence/milestone-forty-two/renderer-checkpoint.json)
records fifteen stages through the installed SDK. Two independent runs of the
retained native-healing renderer establish the expected observations before the
SDK comparison. Its source and compiled runtime match published v0.36; its older
package metadata is recorded separately. The SDK reproduces every observation
byte-for-byte, including actual canvas calls, callback records and clock values.
The [source-format decision](../baseline/milestone-forty-two/healing-ui-format-decision.json)
retains the exact Windows capture script and pins its LF form for clean Git
checkouts. Only line endings change; the original acceptance and expected
observations remain unchanged, and the LF script passes the same fifteen stages.

Native input drives authored Mend and Greater Mending, preserving instant and
1.1-second cast timing. The controlled 1,000-life character displays +66 and +160
heals, a +10 heal clipped at a 510-life seal, and a full refill that bypasses the
seal. Normal, paused and slowed world frames drive silent regeneration. A
controlled block event reaches native Guarded Heart selection and execution;
its gain glyph is drawn, expires, and is absent when life is already full.
Refill and the block event are explicit host inputs, not physical combat input.

Run `npm run adapter:recovery-ui -- --game <game> --dist <built-bundle>
--electron <electron-executable>`. The runner requires a current installed
adapter and a source/runtime-matched bundle. It uses a hidden window and
disposable saves, preserves its inputs, and never regenerates expectations.
The previous fourteen buff, ten proc and nine delayed-effect renderer stages
also pass; the delayed suite retains its declared ambient-random limitation.

Sampled screenshots show the life values, healing text and gain glyphs. The
native gold seal label overlaps the life number at this position; this existing
presentation is retained. These checks do not establish portable pixel identity,
renderer FPS or physical-device performance.

## Remaining acceptance

Review managed game integration with the final package, then complete final
package and publication checks. Keep physical Steam Deck/mobile acceptance open;
desktop path measurements do not establish a device or general game speedup.
