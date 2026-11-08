# Hollow Wake Gameplay for Unity

Install `com.hollowwake.gameplay-0.6.0-preview.1.tgz` through **Window → Package
Manager → + → Add package from tarball**. This preview targets Unity 2021.3.6f1
Windows x64 Editor and Standalone with Mono. Other Unity versions, platforms and
scripting backends need separate qualification.

Import **Casting and Burning** from Samples and open **Ruin Encounter** for the
existing casting, timed-damage and inventory-workshop demonstration. The combat,
pouch, crafting, progression and separate-equipment APIs remain available.
The sample does not automatically adopt shared-account storage.

## Shared account and equipment

`SharedAccountWorkshop` owns shared progression, crafting expertise and ledger
counters once, alongside independently owned character inventories. Save text
preserves complete documents, unknown fields, large item identifiers and random
continuation. Retain that text rather than rebuilding it with Unity's field
serializer.

```csharp
using HollowWake.Gameplay;

using (var owner = SharedAccountWorkshop.Open())
using (var account = owner.OpenAccount(1, "example-account", 17))
{
    // Example-owned grant. A real game supplies authorized earnings.
    account.Execute(@"{""op"":""observe"",""level"":1,""credits"":1000,""ledger"":{},""roster"":[]}");
    const string emptyInventory = @"{""board"":{""w"":6,""h"":6},""items"":[],""overflow"":[],""equipped"":{},""essences"":{}}";
    using (var inventory = account.OpenInventory(1, 71, emptyInventory))
    {
        string reply = account.Execute(@"{""op"":""buy"",""id"":""memory_discovery""}");
        string equippedItems = inventory.EquipmentJson();
        string accountSave = account.Save().Json;
        string inventorySave = inventory.Save().Json;
    }
}
```

Ordinary commands publish in memory immediately. `Prepare` instead stages a
batch and supplies provisional replies and candidate saves. Persist the entire
guarded dependency group before `Commit`; disposing the proposal aborts it.
Inspect nested gameplay results: transport success alone does not mean a
purchase or inventory action succeeded.

`Inventory.EquipmentJson()` reads only committed worn items.
`PreparedChange.EquipmentJson(inventory)` reads the active proposal's worn
items, including an unchanged attached inventory. Neither read changes gameplay
or random state. Retired, foreign-owner and zero-token proposal reads refuse.

The optional **Hollow Wake Storage 0.5 preview** connects these changes to live
combat actors with `SharedCombatBinding`. It validates candidate equipment,
saves the complete group, then publishes gear without restoring an old combat
snapshot. Casting, clocks, resources, effects and randomness can continue while
the save is pending. See `Documentation~/SharedEquipment.md` for ownership,
recovery and the deliberately limited equipment capability.

## Integration and budgets

Create and use gameplay owners on Unity's main thread. Reuse an owner while its
account is active; dispose inventories, accounts and then the owner. The storage
coordinator manages its own account/inventory handles. A retired handle cannot
reach a replacement object that reuses its numeric ID.

The shared owner defaults to a 48 MiB tracked native heap and collects once after
loading content. Startup collection has no frame-time bound. The qualification
course also runs at 32 MiB, but neither limit describes total Unity memory or
every admissible save. Inventory transactions are UI operations; avoid loading
owners or serializing equipment every combat frame. The durable binding prepares
only changed worn maps; account-only saves make no combat requests.

Game authority, earning, input, rendering, collision and persistence policy remain
explicit host responsibilities. Existing account projections are not silently
merged or migrated. Physical Steam Deck/mobile, ARM, IL2CPP and Unity Linux
qualification remain open. The existing license and third-party notices apply.
