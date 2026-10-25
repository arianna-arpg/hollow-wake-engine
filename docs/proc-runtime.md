# Proc rules and execution boundary

Status: original behavior baseline accepted before implementing a standalone proc
runtime. The public SDK remains v0.32. These observations guide the next extraction;
they do not make its remaining combat effects executable in another engine.

## Raw material and reproduction

The source is the pinned original game and its retained working overlay, identified
by [the source lock](../baseline/source-lock.json). The capture calls original
`World` and `Actor` methods and boots the real content registrations. No SDK proc
implementation produces the expected results.

| Captured material | Coverage |
| --- | --- |
| Rule observations | 47 courses: probabilities, luck, rate and depth limits, cooldown boundaries, owner gates, roll-top thresholds and attempt bookkeeping |
| Authored effects | Four courses: low-life ward and cooldown, coalesced healing ward, missed pulse beats and dead-actor cleanup |
| Ordering and callbacks | Six courses: live grants/removal, death during dispatch, depth-bounded nested dispatch and execution failure |
| Authored data | 147 procs across 27 trigger types and 21 effect kinds, plus one proc rider; original insertion order and undefined-property omissions retained |

Each capture passed its independent assertions and type checks, then reproduced
byte for byte in a second process. All four also match the preserved published
v0.32 game adapter without changing its 991 source files, 168 runtime files or
package archive. [The acceptance manifest](../baseline/milestone-thirty-eight/acceptance.json)
pins helpers, compressed observations and predecessor provenance.

After preparing the reference tool environment, run:

```sh
npm run reference:prepare
npm run reference:install
npm run reference:procs
```

An existing prepared reference needs only the last command. Verification writes
fresh observations under `.artifacts` and compares them with the accepted files;
it never regenerates accepted fixtures.

## Observed rules that constrain the refactor

- Registry order is observable. A buff from an earlier proc can enable a later
  proc during the same event. A newly enabled earlier row waits for the next event;
  removal can disable a later row immediately. A snapshot containing only the
  initially active rows would change these outcomes.
- The once-per-cast flag actually uses exact world time. Its gate records the
  attempt before chance evaluation. A zero effective chance can therefore consume
  this gate even when no random draw occurs.
- Positive PPM grants update their attempt clock before the random roll and
  internal cooldown check. Catch-up is capped. Zero base chance leaves that clock
  untouched. A future attempt timestamp is retained as a separate diagnostic;
  it can produce a negative chance in the original helper.
- Ordinary internal cooldowns are checked after a successful random draw.
  Pulse beats instead advance their next-due clock before gates and chance, and
  do not replay missed beats. Reordering these operations changes random streams
  and subsequent behavior.
- Same-actor nested dispatch is valid when its depth advances within the limit.
  The condition publisher's blanket same-actor reentry rejection must not be
  copied into proc dispatch.
- A throwing execution callback can leave clocks and random draws consumed.
  The observations provide no transactional rollback or automatic effect-retry
  guarantee. A retry at the same time can stop at the PPM gate; a later retry can
  consume a draw and stop at the already-stamped cooldown. Any deliberate change
  needs a separate recovery decision before implementation.

Static Shrapnel exposes an original data distinction: its rider chance has no
display-stat registration. The original `StatSheet` accepts that stat name with
a zero base, and the authored `cl_gam_shrapnel` passive grants 0.75 in spell
context and zero in attack context. The capture preserves this behavior and checks
the rider's proc and skill references. It does not invent a new base or label.

## Intended SDK boundary and remaining work

The complete path to extract is an Inventory-visible grant, an actual event,
ordered eligibility/rate/cooldown decisions, and delivery of the selected payload
through explicit host ports. Authored rules and shared policy belong in the SDK;
the host supplies time, random draws, actor state and spatial/presentation services.
Mutable actor maps must remain independently owned. Content preparation must
preserve registry order while allowing live actor grants to change during dispatch.

The current observations do not cover every event filter, hit/minion-carry rule,
gain/rider dispatch or mutation of the content registry during an event. Those
boundaries need explicit cases before their extraction. The native courses call
original methods with controlled setup; complete frame, renderer, installed-package
fault and device acceptance still follow. Importing all 21 payload shapes is not
evidence that all their effects execute in the standalone SDK.

No runtime optimization or full Unity, Godot, Unreal, Steam Deck or mobile support
is established by this baseline. See [content storage](content-storage.md) for the
separate authoring/database decision and [the completion inventory](completion.json)
for the full outstanding scope.
