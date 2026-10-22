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

The first installed comparison is an acceptance step, not a performance result.
Complete request workloads, original native probes, rendered input, prior-suite
regressions and physical Steam Deck/mobile measurements remain separate gates.
This JavaScript policy alone does not implement Unity, Godot or Unreal bindings.
