# Hit aftermath

This boundary covers the entire remaining continuation of an admitted hit:
the damaging-only phase after hit reactions, followed by the common continuation
through final melee-trigger dispatch. The original behavior is frozen in
`baseline/hit-aftermath` before implementation. The optional
`@hollow-wake/engine/combat/hit-aftermath` entry now implements this policy with
`createHitAftermath(ports)`, and the isolated game adapter binds it once per World.
The baseline evidence remains a separate, immutable checkpoint.

The implementation passes 35 independent contracts, 102 runtime
fault controls, 101 source-transformation controls, and a clean package consumer
with host-defined position, direction, status, frame and team types. Its installed
game binding type-checks and matches all 260 original courses exactly. The full
SDK passes 1,300 tests, the original-reference verifier and 22 broader game checks,
including 25 smoke episodes. Seventeen installed faults are detected across two
hash-verified runs; the invalid whole-phase fault and its repair are retained.
Node 22 and native replay pass. These results do not establish physical-device
performance or expose a new native-host API.

The raw source is the pinned original `World.resolveHit`. Its damaging block has
16 remaining statements, followed by 36 top-level statements. The installed
predecessor has the corresponding 16 statements and 27 continuation statements;
earlier status, effect and proc extractions account for the difference. The
source audit checks those existing composition boundaries before new work.

## Ownership

One aftermath capability should own the remaining policy and its phase order.
It should compose the existing status, hit-effect, proc and attack-sequence
capabilities, keeping their algorithms in their established modules.

The damaging-only phase includes volatile and elemental retaliation, fixture
dispatch, contagion scheduling, status spread, curse chaining, Impale composition,
echo buffs, domination, grip severing, thorns dispatch, iron-ward storage, minion
damage sharing and charge-funded retaliation. Actual skill delivery, spatial
queries, actor creation, death processing, content access and presentation remain
explicit host services.

The common continuation includes displacement, nonlethal current-life damage,
status/effect orchestration, splash, hit pickups, struck bells, kill recovery,
throng/support births, ordinary and owner-carried procs, assault/challenge/sequence
completion, buff consumption, stride spending, final death and melee triggers.
This continuation also runs for admitted non-damaging skills. It must not be
hidden inside a positive-damage gate.

## Observed constraints

- Admission remains outside this boundary. An immune contact can reach fixture
  handling in the earlier admission phase and then return. Evade and block have
  their own refusal effects. Zero landed damage still reaches the damaging phase's
  fixture, thorns, ward and charge-retaliation logic.
- Volatile readiness is inclusive, its instance is cached, and explicit zero
  cooldown or damage scale retains its meaning. Element response enumerates its
  rows once and accepts only the first eligible row; its row object stays live.
- Contagion shares the existing chain's `seen` Set. It records the victim before
  queueing the delayed release and then publishing the telegraph. Existing status
  and delayed-delivery policy remains separate.
- Status spread and splash retain their story filters and spatial edge rules.
  Equally near eligible status recipients favor the later candidate.
- Curse iteration is live. A victim whose life has become nonpositive may still
  receive a chained curse before its `dead` flag is set.
- Minion sharing snapshots eligible recipients before delivering their wounds.
  Callback changes to ownership, world membership or death do not rebuild that
  snapshot. Per-recipient life writes and kills keep their order. Recovery is
  capped separately from the full shared wound: an earlier self-healing
  retaliation can fill life before sharing refunds the captured damage.
- Damage and critical values are captured earlier. The packet and skill instance
  remain borrowed and live; the final sequence callback can observe changed packet
  amounts while still receiving the original captured damage.
- `lethal` is captured before kill recovery, throng and later effects. Buff kill
  consumption uses that capture. Final death admission rereads life and `dead`.
  Revival can therefore retain an earlier kill reward without processing death;
  later damage can cause death without earning the earlier kill reward.
- Final buff consumption obtains the skill's current context while retaining the
  earlier captured definition ID. Melee triggers have separate causal-depth and
  trigger-instance exclusions.
- Nested hits retain their local captures. A callback failure keeps preceding
  writes and stops the remaining continuation; there is no implicit rollback.

