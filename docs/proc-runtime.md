# Proc rules and execution boundary

Version 0.33 extracts proc selection and ordered dispatch through explicit host
ports. The baseline and execution contract were committed before implementation.
[Integrated acceptance](../evidence/milestone-thirty-eight/verification.json) covers
the SDK, original comparisons, installed game, renderer and managed adapter.
Effect execution and target-device acceptance remain separate work.

## Package

Import `ProcContent`, `BorrowedProcRegistry` and `ProcRuntime` from
`@hollow-wake/engine/combat/procs`. This optional entry stays outside the core import
graph. It selects and delivers procs through explicit synchronous host callbacks;
the host still executes effect payloads, supplies actor state, time and randomness,
resolves minion ownership and runs the remaining frame phases.

[`examples/procs.mjs`](../examples/procs.mjs) is a runnable ward/cooldown example.
After installing a locally packed SDK archive, import its `procCycle` function and
call it. The result is `{ward:20, draws:3, nextReady:4}`: a blocked cooldown still
consumes the original probability draw. No package-registry publication is implied.

`npm run content:procs` builds a separate local `@hollow-wake/proc-content` package
under `.artifacts/proc-content-package`. It contains the 147 original ordered proc
records, one rider and 298 existing dispatch/chance/power stat definitions. Load
`procs.json` into `ProcContent` and `stats.json` into `StatRules`. The manifest records
content hashes and the rider stat that lacks an original display definition; its
zero base is preserved. All 21 effect shapes remain portable data, not complete
standalone implementations of those effects.

The candidate adds a 24 KiB unminified JavaScript allowance for its three optional
proc modules. Earlier per-module allowances and the 96 KiB core allowance remain
unchanged; the combined allowance increases from 464 to 488 KiB. These are package
size limits, not CPU, memory, allocation or device-performance measurements.

## Raw material and reproduction

The candidate game adapter now delegates eleven World methods, the inline hit and
minion-carry selection phases, and the proc portion of the talent sweep. Its
[source contract](../baseline/milestone-thirty-eight/adapter-contract.json) was
recorded against both the original and retained v0.32 implementation. Guards reject
changes inside those boundaries before writing either game file; unrelated World
members, hit phases, kill rewards and the final gauge sampler are retained.

`carry` returns whether entry was eligible, and `talents` returns whether the actor
entered alive. These results let the host run its following phase without querying
depth twice or accidentally skipping work because a proc killed the actor. A
throwing callback still stops the caller. The native binding retains the original
`World.procChance` observation point and reads packet type/roll observations lazily.
Frame-driven condition, healing and last-gasp events pass through the current
`World.rollOwnProcs` method, whose delegate calls `baseOwn` to avoid recursion.
An earlier candidate bypassed that observer: the unchanged M37 condition fixture
found eight missing callback observations while every other captured state matched.
That candidate is retained for diagnosis. A separate installed fault deliberately
bypasses the restored hook; the original condition fixture is not regenerated.
`WorldProcHitEvent` keeps those reads on shared prototype accessors, avoiding two
new accessor functions per event. Each hit owns its observation; nested hits never
reuse mutable scratch state. Tags/modifiers retain their native identities, and
resolved scalar fields remain snapshots. The installed check exercises changed
packet values and independent nested observations; stale type/roll faults must fail.
Three former private rule queries remain internal diagnostic delegates so original
probes can call them without unused-private errors after production selection moves.

After preparing a fresh isolated game, run `npm run adapter:procs-source` and
`npm run adapter:procs`. An explicit location manifest can be supplied with
`node scripts/test-game-procs.mjs --location <manifest>`. Use `--read-only` for a
retained control; fault injection refuses the recorded predecessor environments.
The comparison retains all 143 original courses and adds seven independently
captured host-phase courses. All 150 courses match, and eighteen installed faults
were detected. The full SDK verifier passes 468 tests, including 24 focused proc
tests and nineteen proc fault checks. The three proc modules total 21,462 bytes of
unminified JavaScript; this is a size observation, not a speed measurement. Game,
launcher and simulation types, smoke, 21 native probes and 17 earlier-system
comparisons pass. All twelve renderer checks pass, including the new proc course
and unchanged six-stage request trace. Final package consumers and hosted checks
are distinct gates; target-device performance remains unmeasured. The corrected adapter also passes
the unchanged native condition trace and its recovery/fault checks, restoring all
eight previously missing own-event observations.

### Rendered proc acceptance

After building the isolated adapted game, run:

```sh
node scripts/test-proc-ui.mjs --game <game> --dist <built-game> --electron <electron>
```

The checker copies its launcher and harness into a disposable directory, with
separate profiles and saves. It checks the game source, installed SDK and built
bundle before and after execution. New UI builds also record the installed SDK
hashes; older retained controls report that this field was not recorded at build.

