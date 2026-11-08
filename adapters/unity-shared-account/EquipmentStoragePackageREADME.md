# Hollow Wake Storage for Unity

Install `com.hollowwake.storage-0.5.0-preview.1.tgz` through **Window → Package
Manager → + → Add package from tarball**. This optional SQLite extension targets
Unity 2021.3.6f1 Windows x64 Editor and Standalone with Mono. Its base storage API
has no mandatory gameplay dependency and remains usable alone.

With Gameplay 0.5, `DurableSharedAccount` supports one account and 1–7 character
inventories. With Gameplay 0.6, it can also publish selected inventories' equipment
to live actors after the whole save commits. The original `DurableWorkshop`,
`DurableAccountWorkshop` and their imported samples retain their semantics.

## Connect saved inventories to actors

```csharp
using HollowWake.Gameplay;
using HollowWake.Storage;

// Create these at scene/service startup and retain them between updates.
var world = new CombatWorld();
var firstActor = world.CreateActor(characterConfigurationJson);
var secondActor = world.CreateActor(characterConfigurationJson);
var saved = new DurableSharedAccount(absoluteDatabasePath, 10,
    new uint[] { 20, 30 },
    new SharedCombatBinding(0, firstActor),
    new SharedCombatBinding(1, secondActor));
```

The host supplies the existing combat configuration JSON and an absolute save
path. Account slot 10 and inventory slots 20/30 must be reserved for this group.
Binding indices refer to the inventory-slot order. Each actor and each inventory
can occur at most once. A complete existing group restores during construction;
otherwise `BeginCreate` needs authorized account fields and two inventory starts.
Initial creation stays private until the complete save succeeds.

Valid bindings transfer actor lifetime ownership to `saved`; rejected binding
lists leave actors caller-owned. Dispose the coordinator before `world`. The
coordinator never owns the shared combat world or unbound actors. Ensure the
caller also cleans up created actors/world if construction fails.

`Submit` accepts ordered `SharedAccountAction` values and a gameplay policy.
Index `-1` addresses the account and `0`/`1` address these inventories. Inspect
the provisional replies, including nested gameplay refusals. Returning false or
throwing aborts the proposal. Keep presentation events out of that callback.

While `IsBusy`, call `Poll` from the owning main-thread update. Do not block the
game loop waiting for disk. Consume the terminal result, then publish any UI
events. Only acknowledged success publishes the new `Current` view and replies.
Bound actors may continue simulation while the write is pending. Publish at a
simulation boundary so other observers cannot see actors midway through a group.

## Failure and compatibility

Unsupported gear refuses before a database write and discards every prepared
actor change. The current combat capability accepts common unsocketed Lapis/Coral
rings and Opal amulets. This is not a promise that every item effect is available
in the native combat adapter.

Busy or stale writes leave the prior view and actors intact. Every save guards
the revisions of all configured records, including unchanged dependencies.
After a stale result, dispose and reopen the complete group before evaluating an
action again. Cancellation may arrive too late; always consume its final result.

If storage commits but later publication fails, the coordinator closes all
bound actors, including any already updated actor. The complete acknowledged
save remains authoritative. Recover with fresh actors and a reopened group.

Groups have fixed membership and preserve each record's auxiliary document.
Membership changes, auxiliary-document edits and legacy-account reconciliation
need explicit host transaction policies. No existing save or imported sample is
automatically migrated. **Durable Account** still demonstrates the older paired
account/inventory coordinator.

The one bounded save worker receives owned bytes, never Unity objects or
callbacks. A group has at most eight records and 4 MiB of document bytes; each
document is limited to 512 KiB. See `Documentation~/SharedEquipment.md` for the
full contract. Physical-device, ARM, IL2CPP and Unity Linux acceptance remain open.
