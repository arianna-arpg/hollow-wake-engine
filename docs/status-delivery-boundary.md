# Status siphoning and Impale recall

The original behavior is frozen before extraction in `baseline/status-delivery`.
Two original runs and the installed predecessor produce identical bytes across
88 courses. Independent assertions check the outcomes; all 52 deliberate source
faults change the trace without introducing unrelated exceptions. The optional
`@hollow-wake/engine/statuses/delivery` entry now supplies a development candidate
through `createStatusDelivery`. Installed-game and performance acceptance are
recorded separately from this frozen baseline.

The source is the two complete `executeSkill` branches for `siphonStatus` and
`recallImpales`, plus the returned spear's exact-instance association used by
`clearTreeFields`. Their statements and identity boundary are recorded with
source hashes. The authored Draw Corruption, Spear Recall, Rending Extraction
and Crossing Steel definitions remain unchanged.

## Boundary and observable behavior

The capability owns selection, ordered status removal, healing and burst
policy, returning-spear identity and selective retirement. It composes the
existing transplant and damage capabilities. The host supplies actor membership,
geometry, shared mitigation, actual projectile flight, death and presentation.
Extracting a spawn instruction alone would leave the identity lifecycle incomplete.

Create one binding per simulation. `siphon` and `recall` borrow the host's actor,
status, skill and cache records; their callbacks execute synchronously. They
propagate failures after the writes that already occurred, without transactional
rollback or shared operation scratch. `isReturnedFrom(spear, source)` compares
exact instance identities through the binding's weak association. The host
combines that predicate with its other projectile-retirement rules.

Position, direction, modifiers and extended status records retain their host
types. The package consumer checks three-dimensional positions and quaternion
directions; the game adapter supplies its existing two-dimensional geometry.
The exported interfaces describe trusted borrowed records, not a serialized
content or save schema. Host queries retain their own membership and snapshot
semantics. Definitions, effective levels and mutable effect fields are read at
their original points in the operation.

- Siphoning iterates live actors and reverse status order. It skips the caster,
  dead or hidden actors and all constructs, applies the requested team filter,
  and includes the body's exact radius edge. It has no additional story filter.
- Transplant is attempted before removal, modifier cleanup, counting and optional
  healing. A declined transplant still removes and counts the source status.
  Remaining duration and the skill's display name reach the transplant service.
  Healing reads current contextual healing power separately for every status.
- Recall uses the host's enemy query, excludes breakable constructs and includes
  the body's radius edge. A status needs both a discharge definition and a
  positive bank. Removal and modifier cleanup precede bank capture and mitigation.
- The recalled burst retains its elemental damage type. The returning spear is
  physical. Explicit zero damage or spear shares remain zero. Shields can absorb
  the burst without preventing bank consumption or projectile creation. The
  original raw burst path also affects an invulnerable target; this baseline
  preserves that observation rather than silently changing it.
- Ordinary spears reuse the caster's cache at the effective skill level. Tree
  overrides create a distinct instance for each occurrence and retain the exact
  granting instance. Refunding one tree removes its flights while another tree's
  and ordinary cached flights survive. Three courses run actual projectile travel.
- Callback-visible writes, nested delivery and nine deliberate callback failures
  retain the original ordering and partial state. Live callbacks can affect later
  levels or shares; already captured bank values remain captured.

## Reproduction and limits

Run `npm run reference:status-delivery` against the pinned original. Use
`node scripts/run-status-delivery-reference.mjs --game <installed-game>` for an
installed comparison. `npm run test:status-delivery-observer` tests the positive
control and 52 source faults in a private original-source copy. These commands
read accepted fixtures; they never regenerate them.

`adapter:status-delivery-source` checks guarded source replacement and last-use
import cleanup. `adapter:status-delivery` verifies the packed installation and
compares all original observations. `adapter:status-delivery-faults` introduces
behavioral faults only into a disposable installation and verifies restoration
of its source and package. The full SDK verifier includes the independent
contracts, runtime faults and clean package/type/browser consumer.