The ten-stage expectation comes from two independent executions of the retained
published v0.32 renderer. Its catalogue separately matches a fresh run of the
pinned original proc probe. Normal checks read the accepted
[observations](../baseline/milestone-thirty-eight/proc-ui-expected.json) and
[provenance](../baseline/milestone-thirty-eight/proc-ui-acceptance.json).

The added ward course explicitly grants Desperate Ward, seeds low life and uses a
temporary zero RNG. `World.update` earns the condition edge, selects the authored
proc and raises 300 ward. The check observes one low-life callback, one random draw,
the 20-second cooldown and the visible `300` HUD label. It also checks the changed
HUD image. The eight original cue stages cover stored materials, spending, popping,
invocation, expiry, snapshot mirroring and compact rendering; some of those stages
call the native executor directly and do not prove selection. The ward course does
not call the executor directly. This covers a mounted renderer, not physical input,
frame rate or device performance. The corrected v0.33 candidate matches all ten
stages and the ward receipt. Its build records all 177 installed runtime files.
Disposable stale source, SDK and bundle inputs are rejected before renderer launch.

### Desktop observation experiment

`npm run benchmark:procs -- --location <candidate-manifest> --previous-adapter
<retained-v0.32-game> --comparison-adapter <retained-initial-v0.33-game>` compares
separate original, predecessor, initial and revised module graphs. `--validate-only`
checks outcomes without accepting timing evidence. Each graph's complete receipt
must match: RNG draws, deliveries, clocks, actor vitals, queued events and native
frame outcomes. Input source and installed runtime hashes are checked before/after.

Two fresh-process runs on desktop i9-10900K / Node 24.9.0 used four warmups and
fifteen rotating samples per graph. Setup, forced GC and receipt construction stay
outside timing. Values below are ranges of the two run medians in milliseconds,
not confidence intervals. The original/predecessor controls remain unchanged.

| Workload | Original | v0.32 | Initial v0.33 | Shared-accessor v0.33 |
| --- | ---: | ---: | ---: | ---: |
| 16,384 ungranted own events, 64 actors | 3.44–3.60 | 3.54–3.60 | 9.22–9.35 | 9.46–9.56 |
| 16,384 active own events, 64 actors | 46.68–51.41 | 47.14–49.99 | 54.27–56.45 | 54.59–58.80 |
| 16,384 changing grants/events, 64 actors | 556.68–585.07 | 561.63–571.61 | 713.20–716.40 | 710.10–723.08 |
| 16,384 talent/pulse sweeps, 64 actors | 8.26–8.33 | 8.08–8.19 | 14.43–14.76 | 14.58–14.79 |
| 2,048 resolved hits | 243.20–249.27 | 215.38–223.22 | 223.08–224.15 | 219.26–223.61 |
| 2,048 minion-carried hits | 260.57–263.15 | 228.55–235.28 | 240.26–241.91 | 231.37–236.51 |
| 128 native ward frames, 16 actors | 51.80–53.50 | 63.99–64.22 | 65.99–66.28 | 68.04–69.25 |

These synthetic dispatch workloads add three explicit proc definitions and count
payload deliveries; the frame workload executes the authored desperate ward. Hits
run native damage resolution with supplied vitals, grants and skill instances.
Changing-grant costs include native stat-cache invalidation. The revised hit
medians are lower, but other paths retain overhead and the revised frame median
is higher than the initial candidate in both runs. A general CPU speedup is not
established; those costs require further profiling before performance acceptance.

A separate five-sample experiment per run holds 2,048 actual installed hit-event
observations, then releases those references while keeping the World alive. Forced
GC heap differences include the retained observation graph and array storage.
Both runs report approximately 1,468.9 bytes per initial observation versus 823.2
bytes with shared accessors, about 44% less. The runtime normally does not retain
these observations; this experiment measures neither steady-state game memory nor
total allocation traffic. The change preserves lazy packet reads and per-hit
ownership while removing per-event accessor functions. Raw samples and receipts
are emitted under `.artifacts/proc-benchmark-*`; broader evidence packaging follows
integration acceptance. Renderer, FPS, Steam Deck and mobile outcomes remain unmeasured.

### Native registry view

The game binding now retains one private ordinary ID array for each active SDK
registry revision. `BorrowedProcRegistry` still exposes its frozen ID array. The
native stat helper receives a shallow copy with the same ordered strings and
treats that view as immutable, matching its existing cache contract. The binding
reuses the view across actors and replaces it when the SDK array identity changes.
An actor's grant change still invalidates its own native stat cache; it does not
copy the registry again. No actor is retained by this additional cache.

