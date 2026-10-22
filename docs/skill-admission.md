# Skill admission

`@hollow-wake/engine/casting/admission` exports `SkillAdmission` and its structural
state, skill, gate, delivery and port types. This optional entry owns actor
eligibility and prerequisite ordering. It does not authorize or execute a complete
game input. See the [original boundary](skill-admission-boundary.md) for the three
different actor, HUD and press questions.

Create one policy with fixed synchronous ports, then pass the current actor and
skill to `canUse`, `unmetGate`, `gatesMet`, `isReflex`, `tagsForbidden`,
`primedPourOpen` or `canAct`. The policy captures a shallow frozen copy of the
ports. It retains no actor, mutable scratch, registry or query cache. Actor maps,
skill definitions and authored gate objects remain borrowed. An authored refusal
returns the same gate object; a gauge refusal returns a new `{note}` object.

The [shipped example](../examples/skill-admission.mjs) demonstrates a body lock,
lazy ammunition creation, price refusal and a reflex during an ordinary cast.
It is intentionally a small host; its successful admission is not a full cast.

## Host obligations

Supply coherent trusted actor state and live skill/stat resolution. Public state
interfaces are read-only views, not owned snapshots or validation schemas. Do not
serialize whole actors or reconstruct all maps for each query. Definitions can be
shared while each actor owns its resource banks and clocks. Ports are synchronous;
authoritative state must remain coherent during a query except for the explicit
lazy ammunition bank and internal read caches.

`useChargeBank` may create a missing bank. Early body/cooldown refusals do not call
it; a later price refusal or thrown port may leave that creation committed. There
is no rollback. Other ports should observe state, not deliver effects. Nested reads
of another coherent actor need no shared scratch, but recursive host callbacks
must terminate and must not change the outer query's authority.

The Hollow Wake adapter composes existing ammunition, resource-charge and payment
policies. `requiresUseCharge` retains ammunition-specification validation;
`chargeCostReady` retains resource-charge validation at the original nonoptional
cost check. An earlier refusal or optional cost still skips that check. Price
validation stays with the provider. The admission policy does not add eager
validation that would change short-circuit behavior.

Target selection, cast seals, trigger arming, attribute authority, redirects,
interruptions, cost commits and delivery remain host-owned. In particular, a
render poll must not run corpse targeting that can sacrifice a minion.

## Verification and diagnostic projection

The immutable original baseline contains 126 actor courses / 129 observations and
11 native World courses / 114 transitions. `reference:admission` reproduces it
without regenerating expectations. `adapter:admission` compares the installed
package and retains every unfiltered capture, plus deliberate behavioral faults.

Internal method-entry traces are diagnostics. The actor comparison removes only
eight named forwarding methods that the SDK now calls internally; all bank,
price, affordability and maximum-resource observations retain their order. It
fails on unknown method names and preserves every input, state, result and
authored-gate identity observation.

For World captures, an instrumented call stack identifies `gatesMet -> unmetGate`
and `canUse -> gatesMet -> unmetGate` forwarding. Only those nested entries are
projected away. A direct World preflight `unmetGate` remains observable. The
instrumented original, with stack annotations removed, must still equal the
accepted fixture. Target resolution, payment, execution, notes and state changes
are never projected away. The candidate does not supply any expected result.

`adapter:admission-source` rejects unreviewed method changes before writing an
overlay, supports the exact inherited ammunition/resource delegations, preserves
unrelated code and line endings, and refuses duplicate installation.

## Footprint and measurement

The admission module adds 8,938 bytes of unminified JavaScript. It is not imported
by the core entry. Its separate 12 KiB ceiling extends the combined optional
runtime budget from 400 to 412 KiB; all existing individual ceilings remain.
These byte counts are distribution evidence, not resident memory or allocation
measurements. No runtime dependency is added.

`benchmark:admission -- --previous-adapter <retained-v0.25-game>` verifies the
control files, compares 8,192 mixed actor decisions and 1,024 real HUD/press/cast
starts, rotates sample order, and requires equal derived results. Setup details,
raw timing samples and limitations accompany the report. It does not measure
completed deliveries, entire rendered frames, GC or target devices. Performance
and native-engine support require their own evidence before acceptance.
