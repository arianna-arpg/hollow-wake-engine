# Proc rules and execution boundary

Status: original behavior baseline and execution contract recorded before implementing a standalone proc
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
| Event dispatch | 51 courses: own-event filters, gain/status/collision/surface selection, skill context, rider delivery and distinct death checks |
| Actual hit resolution | 30 courses: hit/kill selection, critical/type/high-roll gates, owner clocks, elite-hit kill procs and minion carry |
| Actual frame progression | Two courses: condition-to-charge-to-buff-to-ward propagation with and without depth investment |
| Registry and pulse diagnostics | Three courses: append during dispatch, same-length trigger mutation and a new pulse grant waiting for another sweep |
| Authored data | 147 procs across 27 trigger types and 21 effect kinds, plus one proc rider; original insertion order and undefined-property omissions retained |

All 143 behavior courses passed their independent assertions and type checks,
then reproduced byte for byte in a second process. All eight captures also match the preserved published
v0.32 game adapter without changing its 991 source files, 168 runtime files or
package archive. [The acceptance manifest](../baseline/milestone-thirty-eight/acceptance.json)
pins the first helpers, compressed observations and predecessor provenance.
The separate [dispatch addendum](../baseline/milestone-thirty-eight/dispatch-addendum.json)
adds 86 courses without changing any earlier fixture.

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
- A minion's carry roll uses its owner's sheet, summoning skill and clocks.
  Ordinary hit-frequency carry divides chance by the living court size; true
  kills and timed procs are exempt. An explicitly authored zero ICD also skips
  this division in the original, even though it imposes no cooldown.
- A nonlethal hit can consume a kill proc's once-per-time and PPM attempt clocks
  before its elite-hit eligibility is checked. An optimization that moves the
  eligibility test earlier would change later rolls.
- Native frame order matters. A condition grants a charge, and that charge can
  trigger a buff in the same frame. The buff's new gain event waits for the next
  frame's detached queue. Proc-depth investment governs each link. These frame
  observations begin with an explicitly queued condition edge and execute the
  original charge, buff and ward payloads.
- Pulse iteration uses the initially armed list. A pulse that grants another
  pulse does not add it to the current sweep; a subsequent sweep can run it.
  Own-event dispatch instead visits the live registry, including an appended
  matching row. The original registry index misses same-length trigger changes
  until its length changes. These are recorded separately from the future SDK's
  content-ownership and replacement contract.
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

### Decision: proc-content-ownership/v1

The selection runtime will have two explicit content sources sharing one rule
implementation. `ProcContent` owns a validated, deeply copied and frozen content
revision. It indexes ordered candidates per trigger once, including currently
ungranted rows, and exposes no mutable membership sets. Different content objects
have independent indexes. A content revision changes by constructing a new object
and binding; mutating an active owned catalogue is unsupported. This avoids
combat-time database queries and keeps the authoring source separate from actors.

`BorrowedProcRegistry` is an opt-in compatibility boundary for an existing host's
ordered proc list, id lookup and rider list. It borrows native identities. Its
index is private to that binding and rebuilds when list identity or length changes.
For an unchanged list identity, same-length edits retain the original stale-index
behavior. Own-event iteration uses the live list and can observe appended rows.
Pulse iteration keeps the initially armed id list and resolves each id through the
live lookup. This preserves the recorded registry diagnostics without imposing
mutable registries on standalone applications. The SDK contains no process-global
proc registry. Hosts must return stable list identities and keep id/list views
coherent; replacing a list is an explicit revision boundary, not a per-query copy.

Owned-content validation covers dispatch fields, finite serializable payload data,
unique identities and rider-to-proc references. Payload execution and external
skill/status references require the applicable effect/host capability. A validated
dispatch catalogue alone must never advertise support for every effect it stores.

### Live state, events and callbacks

One binding can serve multiple actors. Each actor owns its three clock maps,
buff/status observations and, for the talent sweep, condition-edge queue, coalesced
healing amount and last-gasp flag. The runtime neither replaces these maps nor
retains actors. Host observations are coherent, finite and synchronously readable;
read callbacks must not mutate the actor. Plain writable fields and native Map
semantics are required on this borrowed fast path. Only content/configuration is
validated once; the entire actor is not copied or revalidated per attempt.

Time and randomness are explicit callbacks. Random values must be finite and in
`[0, 1)`; an invalid draw throws after any already-committed gates/attempt stamps,
before cooldown stamping or delivery. No ambient random replacement, engine
object, rendering or filesystem access belongs in production code. Configuration
and callback functions are captured at construction, preserving callback receivers.
Actor grants and world observations remain live through those captured functions.

Own-event, hit/carry, gain, status, collision, surface, pulse and rider selection
retain their separate native gate order. Hit geometry, landed damage, lethal/elite
observations, minion owner/summoning-instance selection and court census are host
inputs. The SDK owns the resulting eligibility, rate, depth, cooldown and ordered
delivery decisions. Status-trigger banking precedes proc-depth rejection. The
talent sweep detaches condition edges before processing, then coalesced healing,
last-gasp feedback and procs, and finally pulses. Host gauge sampling and the
detached gain/sympathy phase remain afterward in the native frame.

Delivery callbacks may change actor grants and synchronously dispatch deeper
events, including for the same actor. There is no global or same-actor busy guard.
The host must advance causal depth for proc consequences and respect the configured
depth limit. Rider selection itself retains its original downstream depth gate;
the cast-delivery capability must enforce that limit before producing consequences.

Exceptions propagate. Earlier clock stamps, random draws, actor mutations and
completed effects remain committed. The runtime never rolls back or retries a
payload automatically. A failed talent sweep does not requeue its detached edges;
later phases do not run. Retrying is a new host decision, not a transaction resume.
Chance and once-per-time gate helpers are simulation operations, not pure UI
previews. These rules preserve the original observations and deliberately do not
inherit the condition publisher's different recovery contract.

[Independent contract cases](../baseline/milestone-thirty-eight/runtime-contract.json)
record content ownership, isolation, callback capture, valid nesting and failures
before implementation. They supplement the unchanged original observations.

### Integration and outstanding acceptance

The complete path to extract is an Inventory-visible grant, an actual event,
ordered eligibility/rate/cooldown decisions, and delivery of the selected payload
through explicit host ports. Authored rules and shared policy belong in the SDK;
the host supplies time, random draws, actor state and spatial/presentation services.
Mutable actor maps must remain independently owned. Content preparation must
preserve registry order while allowing live actor grants to change during dispatch.

The captures now cover the principal selection paths and their distinct ordering,
including native frame progression. Hit and rider courses observe selected payload
ports; they do not execute every authored effect. The content and callback contract
above now specifies how those diagnostics will be handled. Complete installed-package fault, renderer and device
acceptance still follow. Importing all 21 payload shapes is not evidence that all
their effects execute in the standalone SDK.

No runtime optimization or full Unity, Godot, Unreal, Steam Deck or mobile support
is established by this baseline. See [content storage](content-storage.md) for the
separate authoring/database decision and [the completion inventory](completion.json)
for the full outstanding scope.
