# Cooldown lifecycle extraction boundary

The initial baseline contains 44 courses calling the original Actor, skill-price
and World methods. Two independent original runs and the installed development
adapter produce identical complete observations. The helper type-checks against
each game graph. This accepts the reference material before implementing the
remaining lifecycle SDK; it does not claim that extraction is complete.

| Boundary | Courses | Behavior observed |
| --- | ---: | --- |
| Elapsed recovery | 13 | Global/tagged reads, first matching bar instance, empty/expired clocks, live insertion/deletion, replacement destination, partial failure |
| Cooldown price | 10 | Base and imposed price, global/scoped ratio, floor, stat clamps, absorb override and payload exemption |
| Stamping/refund | 8 | Ultimate cap, ordinary exemption, nonpositive preservation, separate clock/total writes and partial failures |
| Orb refunds | 7 | Empty fast return, duplicate bar entries, unslotted clocks, nonpositive refund and partial failure |
| Skill effect | 6 | Time Dilation arithmetic, self exclusion, signed extension, zero-change notification and snapshot insertion |

Four deliberate host failures preserve earlier writes. A failed first discovery
also remains in the evidence: its assertion assumed a negative added-cooldown
stat would survive the stat sheet's clamp. The corrected capture tests that clamp
explicitly and uses a zero base to exercise the no-clock branch. No game behavior
or previously accepted fixture was changed.

## Planned runtime ownership

The SDK should own clock transitions, price arithmetic, stamping/refund ordering
and the distinct skill-effect reduction. The game supplies instance tags/modifiers,
live stat reads, absorb configuration, ultimate policy and effect presentation.
Host-owned maps and skill instances remain borrowed. One reusable binding should
serve all actors without allocating callback objects for each frame.

Elapsed recovery uses the live map iterator. Its untagged rate and tagged-presence
flag are read once, including for an empty map. Tagged clocks query their first
matching live bar instance. Destination writes remain live even if a callback
replaces the actor's map. Stamping and explicit refunds update the HUD total;
elapsed, proc and orb reductions preserve that denominator.

Time Dilation snapshots entries and counts every other visited clock, including
zero reductions and extensions. Its notification therefore differs from the
proc effect's computed-decrease cue. Orb refunds instead walk the live bar;
duplicate instances can refund the same clock more than once.

The existing `ProcRuntime` already owns absolute `procReadyAt` admission and
periodic scheduling. Reuse that implementation and its accepted tests; do not
create a second internal proc timer. World timeflow still determines occurrence.

The initial capture does not exhaust every callback/re-entry combination or
specialized possession, swarm and development clock write. Those must be handled
explicitly before claiming the complete cooldown family. The forthcoming adapter,
renderer comparison, performance work and physical-device acceptance also remain
open. Existing 75 proc courses and 21 renderer stages remain independently frozen.

## Reproduce

After preparing and installing the pinned reference tools:

```sh
npm run reference:cooldown-lifecycle
node scripts/run-cooldown-lifecycle-reference.mjs --game <isolated-game>
```

The runner verifies hashes and compares complete recorded JSON bytes. It writes
new reports under `.artifacts` and never regenerates accepted expectations.
See `baseline/cooldown-lifecycle/acceptance.json` and `source-boundary.json` for
the exact reference, predecessor and selected source statements.
