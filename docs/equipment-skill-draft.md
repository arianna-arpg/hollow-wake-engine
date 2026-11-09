# Private equipment skill preparation

`@hollow-wake/engine/skills/equipment-draft` supplies `EquipmentSkillDraft`.
It forks the build graph consumed by `EquipmentSkills.derive`: the learned
book, grant cache, bar, grant display rows, worn items, container item keys,
modifier-source lists, passive graft selections and toggle ownership references.
It is an optional preparation primitive; no default engine package changes.

Each source skill or item is copied once. References that identified the same
instance still identify one instance inside the candidate. Distinct owners
cannot collapse to one copy. This preserves the distinction between a same-host
grant update and a replacement that must restore another item's investment.
The existing derivation writes canonical grant state onto **candidate items**,
so a host can validate and serialize those items before starting durable I/O.
The helper does not replace full derivation with cold flat-grant lookup.

The host supplies complete pure skill/item/toggle copy functions, a candidate-owned compiled stat
sheet, and private companion/retirement services. Immutable definitions can be
shared. Mutable support rolls, tree arrays and host-specific build fields must
be copied, along with toggle metadata needed for private retirement. JSON
save/restore is not a substitute for copying an existing skill:
restore may repair tree investment or omit fields that still affect a live
instance. The runtime rejects a copier returning a source object or reusing one
copy for distinct owners; nested ownership remains the copier's contract.

Companion derivation is required even with an empty definition list, because it
can retire an earlier companion. Aura and summon retirement records identify
exact candidate instances and call the private service in original order. Those
services must account for build-side effects, such as removing a source from
the private sheet. They must not call live World effects. A failure can leave
partial writes in the candidate; discard it. The source remains unchanged when
the supplied services obey their ownership contract.

`sourceSkill(candidate)` and `sourceItem(candidate)` recover original identities
for copied records. Newly minted/replacement records have no origin. These
relations support the next publication layer; they are not permission to apply
prepared data to a live actor. Do not assign `draft.frame.actor.skills` directly
to the live bar. Publication still needs conflict checks, same-owner instance
reconciliation, current simulation state and exactly ordered live effects.
See [the accepted continuity behavior](equipment-live-continuity.md).

## Verification

After building and preparing the pinned original tooling, run
`npm run test:equipment-skill-draft-package`. It installs the actual archive,
runs eight independent ownership/failure contracts in Node and through an
isolated browser bundle, checks public types, detects six deliberate faults,
and reruns a restored control. Code caps are 8 KiB for the unminified draft
module and 16 KiB for the minified draft-plus-equipment composition.

The same command installs the equipment adapter in a disposable original game.
For every rebuild in the frozen nine-scenario continuity course it prepares a
private graph, asserts that preparation leaves the source graph and active cast
untouched, then compares its result with actual installed-game derivation.
All 47 original observations must still match the accepted bytes. This course
has no companion grants or active aura/summon retirements; explicit assertions
enforce that scope. Their private routing is covered independently, not claimed
as complete World effect parity. Temporary consumers are removed on failure too.

The helper performs work only when explicitly constructed for a build change.
It adds no frame loop, database access, ambient RNG or runtime dependency. Its
code caps are not memory, latency or Steam Deck/mobile performance results.

## Remaining integration

The workshop's learned-only v4 save contract is unchanged. Equipment-granted
bindings need explicit admission, complete build context and normalization on
every relevant private mutation, including equipment and crafting commands.
Account-owned preferences and acknowledgement-time live publication are still
required. The existing account/workshop owner reopens its short-lived crafting
kernel for each command; that internal operation must not be mistaken for a
player's cold reload when deciding how to preserve existing grant investment.
This module does not yet wire those layers or expand Unity/Godot/Unreal gear
admission. It provides the private graph that those layers can safely derive.
