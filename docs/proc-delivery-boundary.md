# Proc execution and payload boundary

This boundary covers the complete `World.executeProc`, `World.castProcPayload`
and `World.heldSkillInst` methods. It records original behavior before a new
runtime or adapter replaces them. The existing proc admission/rider service,
magnitude fold, delayed queue, resource services and status services remain
separate capabilities that the dispatcher must compose.

The original catalogue has 147 proc definitions with 21 effect shapes. A
programmatic birth adds the twenty-second dispatcher branch. Capturing all
definitions is separate from claiming that every possible combination of content
has been tested. Definitions and their insertion order accompany the observations.

## Authority and observations

The recorder invokes the actual original World and Actor methods. It observes
state before and after synchronous callbacks, arguments, returns, deliberate
exceptions, random consumption, actor order and object identity. A callback can
change live state or re-enter proc execution. Each course has an isolated world
and a named random seed. Geometry, native damage, skills, status application,
summon construction and projectile travel still execute their original code.

There are 328 courses, including every authored proc, missing targets and skill
instances, power and cue variations, contextual modifiers, range and story gates,
arc ties, summon caps and ownership, socket forwarding, nested execution, rider
casts, held-instance precedence, projectile placement/spreads and actual travel.
Twenty-eight courses deliberately interrupt a callback before or after its native
work to preserve partial-write and exception boundaries.

Independent assertions check consequences in addition to comparing entire
observations. For example, a real Crushing Impact gem must reach both summoned
weapon skills, a full charge bank must not emit a gain pulse, and an outward bolt
must spare its anchor while damaging the next target. Live cue pulses are captured
separately from the optional mirrored UI rows.

The [accepted fixture](../baseline/proc-delivery/acceptance.json) matches two
original runs and the current installed predecessor byte-for-byte. All 63 scoped
source faults are detected; all 55 focused positive controls first match their
rows in the full capture. A further run through the normal frozen-fixture command
also passes. [Windows evidence](../evidence/proc-delivery/baseline-windows.json)
retains those receipts and the unchanged source/runtime maps. The dedicated
Windows/Linux workflow is a separate hosted gate; this local record does not
claim its result in advance.

The first hosted run at `3edec57` exposed a clean-start defect in the verification
commands: the missing `.artifacts` parent stopped temporary-directory creation
before either platform reached gameplay capture. The commands now create their
own output parent. Replay and fault testing run in separate fresh jobs on each
platform so one command cannot hide the other's setup dependency. Frozen fixture
bytes and gameplay behavior are unchanged. The
[clean-start verification](../evidence/proc-delivery/cold-start-windows.json)
runs both commands in separate empty workspaces and reproduces each exact
old-code failure. Acceptance requires all 118 focused control/fault outputs to
match the earlier recorded bytes. The original acceptance receipt is retained
unchanged.

This boundary does not claim runtime extraction, performance improvement,
renderer acceptance or native engine-package support.

## Rules the extraction must preserve

- Resolve proc power once using the triggering instance's tags and modifiers.
  Fold the effect once through the existing capability. Borrowed authored records
  remain visible to later callbacks; no process-wide mutable registry is required.
- Execute the selected effect synchronously, then run the rider tail at the
  incoming depth. Ordinary early branch exits still reach that tail. A thrown
  callback stops further work without rolling back already completed effects.
  Nested calls retain their own local captures.
- Preserve distinct resource services and their cue gates. Charge gains announce
  only a real increase. Explicitly disabled stored buff cues remain disabled.
  Buff duration reads the triggering instance's context. Cleanse selects IDs
  before ending them; repeated remove-buff IDs retain their original call order.
- A typed burst captures its base/level amount before striking surfaces, then
  queries current enemies and reads live positions. Mitigation precedes the
  invulnerability test, so defense pools can be consumed even when life is spared.
  Shield-break flags clear before observers; defense sweeps precede death.
- Explosions compare against the struck target's story. Arcs start at the struck
  target, exclude already struck identities, query again each hop, and choose the
  later candidate on a distance tie. Fractional hop limits retain the original
  loop behavior. Geometry remains a host service.
- Proc summons resolve `caster.owner ?? caster`, census living actors with the
  same owner and proc key, and retain construction, lifeline, socket forwarding,
  duration, scatter/clamping and publication order. Births use the resolved
  keeper's position for self placement. Their host flag depends on exact target
  identity, including when that target is also the keeper.
- Missing cast definitions consume no randomness. Count draws still occur for
  fixed or zero counts; positive projectile counts consume a phase draw even for
  a zero-width fan. Explicit zero multipliers remain zero.
- Held skills resolve bar first, granted instances second and learned instances
  third. The exact held instance is reused. Synthetic instances are fresh per
  occurrence and carry proc depth. Their level is captured before delivery;
  mutations to an existing held instance remain visible to the next occurrence.
- Cast origin and multiplier are captured before delivery. Projectiles share the
  captured launch-position object across occurrences; an aimed, unanchored bolt
  leaves the caster's hand. Anchored bolts lock out the anchor through the native
  projectile hit map. Non-projectile payloads receive an explicit copied center
  and the existing cooldown/repeat/follow-up/facing flags.
- Actual projectile travel enters the hit resolver at its ordinary depth. The
  synthetic instance's depth stamp is then applied by hit preparation and reaches
  downstream proc reactions. Direct call arguments alone do not prove this path.

These are observed rules, including unusual ones; this milestone makes no silent
gameplay corrections. Any deliberate redesign needs a separate decision and
before/after evidence.

## Planned reusable boundary

The runtime should own the ordered dispatcher, cast-payload policy and held-skill
selection. It should accept generic actor, skill, position and direction types
through explicit synchronous ports. The adapter should supply geometry, authoritative
world/seat queries, content lookup, randomness, native skill/projectile execution,
construction, death and presentation. Existing SDK resource, damage, status and
delayed-effect services should be composed without duplicating their arithmetic.

Mutable actor records and skill instances stay borrowed. Short-lived captures
stay local to a call. A queued command/event rewrite would change callback order,
partial failures and live reads, so it is not an interchangeable optimization.
The raw trace files are development evidence; they are not runtime allocations or
part of a player's package.

As described in [content storage](content-storage.md), an optional database can
support authored records and tooling. It does not replace the measured runtime
boundary. This extraction adds no database query, runtime dependency, scheduler
or fixed two-dimensional vector type to the SDK. Allocation and throughput
claims must follow complete receipt-checked workloads, and physical Steam Deck
and older-mobile acceptance remains open.

The eventual dispatcher also needs the existing full-attack native replay under
the unchanged 256 KiB stack limit. Proc nesting crosses the same hit/cast path
whose forwarding frames previously exhausted that limit; a matching JavaScript
trace alone cannot accept another native stack regression. See the
[stack investigation](native-stack-investigation.md). Dedicated proc replay and
physical-device workloads remain additional acceptance work.

## Reproduction

After `npm run reference:prepare` and `npm run reference:install`, run
`npm run reference:proc-delivery` and `npm run test:proc-delivery-observer`.
The reference command compares against frozen observations and never regenerates
them. The observer-fault runner
materializes a disposable original source copy. Each focused positive control
must first equal the corresponding row in the complete capture; the changed
source must then produce a different observation with the same expected errors.
Parser failures and unrelated runtime exceptions do not count as detection.

Source hashes cover the three complete methods, all twenty-two clauses and their
statement order in both the original game and the current predecessor adapter.
The original source capsule, compiled SDK and predecessor installation remain
unchanged throughout capture and replay.
