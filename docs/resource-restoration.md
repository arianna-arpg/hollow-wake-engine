# Resource restoration

The native baseline is accepted before implementation. The planned optional
`combat/restoration` and `combat/restoration-content` entries are not yet shipped.
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

The planned content compilers own frozen plain data records with exact fields:

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

Runtime implementation must pass independent arithmetic and content tests,
deliberate fault checks, a clean packed consumer and all 218 installed-game
observations. Adapter preparation must reject unreviewed source changes before
writing and preserve other members, existing delegations and other proc cases.
Relevant gameplay regressions and a renderer course remain separate acceptance
steps. Timed World cases exercise host composition; they do not claim that stream
scheduling or all defensive lifecycle rules have been extracted.

The [measurement plan](../baseline/milestone-forty-three/performance-plan.json)
requires receipt-checked paired comparisons and profiles before adopting an
optimization. Neither these observations nor desktop measurements establish
Steam Deck, mobile, Unity, Godot or Unreal compatibility. Those deliverables,
current-source/content reconciliation and the remaining system families stay open.
