# Shared inventory equipment and durable combat publication

This guide covers Gameplay 0.6 and Storage 0.5 previews for Unity 2021.3.6f1
Windows x64 Editor and Windows x64 Standalone with Mono. Gameplay can be installed
alone; storage can be installed alone or with the previous Gameplay 0.5 preview.
Only Gameplay 0.6 enables the additional actor-binding constructor.

## Choose an ownership boundary

Use `SharedAccountWorkshop` for one authoritative account and its inventories.
Do not run independent account projections that compete to update the same
progression or wallet. Each inventory retains its own item and random state.
The host authorizes earnings/actions and supplies complete starting documents.

Use `DurableSharedAccount` when local persistence and publication must agree.
Reserve distinct slots for one account and 1–7 inventories. Keep their membership
fixed for the coordinator's lifetime. Use the existing constructor without actor
bindings when no combat equipment publication is needed.

The actor-binding constructor accepts `uint[] inventorySlots`, followed by
`SharedCombatBinding` values. A binding stores an inventory index and live
`CombatWorld.Actor`. Validate the entire list before ownership transfers; each
index and actor must be unique. Accepted bindings are owned by the coordinator,
but their `CombatWorld` and unbound actors remain caller-owned. Dispose in that
order, including scene/service shutdown and error recovery.

## One action, one publication boundary

1. Build ordered `SharedAccountAction` values. Index `-1` selects the account;
   nonnegative indices select an inventory in the configured slot order.
2. Call `Submit` with a policy that inspects provisional replies. A false policy
   result or exception aborts. An outer successful transport reply does not
   imply an inner gameplay purchase succeeded. Policy callbacks cannot submit
   another batch, and must not expose candidate results to other observers.
3. The coordinator reads only changed inventories. It prepares a private combat
   projection only if the worn-item map changed. Unsupported later equipment
   discards earlier prepared actors too, before storage submission.
4. Continue normal actor simulation while storage is pending. Poll from the
   main-thread owner without a busy-wait loop. Consume cancellation's terminal
   result even if cancellation arrived after the commit boundary.
5. At a simulation boundary, acknowledged storage success publishes the account,
   equipment and immutable `Current` snapshot. Present successful UI events now.

Every save guards all configured storage revisions, including unchanged records.
Game versions, storage revisions and proposal tokens are separate identities.
Equipment publication uses the actor's current cast, clocks, resources, effects
and random continuation. It never restores the pre-save actor snapshot. Derived
resource caps still follow the accepted equipment rules.

The current native combat capability admits common unsocketed Lapis/Coral rings
and Opal amulets. Other authored gear effects require additional adapter work;
rejecting unsupported equipment is part of the boundary, not a silent omission.

## Read equipment without copying the whole inventory

`Inventory.EquipmentJson()` returns committed worn-item JSON.
`PreparedChange.EquipmentJson(inventory)` returns that map in an active proposal,
including an attached inventory that the proposal did not change. These reads
do not execute gameplay, copy account/bag data or consume randomness.

Keep the returned JSON text intact, including large item identifiers. Handles
are validated before native requests. Foreign-owner and retired handles refuse;
zero-token unchanged proposals have no candidate equipment map. Disposing an
uncommitted proposal aborts it. Ordinary in-memory `Execute` remains immediate.

## Recovery

- Busy/refused saves discard candidates and preserve the published state.
- A stale revision requires reopening the entire saved group before evaluating
  the action again. Do not restore just the conflicting inventory.
- A failure after commit closes the coordinator and every bound actor, even if
  the first actor was already updated. Recreate actors and reopen the complete
  acknowledged save. The shared combat world remains caller-owned.
- Partial group initialization refuses. Creation remains private until its
  complete save succeeds. Auxiliary documents are preserved as owned save text;
  this coordinator does not invent migrations or membership-change policies.

## Budget and support boundaries

Load/reuse gameplay owners at scene/service boundaries. Shared content and
unchanged records remain shared inside the owner. Account-only saves issue no
combat requests. Avoid polling equipment JSON or constructing owners every
frame. The one save worker has a bounded outstanding request/result and no
growing queue. Storage traffic does not enter per-frame combat arithmetic.

The shared owner's default tracked native heap is 48 MiB. Content loading uses
one explicit collection with no frame-time guarantee. Recorded desktop courses
release all tracked allocations when their owners dispose. Those observations
are not total process memory, a promise for every save, or Steam Deck/mobile
acceptance. Physical devices, ARM, IL2CPP, newer Unity versions and Unity Linux
remain separate qualification work. Existing examples demonstrate selected
capabilities; no package automatically wires an entire scene or migrates saves.

Package layout follows Unity's documented Runtime, Samples~ and Documentation~
conventions. Package versions and assembly-version definitions are independent
of gameplay/save revisions. See Unity's
[package layout](https://docs.unity.com/en-us/engine/6000.0/manual/packages-list/cus-pkg-development/cus-layout)
and [assembly definition reference](https://docs.unity.com/en-us/engine/6000.0/manual/scripting/compilation-and-code-reload/script-compilation/assembly-definition-files/class-assembly-definition-importer).
