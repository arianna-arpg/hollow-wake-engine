# Channel casting

The optional `@hollow-wake/engine/casting/channel` entry supplies channel clocks,
completion, brim arithmetic, ordered pulse payment, ramps, release and persistent
pulse timing. It uses caller-owned state and explicit synchronous ports. There are
no runtime dependencies, host globals or ambient random draws.

The accepted v0.23 original baseline contains
85 courses and 461 transitions. The standalone tests replay 79 isolated channel
phases. Native effects and callbacks that change later observations are compared
through the installed game adapter. These counts are not completion claims for
the complete SDK or native engine integrations.

## State and host responsibilities

`ChannelCasting` is one binding per simulation. Each actor owns its active cast
and persistent brim banks. The host admits a press, binds the authored/resolved
spec, snapshots the initial interval/windup using `channelInterval` and
`channelWindup`, and passes the currently active channel state to `advance`.
It must not advance a detached or already-ended state. Interleaved actors can
share a binding; simultaneous or callback reentry is rejected.

The host retains shared admission, input, AI, interruption and movement. It
handles spatial aiming and target selection, real skill delivery, resource
side effects, cues, projectile detonation, minion bodies, durable identity and
save/load integration. Brim decay and integer gauge publication also remain in
the host; the fixture covers their interaction with the extracted lifecycle.
The extracted initial timing helpers do not implement Gathered Casting's
admission through a running cooldown or its conversion-spec assembly.

The pinned source has 39 authored channel specifications but 37 native active
channel modes. Sparklattice and Choir of Light omit `castMode` and enter instant
mode in that source. The adapter preserves this observation. No content repair
is implied by extracting their unused channel specification.

Ports are bound once at construction. State, specs, banks and opaque target and
context records are borrowed. The supplied spec and cast identity remain valid
through the current call. Read ports must be pure. Sinks run synchronously,
must not throw or reenter, and may legitimately change later resource/stat
observations. A returned cost quote must be independently mutable; the SDK scales
it for gather fractions and cost ramps. Delivery payloads and persistence plans
are fresh values the host may retain. Brim banks remain shared mutable records.

## Phase ordering

The order is part of the contract:

1. Resolve the channel/gather spec and advance held time. A cap clears `held`,
   stamps `hitCap` and `finishRolled`, then raises completion and the charge tap.
2. Fill the brim using current speed and brim-fill stats, including changes made
   by the preceding completion callbacks. A newly full bar emits readiness,
   completes at most once and may release automatically.
3. Advance the trigger beat and rune clock. Each emits at most once per update
   and retains overshoot. These phases also run on the update that releases.
4. Let the host update aim. Evaluate release/death afterward. End active casting
   and set recovery to 0.15 before cooldown, release effects, payload or persistence.
   The optional end cooldown uses the authored base value directly.
5. A held channel runs support callbacks, advances the pulse clock and reacquires
   a target. Missing targets reschedule by the initial interval without payment
   or jitter. `null` means no valid required target; `undefined` means untargeted.
6. Capture pulse context before quoting cost. Apply gather and cost-ramp scaling,
   check affordability and pay. An unaffordable beat clears `held` and returns;
   release runs on a subsequent update unless the host reasserts held input first.
   The actual renderer course preserves that distinction. Successful payment precedes jitter.
7. Query live pulse stats using the context captured before payment, compute
   ramps/spooling and deliver at most one pulse. Pure gathers still pay and
   reschedule; their payload arrives on release.

A whole-update snapshot is not equivalent. The reference includes a real
completion-triggered buff that changes that update's brim fill, a channel-beat
triggered buff that changes the ensuing pulse, and a native completion charge tap.
The adapter reuses one context container without replacing its pre-payment
modifier list. It does not freeze the stats read through that list.

The initial target reference may be supplied as `advance`'s fourth argument.
Release receives that reference even when earlier sinks change host state.
Pulse targets are independently reacquired. Spatial conventions stay outside
the runtime, permitting a host to supply its own 2D or 3D interpretation.

## Release and persistence

Release gates preserve minimum hold, full-completion requirements and thin-brim
fizzles. A thin bank is retained. Successful brim payloads spend afterward unless
`spend` is false. Death suppresses channel payoff and creation of persistence;
host interruption clears casting before this phase and denies completion.

`advanceChannelPersistence(state, dt, dead)` subtracts remaining duration first.
It returns `null` for expiry/death, `undefined` while waiting, or the next pulse's
damage multiplier. The host owns collection removal and reverse iteration,
live-position delivery, `noCooldown`/`noRepeat` flags and ordering relative to
other schedulers. At most one pulse is delivered per update, retaining carry.

Numerics use binary64 and preserve expression order and original floors.
Frames must be finite and nonnegative. Timing divisors must be positive.
Unknown curve names and nonfinite values fail explicitly. Invalid data discovered
after an earlier sink does not roll back that sink. This is an ordered commit
contract, not a transaction or durable save format.

## Verification and use

The shipped [example](../examples/channel-casting.mjs) shares one binding between
a ramped channel with persistence and a brim gather. The offline packed consumer
checks its complete receipt and strict TypeScript declarations while rejecting
network, browser and ambient-random access.

```sh
npm run verify
npm run reference:channel-casting
npm run adapter:channel-source
npm run adapter:channel-casting
npm run benchmark:channel-casting -- --previous-adapter /path/to/retained-v0.22-game
```

The guarded adapter replaces the original channel case, initial timing expressions
and persistent-pulse arithmetic. It preserves host aiming and release effects,
refuses changed owned regions and retains unrelated edits and line endings.
Normal checks never regenerate expected fixtures.

The rendered game course exercises Arcane Missiles, Surgewind, Kindled Ruin and
Firebolt socketed with Gathered Casting through ordinary intent polling. It earns
all progress, observes pulse payment/full brim/capped release, and verifies dry
holding and stun interruption. It does not seed cast clocks or filled banks.

Two desktop comparison runs used 64 real actors and 128 updates of 0.025 seconds,
with actual payments, triggers, cues and projectile delivery. All derived outputs
matched the original and v0.22 adapter. Channel/persistence medians were
108.6888 / 106.5191 ms versus v0.22's 109.1079 / 108.9541 ms. Including actor timers,
they were 197.0085 / 196.3389 ms versus 197.0526 / 197.7747 ms. These small differences
do not establish a substantial optimization. The complete adapter still costs
about 6.7–7.4% more than the original on the timer-inclusive path.
No Steam Deck, older mobile, native-engine, allocation or whole-frame improvement is claimed.
The new optional module has a 16 KiB unminified JavaScript allowance; the combined
allowance rises by that amount to 388 KiB. Earlier module/core bounds stay intact.
