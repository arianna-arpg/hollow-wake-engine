# Challenge casts and timed devices

The optional [continuation service](challenge-continuation.md) copies owned casts
and device schedules into an already detached host graph without replaying them.

Pursuers select the nearest enemy with a single scan of finite distances. Equal
distances retain the first candidate in host order. The distance metric remains
`Math.hypot`; a nonfinite distance falls back to the previous sorting path.
Host coordinates must remain stable during synchronous selection. See the
[targeting comparison](challenge-targeting-performance.md) for scope and reproduction.

`@hollow-wake/engine/combat/challenges` exports `Challenges` and its host types.
`combat/challenge-content` exports `ChallengeContent`. Both are optional imports.

The controller owns captured casts, reopening readiness, guaranteed-reset clocks,
secondary generations, orbit target ledgers, pending landings, active devices,
pursuers and delayed aftershocks. Hosts supply current time, randomness, actor and
carrier collections, skill construction, stat reads, spatial selection, damage,
spawning, zone retirement and presentation through synchronous ports.

Call `prepare` at the original cast phase, `completed` after delivery, and
`beforeEffects`/`afterHit` at their corresponding contact phases. `toss` admits a
device placement; `update(dt)` advances the existing landing and effect phases.
`clear(owner, host)` retires one exact host; `clearAll()` retires the controller's
states. Each simulation owns a distinct controller and host context.

## Content and identity

`ChallengeContent` reads trusted authored patches through `patch(definition, id)`.
It sorts a copied selection array, applies patches in that order, and preserves
duplicate lookups and last-write precedence. Returned roots are fresh; nested
authored rows remain borrowed. `delivery` produces the pylon placement definition,
including an explicitly authored zero capacity. Content admission belongs to the
loading layer; this low-level assembly service is not a parser for untrusted data.

Authored Goad identifiers are preserved: the host-supplied `deviceCall` definition
must use `goad_device_call`. State is keyed by owner ID and skill-definition ID.
Preparing a replacement host for that key retires the former investment.

Captured casts own their socket, graft and investment arrays while retaining
support entries, definition, extra modifiers and runtime-state aliases. Their
exact identities remain recognized even after retirement. A shallow copy of a
captured cast does not carry its private controller association. Host logical IDs
must remain stable and identify distinct actors within the simulation.

Carrier collection replacements must reach the host's live collections. Cleanup
selects both the exact host skill and caster; foreign-caster carriers remain.
Zone retirement runs through its explicit effect callback. Device retirement also
removes field-owned wounds, cancels pending shocks and retires its pursuer.

## Time, effects and errors

Time is an explicit absolute host clock; `dt` advances landing travel separately.
Guaranteed resets short-circuit the random read, aftershocks retain their sampled
placement, and echoes are scheduled relative to execution time. The controller
does not read a database, browser, wall clock or ambient random source.

Host effects are synchronous. A callback failure preserves preceding writes, as
in the original game; these operations are not durable transactions. Body
allocation, damage landing, authority, frame scheduling and durable publication
remain host responsibilities. Full private-graph continuation and native engine
bindings still require additional integration.

## Verification

After `npm ci`, `reference:prepare`, `reference:install` and `build`, run:

```sh
npm run test:challenges-package
npm run reference:challenges
npm run adapter:challenges
npm run adapter:challenges-composed
```

Each command creates its output directory, including on a fresh checkout.
The package course exercises twenty independent contracts in installed Node and
a browser-target bundle executed in an isolated Node VM with forbidden host
globals, eight negative type cases and sixteen deliberate faults. Another eighteen
targeting cases run in both consumers, with five additional targeting faults. It does not
launch a rendered browser. Original observations contain the pinned Goad probe's 56
checkpoints plus five seeded identity/retirement checkpoints. Normal reference
checks compare all 61 accepted observations without regenerating them. Installed
game checks use both package entries, six source-admission guards, six deliberate
runtime/adapter faults and a restored control.

The composed check restores only the two original challenge files inside the
otherwise identical installed SDK assembly. It compares two fresh runs on each
side, all three game type configurations and 25 combat episodes. The report
separately records whether those observations also match the pinned original.
This paired comparison qualifies the challenge replacement within the assembly;
it is not evidence that every other extracted system matches the original game.

The combined unminified runtime/content group has a separate 20 KiB limit; the
installed browser consumer has a 12 KiB limit. Earlier package limits remain in
place. These bounds concern code size. They do not establish frame cost,
allocation volume or performance on Steam Deck and older mobile hardware.
