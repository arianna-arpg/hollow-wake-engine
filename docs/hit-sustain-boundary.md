# Hit sustain boundary

This boundary covers the three original damaging-hit statements after pool
feeding and before combat-recency stamping: skill siphon, nearby ally sharing
and life bonds, and Tree of Life damage storage. The baseline runs the complete
original resolver with native damage and native healing. The optional
`combat/hit-sustain` entry now supplies `createHitSustain`. The development game
adapter delegates these statements to the installed package; its complete
98-course comparison matches the frozen baseline. Local package, game and native
replay checks pass. Dedicated sustain performance and device acceptance remain open.

## Ownership and order

The SDK service receives the already captured damage amount, causal depth,
caster, struck target, borrowed skill definition and prepared modifier list.
It owns eligibility, ordered recipient traversal, healing amounts, bond
invalidation, and tree storage/radius writes. The host retains actors, stat
sheets, actual life recovery, story and distance observations, resource-flow
cues, text presentation and the continuation of the hit.

The integration point is inside the damaging branch of `continueLandedHit`.
Non-damaging hits and refused contacts must not acquire a new sustain phase.
The subsequent combat stamps and hit effects retain their existing order. The
service is synchronous; it must not queue effects or convert them into a batch.

`createHitSustain(ports).apply(caster, target, definition, modifiers, dealt, depth)`
returns `void`. Bind one reusable service to each host world or equivalent actor
registry. The host supplies `actors`, `tags`, `sameStory`, `distance`,
`sharingRadius`, `resourceFlow`, `sharedHealingCue` and `bondedHealingCue`.
Positions, modifier payloads, tags and cue payloads retain the host's types.
Actual healing remains `actor.healBy`; its return value is the measured gain.
There is no engine object, renderer, ambient random stream, timer or database
dependency in the optional entry.

The caller admits damaging hits and normalizes causal depth before invoking this
phase. Inputs are trusted borrowed records, not a content-import format. The
service deliberately does not clone or normalize them on every hit.

1. Siphon requires positive captured damage, a truthy siphon coefficient and a
   living caster. It can run at nonzero depth. Its native healing return value
   feeds the transfer cue, which reads the current skill cue after healing.
2. Sharing and bonds require depth exactly zero and a living caster at entry.
   Sharing computes its amount once, then traverses the live actor array in
   order. Each recipient must share the caster's story and team, be alive and
   distinct from the caster, and lie within the inclusive sharing radius.
   Each heal completes before the next recipient is examined.
3. The bond lookup happens after sharing. It reads the current actor list and
   bond, selects the first matching id and clears an invalid bond. A valid bond
   need not share the caster's team, story or range. Bond feeding defaults only
   nullish multipliers. Bond healing has its own text cue and no resource-flow
   transfer cue in this boundary.
4. Tree storage requires positive damage and depth exactly zero, independently
   of caster death. Its story comparison uses the struck target; its team check
   uses the caster. Storage is capped before radius is recomputed. Nullish
   stored damage and base radius retain their original defaults.

Text appears only when actual healing exceeds `0.5`. Life seals, healing taken,
overdrive ceilings and recovery callbacks remain inside native recovery, which
has its own extracted capability and verification boundary.

## Observable mutation

The sharing iterator retains the array on which it started. Appending to that
array can add a recipient; replacing the world's actor-array property does not
replace the running iterator. The later bond lookup and tree traversal read
the current property. A spatial index or a copied recipient list cannot silently
replace these semantics.

Callbacks can change death, team, story, positions, the skill's tags/cue,
modifiers, bond and construct records. The sharing amount is already captured;
later bond queries still see live changes. The prepared modifier list and the
damage packet's modifier list are distinct observed objects. A mutation of the
returned damage result also does not replace the earlier captured damage amount.

Nested hits use independent local values. Exceptions propagate with preceding
heals, cue writes, bond clearing and tree writes retained. There is no rollback
transaction spanning a hit. The continuation runs only after sustain succeeds.

## Baseline and acceptance

