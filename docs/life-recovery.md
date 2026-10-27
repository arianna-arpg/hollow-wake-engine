# Life recovery boundary

Milestone 42 begins with 101 frozen original-game observations. The SDK recovery
implementation and package integration are pending. Version 0.36 remains the
published baseline. Run `npm run reference:life-recovery` after preparing and
installing the pinned reference environment.

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
  cue and rider behavior, three granted proc triggers and the post-heal sweep.
  Native startup generates `native_field_patch` and `weave_break_for_breath` in
  addition to the three obvious literal definitions.
- 13 delivery cases use targeted self/ally skills, regeneration, restore streams,
  overhealing, on-hit/leech recovery, a delayed bloom and full resource refill.
  Actual World updates and authored admission execute. Native Choir of Light has
  no `castMode` and remains instant, consistent with the earlier channel baseline.
  One separately named synthetic variant enables channel mode to test pulses.

These are controlled, seeded observations. They do not prove physical input,
rendered equivalence, every healing caller, device performance or native-engine
compatibility. The source inventory identifies 31 direct `healBy` calls; it is
not a proof that dynamic or aliased calls are absent.

## Proposed ownership

The recovery capability will own `Actor.healBy`, `Actor.refillLife` and the numeric
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
invokes the current `healBy` method. Its cue follows the returned positive result,
not a separate inspection of pool growth. Riders follow successful completion.

Nonfinite inputs in the direct-method fixture are explicit diagnostics of native
IEEE-number behavior. They do not establish validity of untrusted content. Owned
proc content must reject nonfinite fields and incompatible skill-heal fields.

## Remaining acceptance

Implement and test the standalone capability against the committed observations,
add strict owned proc-heal content, a guarded game adapter, independent package
consumers and deliberate-error tests. Verify the real game and renderer with the
new package. Measure representative workloads against the retained v0.36 control
before choosing optimizations; keep physical Steam Deck/mobile acceptance open.