This choice follows a read-only experiment on the original `StatSheet.armedFamily`:
the same 147 IDs in a frozen array made repeated grant-cache rebuilding slower in
both fresh-process repetitions. The adapter keeps that host representation detail
separate from the immutable SDK content API. Installed assertions cover stable
registry identity, appended and removed definitions, old-view preservation and
actual delivery of a newly granted proc. A deliberately stale view must fail.

Two complete runs after restoring the own-event hook use the same seven workloads,
four warmups, fifteen rotating samples and receipt checks above. The comparison is
the preserved shared-accessor candidate before the native view and hook correction.
Ranges are the two run medians in milliseconds; all observations match.

| Workload | Original | v0.32 | Shared-accessor control | Corrected v0.33 |
| --- | ---: | ---: | ---: | ---: |
| Ungranted own events | 3.51–3.60 | 3.57–3.59 | 9.69–9.84 | 8.90–9.04 |
| Active own events | 47.89–49.84 | 47.44–49.35 | 56.72–60.24 | 56.45–58.97 |
| Changing grants/events | 567.60–583.22 | 581.03–581.07 | 723.89–736.32 | 585.25–599.63 |
| Talent/pulse sweeps | 8.17–9.41 | 8.24–8.56 | 14.58–15.06 | 14.43–14.54 |
| Resolved hits | 250.48–252.36 | 220.18–222.98 | 217.39–224.93 | 219.19–221.95 |
| Minion-carried hits | 263.16–264.95 | 233.33–239.38 | 231.72–238.04 | 233.66–234.90 |
| Native ward frames | 50.09–51.20 | 62.95–63.03 | 66.53–67.20 | 65.76–66.35 |

The targeted changing-grant workload improves by approximately 17–21% versus the
preserved shared-accessor candidate, but remains 0.7–3.2% above v0.32. Small own-event
and pulse dispatch still carry overhead. The ward workload executes 128 headless
frames with 16 actors; it remains 4.5–5.3% above v0.32 and 28–32% above the original
game. This is not a general CPU or frame-rate improvement.

The native view adds one shallow ID array per active binding/revision. The retained
hit-observation experiment remains approximately 823.2 bytes/event; it does not
measure that registry view or normal game memory. The core benchmark, original
core reference and full 468-test SDK verifier also pass. Earlier pre-correction
measurements remain in the retained experiment history. Steam Deck and mobile
performance remain unmeasured.

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
| Host phases after dispatch | Seven courses: gauge cadence after live/dead entry, death or failure during a proc, and minion kill rewards after no proc, owner death or depth rejection |
| Authored data | 147 procs across 27 trigger types and 21 effect kinds, plus one proc rider; original insertion order and undefined-property omissions retained |

The initial 143 behavior courses passed their independent assertions and type checks,
then reproduced byte for byte in a second process. All eight captures also match the preserved published
v0.32 game adapter without changing its 991 source files, 168 runtime files or
package archive. [The acceptance manifest](../baseline/milestone-thirty-eight/acceptance.json)
pins the first helpers, compressed observations and predecessor provenance.
The separate [dispatch addendum](../baseline/milestone-thirty-eight/dispatch-addendum.json)
adds 86 courses without changing any earlier fixture.

The [host-phase addendum](../baseline/milestone-thirty-eight/host-phase-addendum.json)
adds seven cases discovered while connecting the adapter. The original ran twice;
the retained predecessor and candidate match its bytes. Actual World sweeps and
killing hits run with explicitly instrumented death/reward callbacks. No earlier
expected output changes. The combined reproduction now checks 150 courses in nine
helpers, plus the authored catalogue.

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
above specifies how those diagnostics are handled. The standalone checks include
the 47 original rule courses, content ownership, callbacks, fault detection and a
packed JavaScript/TypeScript consumer. The first complete installed proc comparison
matches the courses above. The renderer and managed-game acceptance are now
recorded; physical-device acceptance remains outstanding.
Importing all 21 payload shapes is not evidence that all
their effects execute in the standalone SDK.

The later measurements establish the bounded cache improvement above, with
remaining overhead explicit. Full Unity, Godot, Unreal, Steam Deck or mobile support
is not established. See [content storage](content-storage.md) for the
separate authoring/database decision and [the completion inventory](completion.json)
for the full outstanding scope.

## Acceptance records

[Integration](../evidence/milestone-thirty-eight/integration-results.json),
[renderer observations](../evidence/milestone-thirty-eight/renderer.json) and
[managed-game preservation](../evidence/milestone-thirty-eight/managed-adapter.json)
record the completed checks. The managed game uses independent dependencies; its
four existing bounty methods and all other tracked files are preserved.

The [performance decision](../evidence/milestone-thirty-eight/performance-decision.json)
links both corrected raw benchmark runs and names their retained controls. Earlier
pre-observer results remain diagnostic history and are not the accepted timings.
The [final archive](../evidence/milestone-thirty-eight/final-installation.json) has
separate clean-consumer checks; its runtime bytes must match these observations.
