# Cooldown lifecycle extraction boundary

The initial baseline contains 44 courses calling the original Actor, skill-price
and World methods. Two independent original runs and the installed development
adapter produce identical complete observations. The helper type-checks against
each game graph. The optional `combat/cooldown-lifecycle` module now implements
these boundaries, and the installed game adapter matches all 44 observations.
This does not establish the complete cooldown family or device performance.

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

## Runtime ownership

The SDK owns clock transitions, price arithmetic, stamping/refund ordering
and the distinct skill-effect reduction. The game supplies instance tags/modifiers,
live stat reads, absorb configuration, ultimate policy and effect presentation.
Host-owned maps and skill instances remain borrowed. Reusable port tables serve
all actors without allocating callback objects for each frame. The module holds
no actor state, caches, time source or random source.

The six exports are `advanceSkillCooldowns`, `calculateSkillCooldown`,
`stampSkillCooldown`, `refundSkillCooldown`, `refundCooldownsOnOrb` and
`reduceOtherSkillCooldowns`. See `examples/cooldown-lifecycle.mjs` for a standalone
cycle. Pricing contexts are generic borrowed values; a host need not implement
Hollow Wake's Actor, scene or stat-sheet classes.

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

Ports and store operations must complete synchronously and keep live traversal
finite. Exceptions propagate with earlier writes intact. Numeric inputs come
from the host's validated content/stat layer. Elapsed ticking retains the
already adopted `advanceCooldown` leaf's finite/nonnegative checks at each
visited entry, including its partial-failure order. Pricing and effect arithmetic
preserve their original operations; they do not introduce new clamps or a
serialized content compiler. The separate proc compiler remains unchanged.

The original capture does not exhaust every callback/re-entry combination or
specialized possession, swarm and development clock write. Those must be handled
explicitly before claiming the complete cooldown family. The existing 75 proc
courses and 21 renderer stages also pass on this integration without changing
their expectations. Those stages cover proc presentation and real World clocks;
they are not exhaustive UI coverage of the new lifecycle. Broader renderer,
performance and physical-device acceptance remain open.

## Reproduce

After preparing and installing the pinned reference tools:

```sh
npm run reference:cooldown-lifecycle
node scripts/run-cooldown-lifecycle-reference.mjs --game <isolated-game>
npm run test:cooldown-lifecycle-package
npm run test:cooldown-lifecycle-mutations
npm run adapter:cooldown-lifecycle -- --location <adapter-location.json>
npm run adapter:cooldown-lifecycle-faults -- --location <adapter-location.json>
```

The runner verifies hashes and compares complete recorded JSON bytes. It writes
new reports under `.artifacts` and never regenerates accepted expectations.
See `baseline/cooldown-lifecycle/acceptance.json` and `source-boundary.json` for
the exact reference, predecessor and selected source statements.

The adapter inspects all three source files before writing, retains newline
styles and unrelated source, and rejects repeated application or unreviewed
boundary changes. It removes the old elapsed leaf import only when no other
caller uses it. The first candidate's unused-import build failure is retained.
The runtime adds 3,656 bytes of JavaScript inside a separate 6 KiB allowance;
all 207 predecessor outputs and their existing budgets remain unchanged. This
is a size observation, not a throughput or allocation-volume claim.

The [runtime evidence](../evidence/cooldown-lifecycle/runtime.json) records 953
passing SDK tests, including 30 lifecycle tests; 17 detected runtime faults;
16 source-guard faults; 10 installed-game faults; package/type consumers; the
required original-source comparison; game/launcher/simulation type checks; and
25 smoke episodes. Raw logs include both the corrected unused-import failure
and a renderer process failure before game loading. The same built renderer
passes when run with normal process permissions. Accepted observations remain
unchanged. Native-host support for these new functions is not established.
