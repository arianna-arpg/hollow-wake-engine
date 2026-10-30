# Landed-hit reactions

This checkpoint establishes the original behavior of the complete 29-statement
phase after hit sustain and before volatile retaliation. It does not yet move
that phase into the SDK runtime. The next extraction must implement this whole
ordered phase and compare the installed package against this baseline.

## Ownership and ordering

The phase stamps combat and strike evidence, extends alerts, updates drives,
spills loot and essence, resets recent wounds, releases primed pours, adds threat,
removes fragile buffs, taps charges, sheds orbs and advances channel spooling.
It then dispatches rouse and ambush responses, propagates stealth alerts, feeds
watch state, publishes damage/outcome cues, and dispatches poise, shield,
defense, critical, high-roll and damage-taken events.

The SDK boundary will own these gates, arithmetic, state writes and dispatch
order. Actors, spatial observations, authored perception/threat/orb policy,
randomness, underlying loot/AI/trigger services and presentation remain explicit
host ports. This separates reusable gameplay policy from a particular scene,
renderer or storage backend.

The caller has already admitted a damaging contact and captured its damage,
critical result and causal depth. A landed hit with zero damage still reaches
combat stamps, fragile-buff removal and charge dispatch. Evade, block, immunity
and non-damaging skill admission differ. The baseline executes the full native
resolver to preserve those distinctions.

Order is part of the contract:

- Time is read repeatedly. A callback or setter can change later timestamps.
- Threat uses the captured damage, current skill context and freshly obtained
  instance modifiers. Explicit zero tuning must not fall back to defaults.
- Fragile buffs use live Map iteration. Appended entries can be visited and
  removed entries skipped. Replacing the Map does not replace its active iterator.
- Charge, orb and spool work requires depth exactly zero. Orb keys are enumerated
  once per hit; the outer cap check and the native shed cap are separate gates.
- Charge callbacks can replace or cancel the current channel before spooling.
- Stealth alerts traverse the live actor array and use an inclusive 320-unit
  radius. The original has no same-story filter here. Existing peer alert-origin
  identity is retained; duration can still extend.
- Watch updates preserve an existing watch-point object and the maximum rung.
- Damage and critical trigger admission use earlier captures. Cue critical flags,
  outcome flags, roll fraction, trigger depth and target position remain live.
- Shield-break state clears before its callback. Nested hits keep their own
  captured values; thrown callbacks retain preceding writes and stop continuation.

These are observed legacy semantics, not a validated public content-import
schema. Any later intentional correction requires a separately reviewed behavior
decision rather than silently replacing the accepted trace.

## Reproduction

`npm run reference:hit-reactions` type-checks the observer, runs it against the
pinned original and compares all 136 courses with the immutable accepted trace.
`npm run reference:hit-reactions -- --game <path>` checks another prepared game.
Independent assertions verify actual values, identities, gates and ordering in
addition to complete trace equality.

`npm run test:hit-reactions-observer` materializes an isolated original and runs a
positive control plus 55 deliberate faults covering all 29 statements. Each fault
must change the trace without adding an unrelated exception or dropping a course.
A fault that skips a callback may remove the error deliberately injected there.
The original source and expected files are verified unchanged after the run.
`--acceptance <path>` permits the same checks on a provisional baseline before
freezing it; it never rewrites expectations.

The [acceptance record](../baseline/hit-reactions/acceptance.json) binds the source
boundary, observer, independent assertions and compressed trace by SHA-256. Two
original runs, the installed predecessor and Node 22 agree exactly before extraction.
Eight callback-error courses intentionally throw; they test partial writes.
The [checkpoint evidence](../evidence/hit-reactions/baseline-windows.json) records
completed checks and retains the development repairs and verification logs.

Observer development found and repaired meaningful coverage gaps before freezing:
fixed damage ranges did not produce a high-roll fraction; the trigger courses now
use real ranged damage. Skill-instance/definition identities and explicit tier zero
are observable. Actor-list removal and append courses prevent a copied-list
optimization from passing unnoticed. The clock course changes time through a
write instead of making observation itself increment the clock.

## Optimization and integration limits

Reuse one service binding per world; do not add a copied per-hit state wrapper
solely for extraction. Keep authoring databases and validation outside this
combat phase. A database can improve content editing, relationships and build-time
checks without making per-hit lookup faster. Runtime storage changes need measured
workloads and a contract for callback-visible mutation.

This baseline establishes no speedup, zero-allocation guarantee or physical-device
result. Runtime extraction, installed-package verification, representative active
workload measurements and native-host exposure remain subsequent acceptance work.
Steam Deck and older mobile hardware remain measurement targets, not inferred
compatibility from a desktop test.
