# Ammunition banks

The optional `resources/ammunition` entry owns use-charge capacity, bank state
transitions, optional-fuel admission, press spending, passive recovery and active
restoration. These are the skill-specific use banks, separate from named combat
resources such as Fury. `Ammunition` attaches one actor's existing map; it retains
no world, input source, random generator or global registry.

## Ownership and live inputs

The host supplies an ordered equipped-skill list, resolved use-charge specs,
capacity and recovery modifiers, movement observations and cooldown presence.
The constructor binds these functions once. Their observations may change between
operations, but must be pure and coherent throughout each synchronous operation.
Replacing a callback property later does not replace the binding; changing the
data observed by that callback remains supported.

Banks are keyed by skill definition id, preserving the game's identity policy.
The first explicit bank access creates a full bank at the current capacity.
Existing banks survive skill replacement or removal; changing capacity does not
immediately clamp existing rounds. `banks` exposes the same caller-owned map.
Use separate maps for separate actors. A host must not mutate the map, its records
or rule inputs while an operation is in progress.

Capacity is the rounded sum of the authored maximum and the live skill bonus,
with a floor of one when a use-charge spec exists. A skill without a spec has
capacity zero. During recovery the implementation resolves a spec and capacity
once per bank; coherent read ports make the former repeated queries unnecessary.
Support graft resolution stays in the separately extracted support capability.

## Admission and press order

Call `requiresUseCharge` before querying a lazy bank. Ordinary ammunition needs
a positive count; empowerment and vent banks permit a dry cast. This ordering
matters: an optional-fuel cast refused for insufficient mana must not create a
bank merely while checking its eligibility. `useChargeReady` is a value-only
predicate for hosts that already have an observation.

Shared admission, cooldown gates, skill conversion, resource affordability and
input authority remain host-owned. After admission, `commitAmmunitionPress`
performs the ammunition commitment in the original order:

1. Capture the pre-spend bank count for a steps-from-bank delivery.
2. Vent the whole bank, consume one optional empowerment round, or spend ordinary
   ammunition, according to the resolved spec's precedence.
3. For the final ordinary round, read its damage multiplier. If it is a magazine
   with a positive cooldown, invoke the host's clock stamp before setting the
   reload flag.
4. Reset the rest timer and return the multiplier, repeat count and vent count.

The clock sink observes the already-spent bank with its previous reload flag and
rest timer. The game then completes its other costs and cast setup in the existing
order. These operations do not authorize a press or guarantee exactly-once
delivery. The host must not replay a committed press as if it were a pure quote.
The no-bank result is shared and frozen; funded presses return caller-owned values.

Read ports must be pure. Commit ports must not throw, reenter or change unrelated
inputs. A throwing clock sink does not refund the already-spent ammunition.
The class rejects reentry into its own operations; the standalone press helper's
sink contract remains an explicit host obligation.

## Frame semantics

The host advances cooldowns before `advance(dt)`. The original game samples
stillness before updating its later stationary accumulator; the adapter retains
that phase ordering. The SDK does not infer movement from position or elapsed time.

An expired reload first adds its configured refill and clears the reload flag.
Movement loss then applies to patient banks. Its timer counts seconds toward the
next round: movement subtracts bleed multiplied by the recovery period and frame
duration; each crossing below zero removes one round and adds one period back.
A manual bank without a trickle or drip period does not bleed here. Large losses
are bounded to 65,536 iterations per bank. An excessive loss fails before committing
that bleed calculation; earlier phase or bank commits may already have happened.

A full bank resets its timer. A drip magazine below capacity advances using
cooldown recovery followed by charge recovery, retaining the original multiplication
order. A trickle bank uses its recharge period and charge recovery. Either lane
grants at most one passive refill per update. Extra elapsed time remains in the
timer and can pay on later updates, including a zero-duration update. Changing
this to an unrestricted catch-up loop would change the game's rules.

Fractional restoration is preserved. Movement loss can turn a half-round into
minus half a round; later recovery or spending follows the original arithmetic.
The runtime does not silently clamp that legacy state. These numbers use the
SDK's existing binary64 policy, not fixed-point lockstep semantics.

## Active restoration and host completion

`restore(inst, amount?)` adds at most the missing capacity and returns the actual
amount. The default amount is the current capacity. A positive addition clears
the reload flag but retains partial rest time. A full or over-cap bank returns
zero without clearing its flag or modifying its timer.

The host selects the reload targets. Hollow Wake retains its host/own/all/patient
selection rules, cooldown refunds, presentation cues and channel-release check.
It calls the SDK once for each selected bank, then completes the original callbacks
in their original order. This entry alone is not a channel-casting implementation.

The host also owns persistence. A bank map alone omits equipped content identity,
cooldowns, active casts and paid costs; it is not a complete save snapshot.

## Validation and evidence

Public time/restoration inputs reject negative or nonfinite numbers before state
writes. Known spec fields, capacity/rate observations and borrowed bank arithmetic
are validated. Invalid borrowed data or a later throwing port can leave earlier
ordered commits intact. There is no transaction rollback or asynchronous execution.

The frozen original fixture contains 46 courses and 223 transitions, covering all
nine authored native banks, three support grafts, actual shotgun and arquebus
reloads, partial timers, scope selection, optional-fuel refusals and fractional
movement loss. Standalone comparisons cover 108 complete actor timer phases.
Independent tests cover callback order, ownership, invalid input, reentry and
bounded work. Source overlays preflight both actor and world files before writing.

The shipped `examples/ammunition.mjs` is a small host with illustrative content.
Its packed consumer checks magazine firing/reload, optional-fuel casting, separate
actor maps and a refusal that creates no state. This does not establish Unity,
Godot, Unreal, Steam Deck or mobile compatibility.

Two installed desktop runs exercise 64 real actors with native and grafted banks,
128 timed updates, movement loss, actual firing/payment/projectiles and active
reloads. Timer medians are within 1.2% of v0.21; the firing/reload workload adds
about 0.7–1.6% to that previous adapter. Against the original game, the complete
adapter remains about 4.8–6.6% slower for timers and 2.8–6.0% slower for actions.
This extraction does not establish an optimization gain. The adapter avoids
constructing an ammunition binding for actors without ammunition, but allocation,
GC, whole-frame and target-device measurements remain pending.

The rendered course empties a native repeater, earns passive recovery, empties a
scattergun and holds its actual shell-reload channel, then exhausts a socketed
Deep Reserves bank while retaining dry casting. It uses ordinary player-intent
polling and actual projectiles, damage and payments. It does not seed bank clocks
or edit recovery to accelerate the course. Screenshots are inspected after paint.
