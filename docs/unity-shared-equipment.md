# Install the Unity shared-equipment preview

The [shared-equipment release](https://github.com/arianna-arpg/hollow-wake-engine/releases/tag/unity-shared-equipment-v0.6.0-preview.1)
provides these optional packages. Use the release page for publication status
and downloads; repository source alone is not an installed package.

| Package | Purpose |
| --- | --- |
| `com.hollowwake.gameplay-0.6.0-preview.1.tgz` | Selected combat, pouches, crafting, progression and equipment APIs, with one shared account and lightweight committed/prepared equipment reads |
| `com.hollowwake.storage-0.5.0-preview.1.tgz` | SQLite persistence, whole-group revision checks and optional publication of saved equipment to live actors |

Install through **Window → Package Manager → + → Add package from tarball**.
For a fresh project, install gameplay first when using both. When upgrading an
existing Gameplay 0.5 / Storage 0.4 project, update storage first, then gameplay:
the intermediate Gameplay 0.5 / Storage 0.5 pair is qualified. Storage also remains
usable alone. Only Gameplay 0.6 enables the actor-binding constructor.

The qualified target is **Unity 2021.3.6f1 Windows x64 Editor and Windows x64
Standalone with Mono**. This does not qualify newer Unity versions, Unity Linux,
ARM, IL2CPP, Steam Deck or older mobile hardware.

Import **Casting and Burning** and open **Ruin Encounter** for the existing
gameplay and inventory-workshop sample. The sample retains its existing ownership
model. The storage samples also retain their original APIs; neither installation
nor importing a sample silently migrates existing saves to shared authority.

## Connect a game's account and actors

Start with the [gameplay guide](../adapters/unity-shared-account/EquipmentPackageREADME.md)
and [storage guide](../adapters/unity-shared-account/EquipmentStoragePackageREADME.md).
The packages include `Documentation~/SharedEquipment.md` with the full boundary.

`SharedAccountWorkshop` holds one account and several independently owned
inventories. Prepared commands produce provisional replies and saves without
publishing. The host authorizes actions, evaluates nested gameplay refusals and
chooses when successful results reach presentation.

`DurableSharedAccount` reserves distinct slots for an account and 1–7 inventories.
Each save guards every configured record's revision, including unchanged
dependencies. Optional `SharedCombatBinding` values connect inventory indices to
live actors. Only changed worn maps prepare combat work; account-only saves make
no combat requests. The database remains outside per-frame combat arithmetic.

The current native combat gear capability accepts common unsocketed Lapis/Coral
rings and Opal amulets. Unsupported gear refuses before a storage write. The
broader authored item/effect catalog is not yet completely exposed through this
combat adapter.

While storage is pending, actors can continue casting and advancing effects,
resources and randomness. Poll from the main-thread owner without blocking the
game loop. At a simulation boundary, successful acknowledgement publishes the
equipment and `Current` snapshot. It does not restore a stale actor snapshot.

The coordinator owns successfully bound actors, but not their shared combat world
or unbound actors. Dispose it before the world. Invalid binding lists leave actors
caller-owned. If a save is stale, reopen the complete group before reevaluating
the action. If storage commits but publication fails, all bound actors close;
recover with fresh actors and the complete acknowledged save.

Group membership is fixed, auxiliary documents are preserved, and legacy account
reconciliation remains an explicit host policy. See the [equipment contract](shared-account-equipment.md).

## Verification and measured limits

[Release qualification](../evidence/unity-shared-equipment/README.md) records fresh
installation in the editor and relocated player, imported sample execution,
storage alone, previous-gameplay compatibility and lifecycle/recovery checks.
Both preview archives reproduce byte for byte. Their complete Runtime payloads,
existing samples, asset identities and native libraries match the qualified
development candidates; only documentation and package metadata change.

The inherited candidate evidence includes original-game comparisons, complete
SDK/reference verification and eighteen deliberate equipment/shared-save/paired-
save fault detections. The fresh preview runs do not replace that evidence or
claim every SDK family has an engine binding.

The two-actor equipment course observed 30,720,846 shared-account and 25,507,426
combat tracked native bytes at peak. Owners released all tracked allocations.
These are desktop observations, not total Unity memory or physical-device budgets.
The shared owner's default cap is 48 MiB and startup collection has no frame-time
guarantee. Reuse owners and perform inventory work at UI/action boundaries.

Gameplay SHA-256:
`2a22210ffa397e7511271672b3d5cd39675895b3c6cc03aecca571fd0881fa66`

Storage SHA-256:
`666a3c5a91130a8a6aa03127b8fdef0c85b95ef6d0336952692812fae2501f9a`
