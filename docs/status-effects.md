# World status effects

`@hollow-wake/engine/statuses/effects` adds `createStatusEffects`, an optional
service over borrowed actors. It composes the arithmetic exposed by `statuses`.
It adds no production dependency, ambient clock, RNG, global registry, event
queue, entity identity service or rendering engine.

## Responsibility and order

The service owns transplant, cleanse-with-cue, ringing, stack shedding, bank
spending, rupture, Doom cull, proc status application, periodic zap/lash effects,
and the status portions of expiry and death. The host supplies live definitions,
actors, geometry, skill context, shared mitigation, resistance, attribution,
death completion and presentation. Proc magnitude scaling still happens before
`applyProcStatus`. Actors may use the separate status lifecycle for application.

Call the frame phases after actor timers and the host's life/death sweep, in
order: `expireStatuses`, `zapStatuses`, `lashStatuses`. They are separate calls
to preserve the original scheduling boundary. Clocks use seconds, read from the
host at each original observation point. A missed periodic beat runs once and
schedules from the current time; it does not replay skipped beats.

Death has three phases. `capturePropagation` retains references to eligible
statuses before `detonateDeathStatuses` removes armed entries. Run
`propagateDeathStatuses` at the original later phase, after intervening death
effects. Do not deep-copy or recompute the captured list: changes to its retained
records are observable. Silent death suppresses these status phases. These
operations do not implement the rest of the game's death lifecycle.

Callbacks are synchronous and can reenter. Earlier writes remain committed if a
callback throws. Actor arrays and definitions are borrowed and queried live;
iteration ordering is part of the contract. Hosts must keep ordinary original
record invariants. This is a trusted integration API, not a save format or a
parser for arbitrary external input.

## Preserved behavior

- A bank is spent before mitigation. Zero payout still spends and flashes.
  Bank damage uses shared mitigation and then subtracts life directly.
- Ruptures use damage-taken scaling and resistance directly. They do not use
  the bank's shared defense ladder. Attribution observes life before and after
  subtraction, before text and possible death.
- Ruptures require the same story and use body-edge radius. Zaps target allies
  by center distance, without a story gate. Lashes choose the nearest eligible
  body regardless of team or story; the last equally close body wins.
- Zaps scale by stacks; lashes do not. A lash flashes when mitigation absorbs
  the damage. Neither effect invents caster attribution on death.
- Propagation takes at most six recipients per status within 170 original
  world units, in actor order. It retains caster, leech, brood and power, but
  does not copy every status field. Transplant has a different payload boundary.
- Ringing and shedding preserve modifier resynchronization, including omission
  of the status power multiplier. A single-stack ring can leave nonpositive
  remaining time for the timer phase to retire. The legacy stale-reference shed
  behavior is retained and explicitly tested.

Positions are opaque. The distance port returns authored spatial units; a 3D
host supplies its own distance/story convention. Presentation ports own position
copies and mapping text height to screen space. The game adapter uses 2D.
Its retained `ruptureStatus` diagnostic shim becomes public to TypeScript
because no in-class caller remains; its runtime name and behavior are intact.

## Evidence and reproduction

The fixture was frozen before this runtime existed. Two original runs and the
preceding installed SDK produced identical bytes for 263 courses and 152 authored
definitions. It includes real World updates and death, spatial gates, periodic
clocks, attribution, partial failures and reentry. Normal verification never
regenerates expected values.

A separate ten-course propagation observer records every candidate recipient.
It was added during fault testing after the first observer failed to distinguish
six recipients from seven: added bodies were outside its observed actor list.
The original 263-course fixture remains unchanged. The addendum is captured from
two original runs and the previous adapter, after runtime implementation, and
is identified separately rather than claimed as pre-implementation evidence.

```
npm run verify
npm run reference:status-effects
npm run adapter:status-effects-source
npm run adapter:status-effects -- --location <adapter-location.json>
```

Independent tests use plain records and hand-derived amounts. Runtime mutations
must fail assertions, not imports or parsing. Source controls reject all fourteen
method/phase boundaries, collisions and repeated installs before writes. A clean
packed consumer checks behavior, strict types with a 3D position record, and
browser bundling without the game checkout.

The optional modules have a separate 16 KiB unminified JavaScript growth guard;
the previous 616 KiB budget remains unchanged. Spatial scans are ordered live
scans. No CPU, allocation, Steam Deck or older-mobile performance improvement
is claimed.

Hit-authored and stat-granted applications, next-hit buff riders, discharge on
hit, siphon/recall delivery and the complete death lifecycle remain host-owned.
The retained [Windows evidence](../evidence/status-effects/windows.json) includes
1,087 SDK tests, all thirteen clean game checks, runtime and installed fault
controls, and the native attack replay: 150,608 numeric observations match the
original through the C/C++ host. That replay covers the existing 114 attack checks;
the detailed status courses run in JavaScript. It supplies no new native actor API.
Complete Unity/Godot/Unreal packages, current-source reconciliation, renderer
acceptance and device measurement remain separate gates. The existing
affliction-cue probe's terrain assertion is documented in
[status lifecycle](status-lifecycle.md); this module does not suppress it.

## Registration-order repair

Hosted verification of the preceding status checkpoint exposed `takenAs_*`
registration moving ahead of charge and gauge definitions. The status binding
had been prepended to Actor's imports and brought reception in early. The adapter
now inserts it at the original reception import slot. The SDK runtime and frozen
passive expectations are unchanged. The complete 4,103 passive rebuild observer
distinguishes the old and repaired loading order; its original ordering remains
required. A trial change to the damage adapter did not resolve the issue and was
discarded.

The real Grounding Relay exposed a second startup issue: the earlier adapter
constructed its immutable SDK relay vocabulary before authored unique items
registered their relays. A twelve-course original observer captures the authored
item, recipient gates and explicit late registration/order changes. The adapter
now rebuilds the service only when the ordered vocabulary changes. The public
SDK's immutable configuration contract is unchanged; the host binding owns content
refresh. The ordinary comparison allocates no arrays. This is a correctness repair,
not a measured performance claim.

The game's status-voice probe includes a source census. Its isolated overlay now
checks World plus the installed status-effects module for the two moved captions;
every original assertion remains. This extends its input scope, and does not turn
the source census into renderer acceptance.
