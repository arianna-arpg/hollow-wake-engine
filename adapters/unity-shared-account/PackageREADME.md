# Hollow Wake Gameplay for Unity

Install this tarball through **Window → Package Manager → + → Add package from
tarball**. The preview supplies Unity 2021.3 Windows x64 Editor and Standalone
with Mono. Other platforms and scripting backends require separate qualification.

Import **Casting and Burning** from Samples and open **Ruin Encounter** to try
casting, timed damage and the inventory workshop. The existing combat, pouch,
workshop, progression and equipment APIs remain available.

## One account, several inventories

The 0.5 preview adds `SharedAccountWorkshop`. It gives account progression,
crafting expertise and ledger counters one authority across independently owned
character inventories. Each inventory save references its account key instead
of storing a competing copy of shared fields.

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
        string accountSave = account.Save().Json;
        string inventorySave = inventory.Save().Json;
        // Retain complete save text, including unknown fields and random state.
    }
}
```

These ordinary commands publish in memory immediately. For durable actions,
`Prepare` stages a batch and returns provisional replies and candidate saves.
Persist the complete guarded account/inventory group, including unchanged
dependencies, before calling `Commit`. Disposing an uncommitted proposal aborts
it. A purchase can have transport `ok:true` and gameplay `result:false`; inspect
the nested result before presenting success or writing a save.

The optional Hollow Wake Storage 0.4 preview supplies `DurableSharedAccount` for
this transaction boundary. Storage is a separate package; gameplay does not
open files or choose save locations automatically. The existing independent
`AccountProgression`, `CraftingWorkshop` and older storage coordinators retain
their original semantics. No legacy account projections are automatically merged.

## Lifetime and budgets

Create owners on Unity's main thread. Retain them while needed and dispose
inventories before accounts, then the owner. A retired handle or command cannot
reach a replacement that reuses its number. Native failure requires disposal
and restoration from an authoritative checkpoint.

The shared owner defaults to 48 MiB of tracked native heap and performs one
explicit collection after content loading. That collection has no frame-time
bound. The qualification course also exercises 32 MiB; this is not a guarantee
for every save, total Unity memory or a physical device. Inventory commands are
transactional UI operations, not per-frame combat work.

See `Documentation~/SharedAccount.md` for the full API boundary. The standalone
SDK repository contains source, qualification recipes and evidence. The package
preserves its existing license and third-party notices.
