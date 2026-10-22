# Persistent channel banks and actor gauges

This is the M36 extraction boundary. The original observations are accepted
before implementation; this document does not claim a released capability.
The preceding installed control is v0.30.0, commit
`55aac1893e48ce291724dcc619a6c4b35b4d9428`.

## Raw authority

The pinned original remains `88e135e6c85d301ee7c0c3641f9fc2f92be0e140`
with its existing 31-file overlay. Contemporary game changes are reviewed for
preservation, not silently imported into this gameplay baseline.

The relevant source is the bank creation/rebinding in `World.updateCasting`,
the bank-decay block inside the actor loop of `World.update`, and the gauge
portion of `Actor.refreshConditions`. `Actor.updateTimers` and the world's
timeflow gates determine when those operations happen. The retained adapter's
`channelCastingAdapter.ts` contains the equivalent creation and release lookup.
Native `StatSheet.setGauges` is the publication sink.

Two original-only observers cover bank lifecycle and gauge publication. Each
records ordered operations and their real results. Some courses deliberately
seed boundary records or valid skill variants; the native Marrow Communion and
socketed Communion courses use actual admission and advancement to earn fill.
The gauge observer calls the original private refresh method for isolated
record courses and real timer updates for the native Communion course.

## Ownership and timing

| Operation | SDK boundary | Host responsibility |
| --- | --- | --- |
| Bank creation and rebinding | Create lazily, retain an existing record, replace its instance/spec references in original order | Own the actor, map, skill instance and current resolved spec |
| Release lookup | Read the existing bank without creating a map or record | Decide when a channel releases and execute its effects |
| Idle decay | Iterate borrowed records; skip the held same-skill channel; delete empty records; respect absent decay and the inclusive bank plateau | Supply the already scaled actor delta and live contextual decay query |
| Gauge sampling | Read positive status stacks, charges, rounded brim pips, reserve pips and derived values in original order | Own and update all source records |
| Gauge publication | Detect the actual namespaced entries and publish a complete replacement when changed or when the sink changes | Supply the current stat sheet and call at the existing sampling phase |
| Conditions and clocks | Outside this extraction | Preserve condition-mask policy, condition events, timeflow, timers, casting, reserve processing and derived-gauge sampling |

Bank records are borrowed. Deletion does not clamp or erase the detached
record: a holder can still observe its final negative fill after a large decay
step. A held same-skill bank is skipped before the empty-record deletion check.
Contextual modifiers are queried only after the existing decay/plateau gates.
Releasing a cast can rebind the bank's instance and spec; a separate authored
decay override applied before release is therefore not guaranteed to survive it.

World and actor time scaling remain host-owned. A zero world step skips the
actor sweep; a fully held actor skips decay. Gauges are sampled earlier in the
frame than bank decay. Crossing a pip threshold during that decay changes the
published stat on the next sampling opportunity. M36 preserves this ordering.

## Intentional correction: `gauge-namespace-refresh/v1`

The original change detector hashes raw identifiers and values without the
namespace used in the published key. This is a deterministic defect rather
than merely a theoretical hash collision. A charge named `communion` with
value one can be replaced by one brim pip for the same skill without changing
the fingerprint. The old charge modifier remains active.

The native reproduction gains a Communion charge, admits Communion with
Gathered Casting, earns one brim pip through eleven 0.02-second casting
updates, spends the charge, and runs the next native timer update. Diagnostic
modifiers assign +100% damage to the charge and +400% to the brim. The original
still reads damage 2. Explicitly publishing the actual earned brim through
the native stat sheet reads damage 5.

The accepted original trace must retain that defect. The extraction will have
a separately named semantic oracle requiring `charge:communion = 0`,
`brim:communion = 1`, and damage 5 at the same sampling opportunity. The five
record-level namespace exchanges test the same omission across source kinds.
They are diagnostic cases, not a claim that every synthetic record is reachable
through normal player input. Candidate output must never generate the expected
correction or replace the historical fixture.

Exact equality must include the namespace, identifier, integer value and
ordered entry structure. A fingerprint alone cannot establish equality. The
cache must be owned by the publisher and bound to the actual sink. Replacing
the stat sheet must republish even if actor records have not changed. Sampling
must not rewrite actor records, change quantization, reorder duplicate entries
or move publication to a different frame phase.

## Implementation and acceptance constraints

Avoid unconditional entry arrays and prefixed-string rebuilding during stable
updates. Measure retained cache memory as well as CPU; extra retained memory
is a tradeoff, not free optimization. No database queries belong in this path.
The database/content pipeline remains a separate authoring and loading concern.

Before release, define and independently test synchronous sink failure and
reentry behavior. Those policies cannot be inferred from successful original
calls. Preserve the prior runtime and fixture as controls; compare ordinary
traces exactly and review each intentional diagnostic difference explicitly.
Installed-package tests must detect meaningful faults in bank identity, lazy
creation, deletion order, plateau gates, contextual queries, namespace equality,
sheet replacement and phase ordering.

Completion requires the SDK verifier, clean packed consumers, installed game
comparisons, relevant native/renderer regressions, and controlled measurements
of empty, stable, changing and complete-frame workloads. This boundary alone
does not establish Unity/Godot/Unreal packages or Steam Deck/mobile performance.
