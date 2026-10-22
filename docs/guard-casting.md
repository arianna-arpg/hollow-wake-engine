# Guard casting

The optional `@hollow-wake/engine/casting/guard` entry supplies held-guard clocks,
live bash readiness, timed release, AI warning commitments and ordered release
decisions. It uses caller-owned records and explicit synchronous ports, with no
production dependencies, ambient randomness or rendering assumptions.

The original baseline covers all nine native guard definitions, 53 game courses,
256 transitions and 284 readiness inputs. Native hits, plates, parries, component
taunts, ally healing, waves and possession run in the original and installed
game. Their presence in a comparison does not mean their implementation has
been extracted into this capability.

## Ownership and admission

Create one `GuardCasting` binding per simulation with explicit trigger interval,
default release floor and default arm time. Configuration is copied at construction
and ports are bound once. Different actors may share the binding sequentially.

The host admits a press, pays its cost, creates the active guard state with its
initial shield capacity, calls `refresh` and performs native raised-guard effects.
It runs input, movement, shared AI hold selection and interruption before calling
`advance(actor, activeState, dt)`. Detached or already-ended state must not be
advanced again. The runtime does not maintain a second registry of active casts.

The host owns spatial turning, guard coverage, incoming-hit interception, parry,
shield damage/restoration, break dispatch and actual bash delivery. It also owns
native guard arts, support effects, conduits, shell storage, durable identities,
save/network authority and presentation. The guarded adapter delegates readiness
reads used by the HUD and shared AI hold calculation to the same SDK entry.

Specs, contexts and effective bash definitions are borrowed. Read ports must be
pure and cast/spec identity must remain valid during the current call. Sinks run
synchronously and may change observations of later phases. They must not throw
or reenter either `refresh` or `advance` on the same binding. Already-completed
effects are not rolled back if a later port or numeric validation fails.

## Phase contract

1. Read the guard spec and, when timed, resolve its duration from the authored
   value plus the live duration bonus, with a 0.05-second floor. This duration
   remains the current update's value even if a later callback changes the bonus.
2. A seated actor clears any AI release deadline and committed facing. Advance
   held time and let the host apply spatial turning.
3. Refresh bash threshold and arm time using the current effective bash, granted
   tags and instance modifiers. A missing bash clears all three readiness fields.
4. Run support effects, then the guard trigger clock, then the optional component
   pulse clock. Each clock emits at most once per update and retains overshoot.
   These phases precede release/death cleanup. A pulse can therefore be offered
   on the update that releases; the host still applies its normal delivery gates.
5. Apply timed expiry, then the AI warning policy using current seat/death and
   readiness observations. A warning can temporarily retain a timed stance.
6. When held input is false or the actor is dead, lower native guard arts while
   casting is still active. Reread the effective bash and shield afterward.
7. Clear active casting, set recovery to 0.2, remove the host's matching grafted
   shell and request cooldown stamping when the authored base is positive.
8. If alive and ready, deliver the bash using remaining shield, or lost shield
   for an inverted guard. The host applies geometry, element, power and hits.

The reference demonstrates why a whole-update snapshot is insufficient: a
guard-triggered buff changes the sheet immediately but the bash line refreshes
on the next update. Native plate removal happens before release delivery. The
shield payload is read before end/cleanup/cooldown, while readiness is checked
after those sinks, preserving the original order.

## Readiness and AI

`guardBashReady(state)` returns `clock`, `armed`, `line` and `ready` for display
and consumers that need the complete receipt. An absent/zero arm clock displays
as complete. The arm comparison retains the original 1e-6-second tolerance.
The shield fraction uses a denominator of one when capacity is absent or zero;
the bash line is inclusive, reversing direction for inverted guards.

The live line is the authored/default threshold times `bashFloor`, clamped to
zero through one. Positive `bashInvert` mirrors it. The authored/default arm
time times `bashArmTime` is floored at zero. Internal boolean gates avoid creating
a readiness receipt. This is an implementation choice, not a measured device claim.

`guardAiHold(state)` preserves the shared caller's raw hold for non-guard modes,
early-release policy and guards without a bash. Otherwise an armed-side shield
extends its hold to the arm clock. An absent hold returns `Infinity`; explicit
holds must be finite and nonnegative. The host still chooses the policy/roll and
sets held input from the pre-update clock, as shown in the example.

A positive AI windup commits a deadline only when the warning is due, the shield
is on the armed side and the arm clock can finish by the warning's end. Facing
is captured at commitment and the host receives the plant-until deadline. The
deadline comparison retains its separate 1e-9-second tolerance. Damage can de-arm
the eventual bash without canceling the warning clock. A seat can clear that
commitment; actual possession in the original host interrupts the cast outright.

## Use and verification

The shipped [example](../examples/guard-casting.mjs) has a minimal host admit and
pay for two guards, share one binding, emit component pulses and deliver ordinary
and inverted bashes. Its independently installed package test checks the complete
receipt and strict TypeScript declarations while rejecting browser, network and
ambient-random access.

```sh
npm run verify
npm run reference:guard-casting
npm run adapter:guard-source
npm run adapter:guard-casting
npm run benchmark:guard-casting -- --previous-adapter /path/to/retained-v0.23-game
```

The game overlay checks the complete owned guard case, readiness function, live
arming resolver and AI hold helper before writing either affected file. It
preserves unrelated source and LF/CRLF conventions, rejects reapplication and
removes the superseded readiness import from World. Normal verification never
regenerates accepted observations.

The benchmark compares original, v0.23 and current execution over 64 real actors,
six native guard configurations and 128 updates, both with and without actor
timers. It checks matching outcomes before reporting samples. It measures a
desktop Node path, with no claim about whole frames, allocations/GC, native
engine packages or Steam Deck/older-mobile acceptance. The optional guard module
has a 12 KiB unminified JavaScript allowance; the combined allowance is 400 KiB.
All previous module and core bounds remain intact.

The two recorded runs show guard-only medians 0.7–2.7% slower than v0.23.
Including actor timers, medians are 0.8–2.4% slower than v0.23 and 7.0–8.3%
slower than the preserved original. These results establish equivalent outcomes
and the cost of this extraction; they do not establish an optimization. See
[the benchmark decision](../evidence/milestone-twenty-eight/benchmark-decision.json)
for raw comparisons and remaining measurement limits.
