# Hit preparation: original boundary

This checkpoint pins the first 23 statements of `World.resolveHit`, through shell
interception and before damage admission. The next extraction will own fuse
admission, ordered contextual multipliers, packet scaling and affliction carry.
The current runtime still executes this preparation phase in the game. Complete
hit orchestration, fuse execution/cancellation, damage aftermath and death remain
separate work; the existing shared damage, hit/status and effect-dispatch services
keep their accepted contracts.

## Captures and ownership

The original observer invokes the real complete hit resolver. It records stat
queries, random draws, host calls, packets, delayed queues, status/source removal,
cues, final state and partial failures. Normal captures do not instrument or
replace source. Selected cases replace a callback to exercise nested hits, a
target-specific instance, or an explicit failure; native guard and shell cases
separately exercise the original implementations.

The 122 courses include fuse timing and socket precedence; reference versus copy
ownership; effective proc depth; combat and possession stamps; noise; reverse
shatter consumption; concealment/ambush; strict rear-angle and proximity limits;
owned breakable affinity; armed victim scopes; packet scaling; affliction
conversion; tone capture; guard/shell priority; reentry and partial failures.
Two original captures and the installed predecessor agree byte-for-byte.

The source deliberately captures `def` before `attackSequences.forTarget` can
replace `inst`. Definition-based shatter, backstab and later damage admission
therefore use the incoming definition, while modifiers and the damage roller use
the replacement instance. A test supplies distinct definitions and confirms the
resulting cold packet independently.

Fuse admission precedes combat stamps, guise breaking, target replacement and
rolling. Its queue record borrows the instance, flat additions and delivery-effect
list. It copies the origin and preserves explicit tier zero. The segment contact
latch clears after cues; a failed tell leaves the queued hit and the old latch.
Scheduling does not prove deferred execution or zone cancellation is extracted.

Shatter visits the live status list backward. Each splice commits before modifier
source removal, and a failed removal retains that partial state. Status records
are borrowed, not cloned. Stack-based multipliers sum the consumed stack counts.
The observer retains removed records so both identity and state remain visible.

Packet tone is captured after contextual scaling and before affliction conversion.
Full conversion can leave a zero-damage carrier that still conveys its original
tone and an affliction. Guard and shell read the post-conversion packet, run in
that order, and are skipped when raw damage is zero. A successful interception
ends the entire hit. Shell overflow mutates the packet that proceeds downstream.

## Planned portable contract

The service must use explicit synchronous ports for world/seat accounting,
target-specific instances, positions and spatial observations, concealment and
victim conditions, the existing damage roller, guard/shell behavior, perception
noise and presentation. A three-dimensional host must not implement the game's
two-dimensional vector conventions to use the policy. Time and the delayed queue
remain instance-owned; no process-global clock, RNG, registry or scratch frame is
permitted. Nested calls retain their own locals and snapshots.

Trusted runtime records remain separate from untrusted content import. A database
or content compiler may produce those records; neither belongs in the per-hit
loop. This baseline changes no storage format and makes no performance claim.
Allocation volume, CPU time, retained memory and physical Steam Deck/mobile
acceptance remain later measured requirements.

## Verification

The first draft's tier-zero course also used a caster on tier zero. A deliberate
`??` to `||` fault survived because both branches selected the same value. The
revised course places the caster on tier two and explicitly supplies tier zero.
Its rejected draft is retained in the evidence; expectations were not accepted
until the corrected observer distinguished the fault.

The stat service also masked a removed local affliction clamp: even an authored
value of two arrived at preparation already capped to one. Two additional cases
explicitly supply uncapped host-query results and confirm that preparation caps
them. This preserves the local rule for other hosts without claiming the original
game normally emits those values. The definition-capture fault reassigns the
definition after target replacement while retaining its earlier initialization,
so it cannot pass as a mere use-before-initialization exception.

```sh
npm run reference:hit-preparation
node scripts/run-hit-preparation-reference.mjs --game <prepared-game>
npm run test:hit-preparation-observer
```

Normal verification checks the accepted helper, source lock and compressed
observations without rewriting them. Source faults must change behavior while
retaining the three intentional failure outcomes, except that removing the source
cleanup call must also remove that callback's deliberate error. Parsing failures
and unrelated exceptions do not count as detections. Separate audits check native guard precedence,
delayed ownership, reverse removal and arithmetic boundaries.

The [baseline evidence](../evidence/hit-preparation/baseline-windows.json) retains
the captures, rejected drafts, corrected controls and verification receipts.