The [frozen baseline](../baseline/hit-sustain/acceptance.json) contains 98 courses with positive assertions for actual healing,
recipient order, ranges, story selection, caps, text thresholds, cue coalescing,
borrowed modifiers, live mutation, nested hits and partial failures. Two original
captures, the installed predecessor and Node 22 agree exactly. All 38 deliberate
source faults are detected without unrelated exceptions. The baseline was frozen
before runtime extraction. Normal verification must never regenerate accepted
observations.

`npm run reference:hit-sustain` checks the pinned original; adding
`-- --game <path>` checks another prepared game checkout. Both run the observer's
type check and compare the complete trace. `npm run test:hit-sustain-observer`
creates an isolated source copy and checks the 38 deliberate faults. Both
commands verify accepted input hashes and preserve source files. The ordinary
CI reference job runs both commands.

The development implementation also has 24 independent contract tests and 14
source-overlay controls. Package, runtime-fault and installed-fault commands are
`test:hit-sustain-package`, `test:hit-sustain-mutations` and
`adapter:hit-sustain-faults`. `adapter:hit-sustain` checks archive/install identity
and the frozen trace. `adapter:hit-sustain-source` verifies original and installed
boundaries, collisions, repeated installation, newline handling and unchanged
prefix/continuation text.

The [runtime checkpoint](../evidence/hit-sustain/runtime-windows.json) records
1,233 passing SDK tests, original-reference verification, the 24 focused contract
tests, 38 detected runtime faults, 14 source controls and six detected installed
faults. An independent packed consumer passes types and browser bundling (2,362
bytes). Node 22 repeats the focused tests and installed original trace.

All 21 game checks pass, including the feeding/resource cues, combat probes,
game/launcher/simulation types and 25 smoke episodes. The native driver and shared
library replay match the original exactly across 150,608 numeric observations;
two facing-angle values differ from Node by less than `5e-16`. That diagnostic
uses the complete game and observation storage, not a new native SDK API.

All 270 predecessor compiled files remain byte-identical. The optional entry
adds 3,023 bytes of unminified JavaScript and six compiled outputs. The separate
4 KiB module budget leaves the whole-package 674 KiB limit unchanged. The first
independent test draft miscalculated three tree-growth expectations; only those
test expectations were corrected. The accepted original trace was not rewritten.
The first reproduction setup stopped because its source directory had not been
materialized; the corrected setup verifies the source capsule before integration.

The [Windows checkpoint evidence](../evidence/hit-sustain/baseline-windows.json)
retains completed verification receipts and the earlier rejected draft reports.

Draft checks exposed three observation gaps before acceptance: negative depth
was normalized by the resolver; source overrides masked an extra-modifier
example; and identical copied modifiers were indistinguishable without identity
tracking. The repaired courses exercise the intended gates and actual arithmetic.

Synthetic zero/negative tree-cap courses record legacy arithmetic, including a
non-finite radius at zero cap. They do not authorize invalid content or establish
a new public content format. A future validation or behavior correction must
state its policy separately rather than silently updating expected results.

## Performance constraints

No authoring database lookup belongs in this per-hit operation. Authored records
should be validated and loaded before combat; actor state and prepared modifiers
are already available in memory. The extraction should reuse service bindings
and avoid a per-hit wrapper, recipient copies or shared mutable scratch state.
Further indexing or allocation changes require behavior checks and measured
workloads.

The Windows desktop checkpoint compares five established whole-hit workloads
with 12 alternating pairs of 1,000 hits after warmup. Current/predecessor median
ratios are 1.038 (plain), 1.044 (authored status), 0.968 (stat status), 0.938
(next-hit rider) and 1.027 (Impale). The separate identical-input control spans
0.975–1.100 across workload medians. These noisy observations do not establish
either an improvement or a regression caused by this extraction. All gameplay
comparisons pass. This existing workload set does not exercise sustained active
healing at scale. Retained heap is not allocation volume; the general core
benchmark is a separate selected-content workload. No Steam Deck, mobile,
zero-allocation or native package completeness claim follows.

The subsequent [active-sustain workload](hit-sustain-performance.md) covers seven
patterns at 8, 64 and 256 actors. Longer original/predecessor/current comparisons
expose remaining sustain overhead. A shared-method adapter experiment preserves
behavior and improves many cases, but its confirmation run exceeds a recorded
slowdown gate in the largest tree case, so it remains isolated. The maintained
runtime and adapter have not been changed by that performance experiment.
