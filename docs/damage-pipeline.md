# Shared damage pipeline

`@hollow-wake/engine/combat/damage` exposes `createDamagePipeline`, a synchronous
service for the full original damage ladder. It owns outgoing roll/preview,
conversion, accuracy, block, armor/resistance, defensive pools, life landing,
sustain, damage over time, absorption layers and their expiry. It has no runtime
imports, clock, ambient random stream, content registry or engine dependency.

This is an optional service over borrowed actor records. It is not yet the
complete standalone actor implementation or a ready-made native engine package.
The selected `Engine.resolveHit` API remains a separate, narrower capability.

## Ownership and integration

Construct one service per simulation with explicit random, skill-compilation,
travel-protection, weak-point, ply-floor, anatomy and presentation ports. The
Hollow Wake adapter delegates the existing three helper modules to this service;
actors, statuses and packets retain their original identities. Rendering, entity
authority, spatial delivery, death processing and persistence remain host-owned.

The constructor copies and freezes the numeric configuration and binds the
supplied callbacks. Changing configuration requires a new service. The default
`HOLLOW_WAKE_DAMAGE_RULES` records the original rules, including resistance caps,
armor coefficient, poise wear/drain, entropy window and conditional slayer rules.
The legacy `SLAYER_CFG` export now references these frozen defaults. This
construction-time configuration contract intentionally replaces mutable module
configuration. Actor state and stat reads remain live and synchronous.

`DamageActor`, `DamageSkill` and `DamagePorts` specify only fields the service
uses. They are structural integration types, not validated save or network
schemas. The tag vocabulary must include the five damage types, `attack` and
`aoe`. `instanceMods` must return a fresh modifier array: held-guard contributions
are appended to it. The host supplies finite random draws in `[0,1)`.

No actor is retained by the service after a call except through callbacks that
the host itself supplied. There is no per-hit shared scratch state. Nested calls
are supported. A callback exception propagates with completed writes intact;
these operations do not promise transactional rollback.

## Preserved ordering

- Outgoing conversion cascades in damage-type order. Extra damage reads one
  post-conversion total. Incoming conversion reads the original bundle once and
  normalizes routes exceeding 100 percent. Unarmed incoming conversion returns
  the original amounts object.
- Previews consume no random draws. Lucky/unlucky rolls, range draws, critical
  rolls, entropy reseeding, block, crit avoidance and steadfast shield recharge
  preserve their original draw order, including zero-chance block draws.
- Block subtracts guard from the mitigated wound before defensive pools. Leaked
  blocked hits skip ordinary-hit sustain and status multipliers.
- Ordinary mitigation runs armor/resistance and conditional damage multipliers,
  then insight, poise, endurance, aura ledgers, ward, individual absorb layers,
  legacy absorb, energy shield, mana shield, stagger, and finally the hit cap.
  Plies consume a hit after those pools and before life landing.
- Life interceptors use live iteration. Last gasp can change actual life removed
  while the hit receipt retains the pre-gasp mitigated total. Overkill is retained.
  DoT returns actual life damage and bypasses the hit-only defensive ladder.
- Absorb-layer spending and expiry iterate a snapshot. A callback replacing a
  later map entry does not replace the snapshot's later record; its original
  callback and deletion still occur. This surprising original behavior is
  preserved explicitly. Expiry is silent for dead/downed actors.
- Segment cues, recovery, culling, leech, resource flows and observation callbacks
  retain their original positions in the operation. Packet mutation is visible.

## Evidence and reproduction

The 119-course fixture was produced twice by the pinned original game and once
by the previously published installed adapter before this service existed. The
three captures match exactly. It records outputs, both actors' relevant state,
stat-query arguments/results, callback order and random draws. Two intentional
callback faults record partial failures. Normal verification never rewrites the
accepted fixture.

Independent tests check arithmetic and ordering, isolation, re-entry, partial
failures, snapshot semantics and configuration ownership. Nineteen deliberate
runtime faults must fail behavior assertions. Adapter checks reject stale source
and verify that a failed preflight writes no files. Package checks install the
archive outside the repository, run the independent tests with ambient randomness
disabled, consume its declarations, and build a browser bundle.

```sh
npm run verify
npm run reference:damage
node scripts/test-damage-overlay.mjs
npm run adapter:prepare
node scripts/test-game-damage.mjs --location .artifacts/adapter-location.json
```

The full-game attack course additionally exercises this adapter through the
native driver and shared library. This retains the original World and content
inside a diagnostic bundle; it does not provide a complete new native actor API.
See the checkpoint's evidence for actual completed checks and remaining limits.

[Windows evidence](../evidence/damage-pipeline/windows.json) records 1,048 passing
SDK tests, the two original-reference gates, the installed fault controls and
native replay. The new optional JavaScript totals 32,770 bytes, including its
generated type-only module; the package enforces a separate 33 KiB growth limit
while retaining all predecessor limits.

No performance improvement is claimed. Stat-query order, allocations and pool
math were preserved to establish the shared boundary first. The next optimization
must measure this service inside a representative complete simulation, preserve
accepted outcomes, and report CPU and memory separately. Steam Deck and older
mobile acceptance still require device measurements.
