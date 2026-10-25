# Effect extraction baseline

This is the next extraction boundary after published v0.33. Effect execution
remains in the game. The [accepted original fixtures](../baseline/milestone-thirty-nine/acceptance.json)
establish a comparison point before its implementation changes.

## Source and scope

The original executor contains 22 branches. Its initialized catalogue supplies
147 proc definitions across 21 effect shapes; `birth` also enters through
programmatic effects such as combo payoffs. The
[source inventory](../baseline/milestone-thirty-nine/source-boundaries.json)
records each branch and the callers that reach the executor. A catalogue-only
scan would miss part of the required runtime.

All observations come from the pinned original source and its 31 preserved
overlays. Each capture ran twice against the original and once against the
retained v0.33 game adapter, producing identical bytes. Both sets of source and
all 177 installed runtime files were checked for preservation. The retained
package is the final v0.33 archive; earlier timing receipts keep their measured
archive identity.

| Observation | Cases | What is established |
| --- | ---: | --- |
| Native execution | 22 | One representative per branch, actual World/Actor calls, selected resulting state, cues, random draws and delayed resolution |
| Magnitude folding | 1,036 | All 147 authored inputs plus synthetic `birth`, seven powers, arithmetic, input preservation, object identity, nested identity and own keys |
| Ward edges | 7 | Positive, suppressed, dead, negative, zero-power, nested and committed-failure behavior |
| Delayed edges | 8 | Due-time equality, dead owners, live level/team, captured geometry/tier, removal before failure and deferred insertion during resolution |
| Ward resource boundary | 15 | Lazy rate lookup, uncapped gain, suppressed/dead requests, callback failures, nested grants and live pool/death changes |
| Magnitude metadata | 8 | Frozen input preservation, nested copy rules, explicit undefined keys and unknown-tag passthrough diagnostics |

The last two rows are accepted by a separate
[ward addendum](../baseline/milestone-thirty-nine/ward-addendum.json); the original
1,073-case acceptance remains unchanged. The combined command checks 1,096 cases.

The observation wrappers call through to real effects. The native examples
include actual damage, resource changes, spawning and delayed resolution.
Their state captures cover named fields, not every internal field or pixel.
Helper comments and trace scope strings are retained from discovery; the
acceptance manifest records the later acceptance of these bounded observations.

## Compatibility requirements

Magnitude folding preserves the input object at power one and whenever
`!(power > 0)`. This includes zero, negative power and NaN. Structural effects
also retain identity. Positive scaling of the twelve numeric shapes creates
the original shallow copies, including specific nested copies and explicit
undefined properties. Nonfinite samples document this compatibility function;
they do not permit nonfinite values in serialized content.

Ward uses the caster's maximum life and the normal resource gain method.
Nonpositive requests skip that method. A successful gain can remain committed
when a callback subsequently throws; the remaining rider tail then does not
run. Synchronous nested effects have distinct causal calls and retain order.

A delayed burst captures location, tier and causal depth when scheduled.
Its owner's level and team remain live until resolution, and owner death does
not cancel it. A due entry is removed before its effects run. If an effect
throws, earlier changes remain committed and the removed entry is not retried.
A same-time entry appended during resolution waits for the next pass.

Future scheduling optimizations must preserve the original due-entry order,
actor order and callback visibility. The current baseline covers the stated
examples; additional queue mutation and re-entry cases will be needed before
replacing the full scheduler.

## First implementation path and acceptance

The [runtime contract](../baseline/milestone-thirty-nine/runtime-contract.json)
specifies three optional functions before implementation: `scaleProcEffect`,
`gainWard` and `applyWardEffect`, under `combat/effects`. The first describes
minimum magnitude fields, with numeric result types widened after scaling.
Application metadata follows the original copy behavior: damage/cast copies
retain extra fields, while a scaled `healAllies` copies only `base` and
`perLevel`. These minimum types do not claim a complete effect schema.

Ward functions borrow plain state and shared synchronous ports. `gainWard`
queries the rate only after the original admission guard; a callback may change
the pool or trigger a nested grant before the outer addition. Death during that
query does not introduce a second guard. `applyWardEffect` computes its amount
before capturing the pool and reports actual growth, not the gain callback's
return value. The host then delivers cues and the existing rider hook in order.
The proposed module has a 4 KiB JavaScript allowance; prior module and core
allowances remain unchanged. This is a size limit, not a performance result.

Begin with the pure magnitude fold and a complete ward path, retaining the
native resource/cue/rider observation boundaries. Extend the time-dependent
path only after its queue and target-selection requirements are captured.
The SDK owns gameplay decisions; adapters supply spatial observations, native
presentation and explicit state access. Host services must remain visible in
the contract instead of being hidden in a nominally portable payload.

Before accepting an extracted path, require unchanged original fixtures through
an installed package, independent arithmetic and state assertions, deliberate
fault detection, re-entry/exception coverage, a real game flow and bounded
package costs. Measure realistic workloads with competing jobs stopped and
retain matching gameplay receipts. Device results require actual device runs.

Further observations are still required for cooldown filter intersections,
cleanse membership, spatial ties and tiers, summon caps, missing targets,
cast continuation and resource variants. One successful branch example does
not establish all those paths. All 22 effect branches and the remaining
completion inventory stay in scope; baseline acceptance changes no family's
completion status.

## Reproduction

After preparing the pinned reference and its dependencies, run:

```sh
npm run reference:proc-effects
```

This type-checks all five original capture helpers, verifies their hashes,
executes them against the preserved source and compares the results with the
accepted compressed fixtures. It writes fresh diagnostic outputs under
`.artifacts` and never regenerates expected results. The source lock, helper
hashes and source-boundary digest are checked before comparisons.
