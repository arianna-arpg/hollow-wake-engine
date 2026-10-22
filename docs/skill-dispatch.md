# Complete skill request dispatch

`@hollow-wake/engine/casting/dispatch` exports `SkillDispatch`. One instance
orchestrates the complete request for one simulation, through creation of an
actor-owned cast or immediate delivery. This optional entry does not become an
eager dependency of the core import.

```ts
const dispatcher = new SkillDispatch(ports);
const handled = dispatcher.request(actor, skill, aim, seatPress);
```

The result is always a boolean. `true` includes toggles and redirects, so it
does not guarantee a new cast exists. `false` can follow an earlier reserve
payment or, for a missing concentration quarry, ordinary payment and charge
consumption. A request is an ordered operation, not an atomic transaction.

The first port delegates to `SkillRequest.preflight`. Its exact `'continue'`
result enters the remaining policy; either boolean returns immediately. Bind
redirects to the host's complete request entry, so conversion, mimic, combo and
scramble requests re-enter admission. A generic re-entry guard would break
these operations. The Hollow Wake adapter retains its existing preflight
instance and replaces the accepted `World.useSkill` with one dispatcher call.

## Borrowed state and host services

`DispatchActor`, `DispatchInstance`, `DispatchCast` and `DispatchZone` are
structural views of host records. Actors keep their maps, balances, reservations,
cooldowns, aim, facing, casts and shell state. Skill sockets, modifier contexts
and target records retain their identities. No entity snapshot, per-request
result object, database query or serialization is introduced.

The generic ports retain the host's actor, skill, aim, facing, target, tags,
modifier, zone and identity types. Identity defaults to numbers. Aim can be
three-dimensional and facing can be a quaternion or another host representation.
`copyAim` must return a distinct owned value preserving every dimension. The
policy intentionally copies at the original stamp points. Instant delivery
receives the original request aim. Previously active aim may be null.

Bind receiver-dependent methods through closures. The constructor copies and
freezes the function table without reading gameplay state. `ammunition()` is
resolved at request time because a host can initialize that service later.
The returned service is the existing `AmmunitionPressPorts` binding; commitment
continues to use `commitAmmunitionPress` and its established validation rules.

Definitions, random draws and numeric observations are trusted host inputs.
Validate content when loading it; do not repeat catalogue validation on every
press. Supply random values in `[0, 1)` and a coherent simulation clock. Existing
duration and ammunition helpers retain their own validation. Admission,
permissions and prerequisite checks must execute through the preflight binding.

`applyStatus` receives damage per second and a duration multiplier, followed by
the source label. The fumble lane passes zero damage and a `0.75` multiplier;
the host's status definition determines the resulting duration. Treating that
argument as an absolute number of seconds would change the rule.

Spatial targeting, lightweight-body promotion, actual effect execution,
presentation, ongoing cast updates and persistence remain host services.
`zones()` returns the live list on every call: expiry may change that list before
the policy removes the indexed entry. Guard callbacks receive the newly installed
cast. Feedback callbacks remain at the original points because they may consume
randomness. Their visual coordinates and typography are adapter concerns.

## Ordering and failure recovery

The [frozen boundary](skill-dispatch-boundary.md) lists the observed ordering
rules. Reserve checks and reserve spending are separate live passes. A combo
redirect clears the seat-press flag; scramble preserves it. Target lookup follows
reserve spending but precedes ordinary mana payment. Channel starts consume
combo charges while deferring mana and gauge payment. Context tags and modifiers
for overcharge are captured before timing, speed and random marker observations.
Primed flask eligibility is read after payment and the assault hook.

Callbacks are synchronous. Exceptions propagate. Earlier resource spending,
effects and other host mutations remain in place. The host must decide how to
recover from a failed effect or payment callback; the SDK cannot safely undo
arbitrary external effects.

**Intentional change: `dispatch-scramble-cleanup/v1`.** The original request sets
its scramble latch before recursive dispatch and clears it only after a normal
return. A thrown callback can therefore suppress future scrambling indefinitely.
The new dispatcher clears that temporary latch in `finally`. It still propagates
the same error and preserves earlier reserve spending. The latch setter must be
nonthrowing. Independent tests exercise consecutive failures, preserved payments
and isolation between worlds. This is a documented failure-recovery improvement;
normal gameplay observations are still compared against the unchanged original
fixture. No original fixture is regenerated for this decision.

## Verification and scope

The baseline contains 88 courses and 104 transitions produced by two fresh
original processes and the retained v0.28 adapter before implementation. The
installed comparison checks the complete captured bytes, including random draws,
call order, cast state, resources and identity relationships. Independent tests
cover 3D aim, string identity, live observations, re-entry and failure recovery.
Source guards reject changed request methods before replacing them, preserving
unrelated World members and both supported newline styles.

`examples/skill-dispatch.mjs` binds a small standalone 3D host to preflight,
dispatch, ordinary cast advancement and host-owned delivery. Its installed
consumer disables ambient randomness, browser globals and networking, and checks
the public types separately. The example's effect rule is deliberately small;
it does not implement projectile travel, collision or the complete damage model.

The new module has a 24 KiB unminified JavaScript allowance within a 448 KiB
combined package bound. Earlier module limits remain unchanged. These are code
size limits, not allocation or device-performance measurements. The benchmark
compares the frozen original, retained v0.28 and candidate using equal receipts,
rotating execution order, five warmups and 25 samples. Hardware acceptance and
Unity, Godot or Unreal installation remain separate work.

Two desktop runs produced the following candidate differences from retained
v0.28. Negative values mean less time. Every workload changed direction between
runs; this evidence supports neither a repeatable speedup nor a repeatable
slowdown. The core benchmark also passed with equal result checksums.

| Workload | Operations | Run 1 | Run 2 |
| --- | ---: | ---: | ---: |
| HUD, press and face queries | 9,216 | -2.0% | +1.0% |
| Queries and ordinary cast starts | 1,024 requests | +0.6% | -1.9% |
| Refusals and toggles | 1,024 requests | +10.6% | -2.0% |
| Complete dispatch across casting modes | 1,024 requests | +3.8% | -0.3% |

The broader dispatch workload took 45.54–46.25 ms per batch in the candidate.
It includes state resets, assertions and a mix of actual authored skills and
explicit synthetic variants. This is not a frame-time or per-device budget.
The extracted module is 18,619 bytes of unminified JavaScript. All 153 previously
accepted runtime files remain unchanged; the core is still 77,407 bytes.

This moves request orchestration, not every effect invoked by a request. It does
not complete the remaining statuses, procs, summons, spatial deliveries,
progression earning or full-runtime native integration work. Database-backed
authoring remains compatible with this boundary: compile validated definitions
before play and keep request-time state in memory.
