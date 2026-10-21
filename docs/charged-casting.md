# Charge-up and overcharge casting

The optional `casting/charged` entry supplies charge-up progress, staged
overcharge payment, release scaling, timing bonuses and spark windows.
`ChargedCasting` binds once per simulation and operates on each actor's existing
active cast record. It owns no actor map, event queue, resource pool or random
stream. An idle update returns without creating a result object; a release
creates one small delivery value. Allocation and device budgets require separate
measurements.

## Preparation and phase order

`chargeCastDuration` quotes maximum held time multiplied by effective duration,
with a 0.2-second floor. Cast speed does not affect this duration.
`overchargeCastDuration` uses the greater of stage time and ordinary use time,
divides by effective speed, then applies the same floor. These quotes are stored
at press; later speed/duration changes do not resize the bar. `overchargeMarker`
maps an explicit random draw to the original timed-marker interval.

The host admits the use, pays its initial cost, stores aim and other delivery
context, and attaches the cast record. Before calling `advance`, it advances
ordinary actor clocks and applies interruption, aim and AI policies. This entry
does not replace those policies or the separate ordinary `CastRuntime`.

Charge-up clamps progress to the stored total while held. Reaching the end does
not automatically release a player hold. Release does not add the current
update's time to charge progress; damage, area and optional arc/speed scales use
the previously accumulated fraction. The original charge branch invokes delivery
even when death ends the hold. The original overcharge branch suppresses delivery
on death. This distinction is captured and preserved; it is not a recommendation
for a new game's death policy.

Overcharge adds the current update to held time and time since the last stage.
The stage limit is resolved live, floored to an integer and bounded below by one.
At most one stage is banked per update. A successful stage discards progress
overshoot, clears its age, rerolls an existing timed marker, then emits the stage
event. An unaffordable stage keeps a full bar and can retry on a zero-time update.
Changing the live stage limit does not remove previously earned stages.

Each completed stage requests a fresh mutable cost quote. The stage cost fraction
scales mana and life; affordability and actual payment are host ports, allowing
the game's shield/debt policies to retain authority. A zero fraction still quotes
cost, but skips affordability and payment. Payment precedes stage state and
marker/event changes. A failed callback or invalid later input does not roll back
earlier payment or state changes.

Release uses banked stages, the live strike-timing discipline, the press-stored
spark window and live spark bonus. Perfect timing includes fraction 0.72; timed
release includes distance 0.08 from its marker. Spark age includes the release
update and includes the window's upper edge. The host's `end` port must clear the
active cast and set 0.15-second recovery before execution. Timing cues follow
delivery, with the strike cue before spark. Subsequent idle updates cannot deliver
the cleared cast again.

## Host contract

Ports bind once to their original receiver. Borrowed active state and resolved
definitions must remain coherent during an operation. The host must not change
the active cast during payment or stage callbacks, throw from sinks, or reenter
the binding. Reentry is rejected across the shared binding; its guard releases
after an exception. The host owns the lifetime and persistence format of active
casts, including the skill identity, initial payment, aim and target context.

The adapter delegates both game switch cases and three preparation expressions.
Its source overlay checks the original cases and expressions before writing,
preserves unrelated source and line endings, and refuses an existing bridge.
Native payment, cooldown stamping, payload execution, triggers and cues still run
through the original game methods. Guard/channel/concentration modes, general
interruption cleanup, resource debt and native-engine packages remain outside
this capability.

## Evidence

The pinned original produces 29 scenarios and 144 transitions, including all six
authored charge-up skills and the overcharge support. Repeated exports agree with
the preceding v0.19 adapter. The standalone comparison rehydrates 69 admitted
update states; it is supplemented by continuous original-game courses that call
the actual press, timer, casting, payment, trigger and delivery methods.

Independent checks cover actor isolation, duration floors, random consumption,
free and blocked stages, release ordering, duplicate updates and reentry. The
shipped example composes this entry with the SDK's plain-resource payment helpers
in a clean package installation, with ambient randomness, browser globals and
network access disabled. A strict TypeScript consumer checks the exported ports.

Installed-game fault checks catch skipped stage payment, carried frame overshoot
and suppressed charge delivery on death. The mounted renderer uses ordinary
player-intent polling, an actual Lightning Blast and a socketed Overcharge
support. It holds/releases the charge, earns stages through native payments,
waits when resources run out, resumes and interrupts through a real stun. Progress
and stages are never seeded. The course waits for the native arrival presentation
and compositor paint before capturing the held bar. Profiles/saves are isolated; neither physical
pointer input nor native-engine/device compatibility is established by this test.

Two desktop comparisons use 64 real actors, split between charge-up and
overcharge, with 128 updates each. Admission is outside timing; actual stage
payment, triggers and delivery run inside the measured update path. Five warmups
and 25 rotating samples compare the original, v0.19 and candidate. Complete
derived outputs agree. The candidate's cast-phase medians were 11.86 and 12.03 ms,
versus 11.50 and 11.89 ms for v0.19 and 10.82 and 11.24 ms for the original.
Including actor timers gives 55.22 and 57.54 ms, versus 55.92 and 56.08 ms for
v0.19 and 50.01 and 51.30 ms for the original. No speedup is established; the
cast-only overhead is about 1–3% against v0.19, while the combined path varies
from about 1% faster to 3% slower. Result projection is included equally; setup
and equality checks are excluded. These are not allocation, whole-frame,
renderer, native-engine or target-device budgets.
