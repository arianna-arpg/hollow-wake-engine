# Skill request preflight

`@hollow-wake/engine/casting/request` exports `SkillRequest`, an optional,
host-independent policy for the ordered request prefix. It follows the
[original boundary and accepted observations](skill-request-boundary.md).
The core import does not load this module.

```ts
const policy = new SkillRequest(ports); // one owner per world
const result = policy.preflight(actor, skill, aim, seatPress);
if (result !== 'continue') return result;
// Continue the host's reserve pricing, cast preparation and delivery.
```

`false` is a terminal refusal. `true` is a terminal handled request, including
trigger/replenishment toggles and redirects. Only `'continue'` authorizes entry
to the rest of the host pipeline. Do not coerce the result to a boolean: the
continuation string is truthy. The shipped `examples/skill-request.mjs` shows a
small host with these three outcomes.

The policy handles seals, hive-form dispatch, throng restrictions, replenishment
preference, seat activity, held-body struggle, gnaw/mount rules, aura debt/life
locks, trigger toggles, attributes, conversion/mimic redirects, prerequisite
notes, relocation availability and actor admission, in that order. It does not
own reserve spending, combo commitment, random fumble/scramble, spatial targeting,
paid casting modes or general effect delivery.

## Ownership and live ports

Provide `SkillRequestPorts<Actor, Skill, Seat, Aim, Id>` using your host's types.
Identity defaults to numbers; a host can supply strings or its own identity type.
`RequestActor` and `RequestInstance` are minimal structural views, not new entity
stores. Socket and modifier payloads are opaque and preserve identity. The
original `clingTo` field is an opaque ride record and its gate uses truthiness.
Held/mount identity gates test against undefined, so zero is a valid held/mount
identifier.

The constructor copies and freezes the function table. It does not query game
state, retain request objects, or cache decisions. Bind methods through closures
when they need a host receiver. Read current state inside those callbacks. A
host may create one policy per world and reuse it for every request.

`seatOf` is possession-aware. `triggerSeat` instead finds a seat whose current
actor is exactly the requesting body. Keep those lookups separate. The policy
does not take ownership of seats, actors, targets, definitions or minted payloads.
The host's existing instance owner supplies `mint`; `dispatch` re-enters the real
request method with the same actor, aim and seat-press flag. Recursive redirects
therefore repeat the original authority checks. Definition/conversion providers
must prevent invalid redirect cycles as in the original content rules.

Ports are synchronous and trusted. Validate authored input when loading or
compiling it: notably, a `relocateConstruct` effect must supply its numeric
radius. Other effect types do not need that field. State and tuning must be
coherent for the operation; this policy does not repeat whole-entity validation
on every button press.

## Mutation and failure behavior

Refusal can still interrupt dwell, add struggle or clear trigger depth. Actor
admission can lazily initialize ammunition. Replenishment updates its flag before
forgetting runtime state and notifying the host. Trigger toggles allocate state
only when missing, then read whether the trigger is armed and raise the use lock.
Mimic reads its power modifiers after minting and sharing sockets.

These are ordered synchronous operations, not atomic transactions. Exceptions
propagate unchanged and prior mutations remain. Notifications and commit callbacks
should complete synchronously; do not replace them with asynchronous persistence
without a separate host-level contract. Earlier refusals skip later callbacks.

## Validation and performance scope

`reference:request` reproduces the accepted 68 courses and 71 transitions from
the frozen original. `adapter:request-source` rejects changed authority, checks
LF/CRLF input, preserves the remaining host method and refuses reapplication.
`adapter:request` compares the installed package with all accepted bytes and
injects seven behavioral faults, restoring every changed runtime/host file.
The unit suite tests precedence, identities, live callbacks, short-circuiting,
exception behavior and independent policy owners. The packed consumer checks
runtime isolation, public types and the shipped example.

The module has an 8 KiB unminified JavaScript allowance inside the existing
424 KiB combined package budget. No result wrapper or per-request policy is
allocated. This is a code-structure fact, not a zero-allocation claim: callbacks,
iteration and original lazy state creation can allocate. No per-frame database
lookup, cache invalidation system or new shared mutable registry is introduced.

The [M33 evidence](../evidence/milestone-thirty-three/verification.json) records
13 installed-package suites detecting 61 behavioral faults, 19 candidate native
game probes, and 11 renderer checks. Ten expanded native probes also passed in
the frozen original and retained v0.27.1 adapter. Six new player-input stages
match the retained renderer byte-for-byte. The managed adapter passes request
and intent comparisons, all three game type checks, and simulation smoke while
preserving its unrelated bounty changes. These are desktop development checks;
physical Steam Deck/mobile acceptance remains outstanding.

`npm run benchmark:request -- --previous-adapter <retained-v0.27.1-game>` compares
the original, retained adapter and current adapter. It verifies installed runtime
bytes and host-source controls, then uses five warmups and 25 rotating samples.
Two runs produced the following medians (milliseconds per stated operation count):

| Workload | Operations | Original, runs 1 / 2 | v0.27.1, runs 1 / 2 | v0.28.0, runs 1 / 2 |
| --- | ---: | ---: | ---: | ---: |
| Intent queries | 9,216 | 33.9152 / 33.7089 | 21.8529 / 21.4665 | 21.2805 / 21.7900 |
| Native query and cast start | 1,024 | 46.0042 / 44.7519 | 30.5023 / 29.3026 | 29.1031 / 28.6293 |
| Early refusal and toggle | 1,024 | 5.1368 / 5.1365 | 2.6967 / 2.5663 | 2.8211 / 2.7343 |

All gameplay receipts match. Cast starts took 2.3–4.6% less time than v0.27.1 in
these samples, while early refusals/toggles took 4.6–6.5% more (0.1244–0.1680 ms
per 1,024 requests). The unchanged query workload moved in opposite directions
between runs. We accept the modular boundary with this measured cost; this is
not a general speedup claim. See the [decision and raw runs](../evidence/milestone-thirty-three/benchmark-decision.json).

Measurements used Node 24.9 on a desktop Intel i9-10900K, with other agent CPU-heavy
jobs stopped. They do not measure allocation volume, retained memory, whole-frame
cost, energy or target devices. This JavaScript policy alone does not implement
Unity, Godot or Unreal bindings. Remaining request/delivery logic is tracked in
[the completion inventory](completion.json).