These statements describe observed behavior. Intentional gameplay corrections
require their own decision and baseline revision.

## Extraction shape

Bind one reusable service per simulation. Its entry point receives the existing
actors, instance, captured definition, modifier list and packet, plus the scalar
captures already carried by the preceding hit phases. It must not copy actor
state or construct another result envelope for each contact. Nested contacts use
their own local variables; the binding must not keep mutable per-hit scratch.

The damaging-only continuation and common continuation remain one ordered
operation. The service prepares the existing hit-status frame at its original
point, then passes that same frame to status riders, effect dispatch and granted
statuses. Proc selection and sequence settlement compose their existing SDK
services. Host callbacks provide the actual skill, summon, surface, pickup, cue
and death operations; they must not absorb the eligibility or spending policy
being extracted.

Position and direction types remain host-defined. Geometry and presentation
ports preserve their original random-read and callback order, so a 2D binding
does not impose its vector representation on another engine. Live content reads,
borrowed row identities, cached instances and the explicit recipient snapshot
for damage sharing retain the semantics above. A callback can re-enter the hit
pipeline or change a record used later in the same hit.

The first optimization constraint is avoiding additional work at this boundary.
Existing observable snapshots cannot simply become live iteration, and live
iteration cannot become snapshots. Any subsequent change to data layout,
caching or allocation must pass the accepted courses and independent contracts
before comparison on active workloads. The baseline itself measures behavior,
not execution speed.

## Frozen verification

The observer runs 260 complete original-game scenarios. Two original
captures and the installed predecessor agree exactly, with independent outcome,
arithmetic, ordering and identity assertions. Nineteen scenarios intentionally
throw from named callbacks to observe partial completion. All 101 deliberate
source faults are detected. The accepted observations are hash-bound to the
observer, positive assertions, source boundary and original source lock.

After preparing the pinned reference, run `npm run reference:hit-aftermath`
and `npm run test:hit-aftermath-observer`. The installed comparison uses
`node scripts/run-hit-aftermath-reference.mjs --game <installed-game>`.
Normal verification never replaces accepted outputs. The source-fault runner
uses a disposable original copy, verifies restoration and checks that its
observer, assertions, selectors and expected files stay unchanged throughout.

Observer development corrected inactive status/birth fixtures, an out-of-range
throng victim, random input that did not produce both intended contagion releases,
and an attack fixture whose character attributes added damage to a zero base roll.
The zero-landed-attack case now uses a real defensive ward. These repairs change
the observer, not the original game.

The first fault sweep detected 26 deliberate faults, then exposed a masked
story-filter test: changing only a recipient's story let the enemy query reject
it before the victim-relative spread filter ran. The expanded cases place the
attacker and victim on different stories, separately testing spread and splash.
Both original captures and the installed predecessor agree on these cases, and
the complete expanded fault sweep detects both story-filter mutations.

The second sweep detected 50 faults, then exposed an inactive recovery-ceiling
case. The native stat system capped its oversized sharing override at 0.8, so
the refund could not reach the life ceiling. The revised case invokes a real
self-healing retaliation before sharing. Its independent assertions require a
full life pool before the refund, capped final recovery, and the full captured
wound shared between the minions. Two original captures and the installed
predecessor agree, and the complete sweep detects all 101 faults. Both failed
development sweeps are retained in the [baseline evidence](../evidence/hit-aftermath/baseline-windows.json).

The maintained `benchmark:hit-aftermath` command exercises native damage sharing,
status spread, splash and their combination at 8, 64 and 256 actors. Independent
assertions check actual hit counts, damage, recovery and status recipients before
timing. `test:hit-aftermath-benchmark-observer` rejects six deliberate native faults,
including disabled mechanics, skipped hits and stale status state. Identical-build
controls accompany comparisons with the original and immediate predecessor.
See [measured workloads](hit-aftermath-performance.md) and the
[runtime evidence](../evidence/hit-aftermath/runtime-windows.json).

This work establishes no allocation, physical-device or native-host API guarantee.
It does not put a database in the per-hit path. Storage layout and runtime changes
must respect the borrowed-state contract, with Steam Deck and older mobile
acceptance measured separately.
