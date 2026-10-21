# Equipment and generic container actions

Version 0.14 adds `@hollow-wake/engine/inventory/equipment`. `EquipmentActions`
owns equip, unequip, bag/board moves and generic-container place/take commits.
`EquipmentSlots` validates and freezes ordered slot definitions. The optional
`equipment.json` export in `@hollow-wake/items` 0.2 contains all eleven authored
slots, including disabled slots. It is data only; importing the runtime does not
load the game's catalogue.

## Host contract

Supply explicit footprint, base, level, unique and slot ports. Slot order is part
of policy: an invalid, disabled or incompatible requested slot falls back to the
first compatible enabled slot, preferring an empty slot. `equipmentTierLevel`
uses supplied tier breakpoints and clamps above the final tier. Category-specific
exceptions, such as relic requirements, belong to the host's level port.

Each call receives current, host-owned carry records and board/level observations.
Item bodies remain canonical objects; the SDK never clones their payloads for
geometry. Instances retain bounded geometry scratch, not a carry record or actor.
Read ports must be pure and nonreentrant. Calls on one instance are sequential;
nested calls fail and release the guard even when a read throws.

These are trusted in-memory records, not an untrusted-save importer. Session UIDs
must be unique; equipped keys and container arrays must contain consistent owners,
and present coordinates must describe valid placements. Restore/repair external
saves before attaching them. The caller authorizes commands and supplies the
appropriate actor's level. Hollow Wake deliberately uses actor level for equipment
and hero level for generic-container seating; the adapter preserves that distinction.

Equipment replacement tries the vacated compatible worn slot, then the bag, then
the host's `drop(item)` sink. The sink must accept ownership without throwing,
reentering, or editing this action's records. Geometry and required sink presence
are checked before writes, but sink execution occurs at the original commit point.
For container exchange this is after removing the displaced item and before
inserting the incoming item. A host exception during that transfer is not rolled
back. The sink should enqueue delivery to a reliable host-owned recovery/ground
record before separately performing fallible presentation or persistence work.

The result reports `changed`, an optional affected item and an optional keyed
refusal. Hosts then apply actor recalculation, notification, selection synchronization
and persistence in their required order. The game adapter preserves the original
callbacks, including recalculation and dirty marking on a same-cell move and
account persistence before the final dirty mark on container moves. Account relic
place/take still use the separate relic-action policy; moving a relic retains its
authority refusal before calling this module.

Two source behaviors make refusal non-atomic: a failed automatic container place
removes and re-appends its source bag item, while a failed take removes and
re-appends the held item. An empty container view may also be created on refusal.
This order is retained because subsequent folds can observe array order.
`changed: false` describes action success, not byte-identical state.

An explicit stricter boundary applies to invalid/unplaceable source recovery:
if a failed automatic placement cannot restore the source item anywhere in the
bag, the SDK throws before removing it. The source can silently lose that item
in this invalid state. Accepted valid-source traces are unchanged; an independent
test proves that this recovery error preserves the original owner and identity.
No durable, cross-process or crash-safe transaction is claimed.

## Evidence and installation

Two identical original exports were accepted before implementation: eight actual
Worlds, 824 transitions (192 equip, 120 unequip, 112 bag moves, 144 container place,
152 container move, 104 container take), with complete before/after state and
intermediate callback snapshots. Local and actual guest seats, two classes,
masked/expanded boards, live slot edits, full destinations, ground delivery and
authority refusals are covered. A synthetic generic container uses the original
registration API to exercise this extension point.

Independent tests cover slot schema, requirement boundaries, identity, fallback,
swaps, sink ordering, refusal ordering, invalid recovery, prototype-named slots,
payload isolation and reentrancy. The offline packed consumer forges an authored
item, seats it through this policy, applies its compiled modifiers to a character,
resolves a hit and unequips it. Missing equipment-level checks and omitted ground
ownership must fail behavioral tests; a separate installed-package level fault
must change the actual game's observations.

The guarded installer compares six action methods and the old worn-slot helper
against the frozen original, rejects collisions/duplicates/unknown owned changes
before writes, and preserves unrelated work and LF/CRLF. The helper is replaced
by two explicit context builders. Run `npm run verify`,
`npm run reference:equipment-actions`, `npm run adapter:equipment-source` and
`npm run adapter:equipment-actions` after preparing the reference and game.
Installed-package fault checks must run alone with respect to that installation.

## Measurements

The benchmark calls actual World methods, including actor recalculation and save
callbacks, in original, M15 and M16 games. Node has no durable browser storage.
Setup/serialization are outside timing; intermediate ownership/coordinate
checksums and complete final state match after every batch. Three warmups precede
fifteen samples with rotating implementation order. Median milliseconds per batch
on Windows, Node 24.9.0, Intel i9-10900K:

| Batch | Original | M15 | M16 |
| --- | ---: | ---: | ---: |
| 512 bag swap pairs | 1.1034 | 0.9273 | 0.3631 |
| 128 container swap pairs | 24.7152 | 35.4069 | 33.4041 |
| 32 worn-ring swap pairs | 2.0270 | 3.4603 | 3.5814 |
| 32 equip/unequip cycles, empty bag | 1.7347 | 2.5163 | 2.6424 |
| 32 container place/take cycles, empty bag | 1.9969 | 2.7854 | 2.9256 |
| 32 equip/unequip cycles, nearly full bag | 1.9584 | 2.7319 | 2.9314 |
| 32 container place/take cycles, nearly full bag | 2.2195 | 2.9688 | 3.0353 |

Bag moves improve; most actions that recalculate characters remain slower than
the original, and several regress slightly from M15. These samples retain the
whole action cost and do not isolate the source of each difference. Remaining
character-rebuild overhead requires profiling before a specific optimization claim.
Use `npm run benchmark:equipment-actions -- --previous-adapter <retained-M15-game>`.
The runner validates original/adapter sources, retained control version and installed
runtime bytes. This is not a Steam Deck/mobile, whole-frame or allocation/GC result.

The new optional module has a 16 KiB unminified JavaScript allowance. The combined
runtime ceiling increases from 224 to 240 KiB to account for this added capability;
earlier module allowances stay unchanged. Package size is not live memory usage.
Trade authority, crafting/salvage, progression, proc execution and full native-engine
packages remain separate acceptance work.
