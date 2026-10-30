# Landed-hit reactions

The optional `combat/hit-reactions` entry supplies `createHitReactions` for the
complete 29-statement phase after hit sustain and before volatile retaliation.
The development game adapter delegates this whole ordered phase through the
installed package. The frozen original baseline predates this implementation.
Independent runtime, package and installed-game verification remain separate
acceptance gates; device measurements are not inferred from these checks.

## Ownership and ordering

The phase stamps combat and strike evidence, extends alerts, updates drives,
spills loot and essence, resets recent wounds, releases primed pours, adds threat,
removes fragile buffs, taps charges, sheds orbs and advances channel spooling.
It then dispatches rouse and ambush responses, propagates stealth alerts, feeds
watch state, publishes damage/outcome cues, and dispatches poise, shield,
defense, critical, high-roll and damage-taken events.

The SDK boundary owns these gates, arithmetic, state writes and dispatch
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

## Runtime API

Bind one reusable service per world with `createHitReactions(ports)`. Its `apply`
method takes the caster, skill instance, target, captured definition, prepared
modifiers, borrowed packet, captured damage, causal depth, captured critical flag,
borrowed result, optional hit origin and optional hit tier, in that order. It
returns `void`; the caller continues with volatile retaliation and later phases
only after it succeeds. Non-damaging and refused contacts must not enter this
service. Zero landed damage remains eligible.

The [public types](../src/hit-reactions-types.ts) retain host position, modifier,
item, brain, watch, spill, instance and result payloads. They accept the original
nullable AI tuning records. Inputs are trusted borrowed state; validation belongs
at content loading and command admission, not in each reaction callback.

The [game binding](../adapters/hollow-wake/hitReactions.ts) provides concrete
synchronous ports. Registry lookups, timing/configuration reads, native AI and
trigger services, randomness, spatial operations, loot delivery and presentation
stay outside the portable module. Cue ports retain native argument evaluation
and result reads. `assignWatchPoint` performs live destination component writes;
`aimPoint` performs live actor-position component reads. These are distinct from
copying the already captured evidence point.

The module adds no runtime dependencies or eager core import. Bindings allocate
their callbacks once per world. Existing event-context and copied-point
allocations remain observable; this is not a zero-allocation claim. Its own
unminified JavaScript budget is 8 KiB, while the existing total package and
historical component budgets remain unchanged.

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

## Installed acceptance

The [runtime evidence](../evidence/hit-reactions/runtime-windows.json) records
1,265 passing SDK tests, 32 independent reaction contracts, 54 deliberate runtime
faults, 66 source integration controls and ten installed runtime/binding faults.
The clean package consumer checks generic host types and a 5,137-byte browser
bundle. All 22 game checks pass, including the unchanged 136-course trace, eight
native probes and 25 simulation smoke episodes. Node 22 repeats the independent
tests and installed trace. Native original-versus-installed replay matches
150,608 numeric observations exactly; cross-runtime geometry comparisons have
their separately documented tolerance.

All 276 predecessor compiled files remain unchanged. The optional module adds
6,035 unminified JavaScript bytes. Historical component budgets and the total
674 KiB package limit remain unchanged. The raw evidence retains the nullable
host-type repair, package-accounting correction and fault-observer repairs;
accepted original fixtures were not rewritten.

## Optimization and integration limits

Reuse one service binding per world; do not add a copied per-hit state wrapper
solely for extraction. Keep authoring databases and validation outside this
combat phase. A database can improve content editing, relationships and build-time
checks without making per-hit lookup faster. Runtime storage changes need measured
workloads and a contract for callback-visible mutation.

Twelve alternating timing pairs per workload compare the installed predecessor
and extraction on an i9-10900K Windows desktop, after an identical-input control.
Median extracted/predecessor ratios are 0.9828 (plain), 1.0135 (authored), 0.9882
(stat), 1.0067 (rider) and 1.0174 (Impale). Control medians range from 0.9648 to
1.0086, with broad pair-to-pair variation. These observations establish neither
a speedup nor a causal regression. Retained heap is not allocation volume, and
these common-hit workloads do not isolate all active reaction paths.

Representative active workload measurements, native-host API exposure and
physical-device acceptance remain open. Steam Deck and older mobile hardware
remain measurement targets, not inferred compatibility from a desktop test.