The optional entry has a separate 5 KiB JavaScript budget. The prior 674 KiB
combined allowance is retained for predecessor modules; the new combined
allowance is 679 KiB. Package size does not establish execution time, total
allocation volume or a physical-device memory budget.

The [baseline evidence](../evidence/status-delivery/baseline-windows.json) retains
the capture receipts, fault results and observer-development corrections. The
work does not establish an external content schema, persistence transaction,
performance improvement or physical-device/native-package acceptance.

## Extraction acceptance

The [runtime evidence](../evidence/status-delivery/runtime-windows.json) records
all 88 installed courses matching the frozen original byte-for-byte, 1,325 SDK
tests, 25 independent delivery contracts and 52 runtime faults on Node 22 and 24,
55 source controls, and fifteen installed runtime/binding/forwarding faults.
Game, launcher and simulation types pass. Earlier status lifecycle, status-effect,
damage, hit-aftermath and attack-sequence comparisons pass, as do the original
reference check, game smoke simulation and local C/C++ full-attack regression.

The clean consumer verifies the public types and browser bundle. The optional
entry contributes 4,697 unminified JavaScript bytes, and all 288 predecessor
compiled files remain unchanged. The original game and existing work are
preserved. The initial integration exposed a truthy authored `breakable` payload
and an orphaned import; their corrections and failed discovery receipts are
retained alongside the accepted checks.

The native full-attack regression initializes this binding; it is not a dedicated
native replay of all 88 status-delivery courses. Dedicated native delivery,
complete Unity/Godot/Unreal packages and physical-device acceptance remain open.

## Active desktop measurements

Run `node scripts/benchmark-status-delivery.mjs --previous <predecessor-location>
--location <current-location>` for the balanced comparison; `--verify-only`
checks equivalent work without timing, and `--control` uses the current version
in every role. `scripts/test-status-delivery-benchmark-observer.mjs` requires the
verified original comparison and detects eight deliberately broken workloads.
CI runs the equivalence and fault checks without treating shared-runner timings
as performance budgets.

Each cycle re-applies native statuses before executing the complete skill.
Siphoning actually transfers and heals; recall actually consumes banks, damages
targets, creates projectiles and runs selective retirement. Population includes
one caster. All other actors participate. Equal resets, native re-application
and read-only counters are timed; snapshots, interprocess messages and explicit
GC are outside the interval. Projectile travel and world/frame updates are not
timed. Three original/previous/current workers use twelve rounds covering all
six process orders twice. The predecessor includes the native stack repair.

The first comparison, a same-version control, and a repeated comparison are all
retained. Each value below is the median of paired current/predecessor time
ratios; below one means less elapsed time. The control compares identical code.

| Workload | Actors | First | Repeat | Same-version control |
| --- | ---: | ---: | ---: | ---: |
| Siphon | 8 | 0.854 | 0.884 | 0.984 |
| Cached recall | 8 | 0.991 | 0.980 | 0.971 |
| Tree recall | 8 | 0.875 | 0.936 | 1.147 |
| Siphon | 64 | 0.916 | 0.779 | 0.946 |
| Cached recall | 64 | 0.940 | 0.928 | 1.084 |
| Tree recall | 64 | 0.754 | 0.815 | 1.058 |
| Siphon | 256 | 0.894 | 0.771 | 0.980 |
| Cached recall | 256 | 0.949 | 0.976 | 1.011 |
| Tree recall | 256 | 0.817 | 0.832 | 1.020 |

All nine measured medians are lower in both comparisons. The identical-code
control varies from 0.946 to 1.147, so smaller differences do not establish a
speedup. This is desktop evidence for the stated workloads, not a general engine
or device performance claim. The complete checks and all series retain identical
game/package inputs. Core benchmarks pass separately with the other verification
work finished. Hardware: Windows x64, Node 24.9.0, Intel Core i9-10900K.
Retained heap after forced GC is recorded and does not measure allocation volume.
