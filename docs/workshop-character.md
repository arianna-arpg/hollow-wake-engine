# Durable workshop character context

`@hollow-wake/engine/account/workshop-character` adds strict source-context
admission to `AccountWorkshopSession`. Supply `definitions.character` and the
`character` field when opening an inventory to opt into
`account-workshop-inventory/v2`. Existing inventories remain v1, including their
command results and save bytes. A v2 save requires matching character support
when restored; it cannot silently downgrade to v1.

The character record contains its level, raw base attributes, complete
`PassiveBuildState` (class, ordered allocations, choices, graft targets,
vocations and point wallets), and personal container bodies. It carries its
own `workshop-character/v1` identity. The host supplies a content ID covering
its attribute registry, passive policy and container declarations; the nested
inventory continues to bind item, crafting and skill content independently.
Content IDs are compatibility identifiers, not an authorization mechanism.

These are inputs for deriving a build. Computed attributes, stat sources,
private skill graphs and combat state are not serialized here. Learned skills
remain in the existing inventory book or legacy rack. This version does not
store the original character's complete world save, opening, companion stances,
experience or granted action-bar bindings, and does not add commands to edit
class, level, passives or container placement.

## Admission and ownership

The bounded JSON boundary rejects accessors, cycles and excessive input before
callbacks. Character admission requires the exact registered attributes, a
positive integer level, known class/passive/vocation references, valid ordered
choices and valid graft sources. A non-null graft target must be a learned
skill in the attached inventory. It uses the existing strict passive policy;
legacy repair and retired-content migration are separate operations.

Personal items pass the existing complete crafting item validator and their
declared container's category/tag acceptance. Every body requires paired
nonnegative integer placement. The source record retains inactive, overlapping
or outside-board placements: board availability and misfit exclusion belong to
the contribution calculation, and admission never silently drops owned items.
No item UID may occur twice across bag, equipped items, overflow and personal
containers. All bodies, including currently inactive ones, reserve their UID.
A new inventory without an explicit allocator advances above those bodies;
explicit allocator values and restored saves must already respect that floor.

The pinned original `serializeCharacter` excludes `relicKey` bodies from its
bag and container arrays. `World.restoreAccountRelics` then obtains canonical
account bodies, and `persistAccountRelics` records their seated/carried keys.
This extension consequently refuses account-keyed bodies in every character
location and nonempty containers declared `accountStorage`. Empty account
container declarations may be retained. It does **not** project or normalize
the account's opaque `ProgressionRelic.payload` into item bodies. Account relic
projection, carried-property access and account-resident grant writeback need
their own single-owner composition; callers must not hide competing bodies in
the character record or opaque account metadata.

## Transactions and build preparation

The account owner retains the admitted context beside the inventory kernel
save. Temporary kernel reopening cannot erase it. Save/restore, grouped
preparation, commit and abort retain the v2 record. Complete reply/save limits
include the context. Shared account changes pass each sibling's own detached
context to its private build; a late sibling failure publishes neither owner.

`WorkshopBuildInput.character` supplies a detached context to both cold and warm
preparation. Service edits to that input do not publish. Grant writes continue
to address only bag, equipped and overflow items: neither personal containers
nor account relic investments can be rewritten by this port. There is no live
actor publication or automatic full authored build provider in this extension.

An ordinary inventory command cannot change the context, so warm validation
checks only UID ownership, graft-carrier links and the allocator floor. It does
not reconstruct the passive graph. A command that would orphan a bound graft
is refused atomically until an authorized composed operation can update both
records. This strict behavior is a new save-boundary rule, not a claim that the
original game's tolerant cold loader rejected the same input.

## Evidence and limits

`npm run test:workshop-character-package` packs and installs the SDK into an
independent consumer, checks public types, bundles the same contracts for a
browser with hostile ambient APIs, and detects ten deliberate implementation
faults. Thirteen contracts cover legacy compatibility, v2 roundtrip, UID
allocation, account-body exclusion, learned graft ownership, failure/abort
isolation and cold-only passive admission. They also retain raw base attributes,
class IDs and allocated/choice inputs from 78 frozen original class observations
and recompute the original attribute values after save/restore. That comparison
does not qualify complete original character restoration or effect execution.

The character validator has an independent 8 KiB unminified module allowance.
The optional account owner allowance changes from 25 to 27 KiB for v2
coordination; its independent browser and historical core budgets remain in
force. The combined character/passive/workshop qualification bundle has a
208 KiB bound. No per-frame work, database, runtime dependency, RNG draw or
filesystem access is introduced. These size and operation boundaries are not
Steam Deck/mobile timing measurements, native v2 admission or Unity/Godot/Unreal
package qualification.
