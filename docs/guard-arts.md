# Guard disciplines

`@hollow-wake/engine/guard/arts` owns Shield Up's plates, voluntary ram contacts,
cast absorb layers, patience, bash waves, delayed and break bursts, outcome
satellites, lethal intervention and warning geometry. It also exports authored
patch resolution, validation and the capacity/absorb formulas. The module is
optional and has no runtime imports or engine dependencies.

The [typed consumer](../test/guard-arts-consumer.ts) shows the public types.
The concrete Hollow Wake [lifecycle binding](../adapters/hollow-wake/guardArts.ts)
and [value binding](../adapters/hollow-wake/guardArtsSpec.ts) demonstrate every
required service against real actors and skills.

## Host integration

Create one `GuardArts` per simulation, supplying `GuardArtsPorts` over a single
actor/skill graph. `createGuardArtsState` supplies an explicit state owner; omit
it to create a fresh independent one. Do not bind two advancing controllers to
the same state. State records are live borrowed objects, not serialized saves.

Call `sync(actor)` after build derivation and `rebind()` after a zone change.
Call `raised`, `guardHit` and `lower` from the corresponding held-guard events,
`ram` only from voluntary travel, `cast` for cast-absorb execution, `bashWave`
after the ordinary bash, and `satellitePayload` from the satellite conductor.
Advance `update(dt)` once per simulation step. Read `visuals` or `warnings()`
to render the resulting geometry. Dispose with `clearAll()`.

The existing [guard casting](guard-casting.md) module owns held-cast timing and
release decisions. The shared damage pipeline owns absorb spending/expiry;
the original game binding already connects it through `spendAbsorbLayers`.
Hosts still own actor presence, skill execution, actual hit application,
movement, sight, rendering and durable publication. Guards do not query a
database per hit. Authored records and live effect state remain separate.

All services are trusted and synchronous. Their receiver is retained, and
services are read from the supplied ports object on each call. Reads and effects
preserve original order; effects can influence later reads. Exceptions retain
preceding borrowed writes. This is not a transaction or automatic graph clone.
A private rebuild must use detached actors, skills and effects throughout its
ports. Passing a private stat sheet with callbacks into a live World is unsafe.

The host admits valid specs, finite timing/stat inputs, ordered nonnegative
satellite slots and random draws in `[0,1)`. `guardArtsErrors` reproduces the
original authoring checks; it is not a schema validator for arbitrary untrusted
JSON. `resolveGuardArts` merges distinct tree patches lexically and shallowly;
nested definitions remain borrowed. Definitions, ports and supplied limits
must not be changed during an operation. Default limits are frozen; custom
limits remain host-owned and must be finite, with positive integer capacities
and a reduction fraction in `[0,1]`.

Only the owner of an active absorb layer may deliver its `ended` callback, once
when that layer breaks or expires. Replacement and explicit cleanup silently
retire the layer: do not retain and invoke its old callback. Policy validation
does not make externally retained callbacks revocable handles.

## Preserved behavior

- Raw tree-node order, skill/support levels and resolved rules form the policy.
  A changed policy retires the former state even if its net bonuses match.
- Lowering resets plates and their clock while retaining contact cooldowns.
  Each update awards at most one plate and retains the modulo remainder.
- Plate and passive block reductions multiply; the random draw occurs only
  for a positive damaging interception with that block rule.
- Patience applies to the first cast and to the exact subsequent deadline.
  Replacing a shield is silent. Delayed blasts use actor-scaled elapsed time;
  satellite outcomes expire against absolute simulation time.
- Lethal intervention stamps recovery before effects can reenter damage.
  Its recovery belongs to the host actor's saved `guardIntervention` record.
- Cleanup removes the matching actor/skill's projectiles and effects without
  cancelling its held cast. The casting/build owner decides cancellation.
- Ram contact observes facing, travel direction, tier, distance and sight;
  traversal stops when its caster dies or the active cast object changes.

Default pending blasts are capped at 16 and lite-body promotion at eight per
ram call. Outcome banks use authored caps. These bounds limit selected work;
they do not bound the host's actor roster, callbacks or content size. This
milestone introduces no database dependency or physical-device speed claim.

## Reproduction

After `npm run build`, run:

```sh
npm run test:guard-arts-package
npm run reference:build-lifecycles
npm run adapter:guard-arts
```

The package course runs 25 independent contracts from an installed archive,
then from a browser bundle with ambient services blocked. Public types and 19
deliberate faults are checked, followed by a restored control. Separate size
ceilings are 32 KiB unminified module and 16 KiB browser bundle; predecessor
budgets remain unchanged. Measured size is reported by each run.

The original-only course compares 17 guard, 14 bonded-beast and nine persistent
body rebuild checkpoints in two fresh processes, plus the original Shield Up
harness's 16 assertion groups. Accepted observations are never regenerated by
verification. Companion captures establish remaining build boundaries; they
do not claim extraction of bonded-beast execution.

The installed-game course replaces only the two guard modules in memory,
typechecks the complete pinned game and compares those same four courses.
Five additional ownership assertions run against the original and installed
binding, including other skills' projectiles from the same caster. It tests
guarded two-file installation and five deliberate runtime/binding faults.
The original game checkout is untouched. Full SDK completion, complete private
authored builds, acknowledgement-time publication, native-engine delivery of
these new rules and Steam Deck/older-mobile measurements remain separate gates.
