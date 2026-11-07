# Hollow Wake Gameplay for Unity

Install the supplied `.tgz` with **Window → Package Manager → + → Add package
from tarball**. This preview targets Unity 2021.3, Windows x64 Editor and Windows
x64 Standalone with Mono. The package contains its authored rules and native
runtime. It loads combat, pouch and workshop resources separately when requested.

Import **Casting and Burning** from the package's **Samples** section.
Open the imported **Ruin Encounter** scene, enter Play mode and press
**Cast Ruin** in the Game view. To use your own scene, attach
`CastingAndBurning` to an active GameObject. The component's inspector also shows the
cast outcome, hit damage and target life. The sample's Magician uses an
equipped Lapis Ring, Arcane Practice, Ruin, two supports and a skill-tree
selection. Change the sample build or assign another admitted build asset.
The sample authorizes a stationary hit and an explicit 10-DPS Burning effect.
In a game, authorize the hit from the actual projectile contact and provide
the effect strength from the game's effect policy.

The same scene includes an **Inventory workshop** panel. Open it, forge a
helmet, inlay Morren, keep a checkpoint, forge again, then restore the
checkpoint. The item, satchel, next item ID and random continuation return
together. The sample keeps checkpoints in memory; it does not save to disk.
Attach `InventoryWorkbench` to another GameObject to try the same panel.

~~~csharp
using var world = new HollowWake.Gameplay.CombatWorld();
using var actor = world.CreateActor(buildAsset.text);
var press = actor.Press();
var frame = actor.Advance(simulationSeconds);
string snapshot = actor.Save();
using var restored = world.RestoreActor(snapshot);
~~~

Keep the world and actors alive between frames. One world shares content
among up to eight independent actors. `Advance` advances one simulation
interval. Hosts own rendering, input, contacts and effect applications.
`ExecuteBatch` accepts an ordered JSON array of up to 64 SDK commands, including
equip, roll, forge, grid movement, passive allocation and refund. It returns the
full SDK response, including partial execution and refusal information.
For input-free catch-up, `actor.AdvanceSteps(stepSeconds, maximumSteps)`
advances up to 64 ordinary ticks with one managed call. It returns the number
consumed and stops when a cast completes or the target dies. A defeated
target retains the SDK's signed overkill value and consumes zero further
catch-up ticks. Resume only
after the host handles that event. Use individual `Advance` calls when world
input or physics contacts can intervene between ticks.
The selected combat character pack contains Magician and Ruin. The item
and passive policies have separate authored catalogs. Passive-policy spending
and the combat character's starting allocation are separately owned in this
session. This package version
uses the embedded session's version-one command and save contracts.

## Inventory and crafting

`CraftingWorkshop` opens the shared authored item, crafting and skill content
on demand. One instance supports two independent profiles and a 32 MiB tracked
native-heap limit. A profile owns its pack, overflow, equipment, wallet, crafting
lore, learned skills, socketed supports, vestiges, next item ID and random state.
It runs the same workshop policy as the Godot package. Its default item-ID
counter starts above every supplied item; pass a nonzero `nextUid` only when
the game owns a higher counter.

~~~csharp
using var workshop = new HollowWake.Gameplay.CraftingWorkshop();
using var profile = workshop.OpenProfile(1, 17, inventoryStateJson);
string reply = profile.Execute(commandJson); // SDK command without "profile".
string snapshot = profile.Save();
using var copy = workshop.RestoreProfile(2, snapshot);
~~~

`Execute` returns the complete reply, including refusals and ordered events.
Supported commands let you
forge or roll items, craft/reroll/socket/salvage, equip and remove gear, learn
and unlearn skills, fit or remove supports, and grant or inlay vestiges.
Station access, actor level, skill eligibility and support compatibility
come from the authoritative game. A preview does not authorize a later action.
`workshop.Query` accepts `inspect-item`, `compare-items`, `inspect-loadout`
and `view-inlay` requests and cannot mutate a profile.

Preserve `Save()` as a complete JSON document. Arbitrary map keys, fractional
values and IDs through 2^53−1 remain inside the SDK's JSON codec; Unity's
field serializer handles only the small typed envelope. A failed restore
leaves existing profiles intact. Dispose each profile, then its workshop,
when its owning UI or game service ends.

The game owns durable storage, account identity and publication after a
successful save. This package does not include the Godot SQLite extension.
Workshop equipment and learned skills are also separate from `CombatWorld`'s
selected combat build; the game must explicitly synchronize that build.
All workshop commands are available through `GameplayHost.OpenWorkshop()`
when a host prefers to manage the versioned JSON protocol itself.

For pouch inspection and recall, create a `MemoryPouches` service. Pass the
same revision of inventory state to `Inspect` and `Recall`. A successful move
contains a typed reveal and the exact `itemsJson`, `ledgerJson`, `memoryJson`
and `nextUid` to commit. Dispose the service when the workshop closes.
`GameplayHost.OpenMemoryPouches().Execute` also accepts ordinary SDK JSON.
A fresh local-player inspection uses this shape.

~~~json
{"op":"view","uid":1,"level":10,"memory":null,"sealed":false,
 "state":{"board":{"w":1,"h":1},"items":[{"uid":1,"baseId":"preformed_memory","x":0,"y":0,
 "mem":[{"d":"crypt_lich","s":4294967295}]}],"account":{"ledger":{},"features":[],"progression":true}}}
~~~

The reply contains selectable `view.groups` and `facets`. To recall, send
the same context with `op` set to `recall`, the selected `group` and `facet`,
and a fresh `nextUid`. A successful reply proposes `items`, `nextUid`,
`ledger`, `memory` and the reveal in `result`. Commit the first four together
against the displayed inventory revision before publishing the reveal. Preserve
arbitrary map keys, double precision and integer IDs through 2^53−1 in the
host's save format. The full response and combat snapshot are ordinary JSON
strings. Unity's field-based JsonUtility is suitable for the supplied typed
replies. A game's inventory serializer must also preserve its dictionary fields.

Open hosts on Unity's main thread. Dispose them when their owning scene or
service ends. The package releases remaining hosts on assembly reload,
play-mode exit and application quit. The native library and content remain
offline. The Windows plugin importer targets x64 specifically. IL2CPP,
Linux players, mobile and physical-device measurements require separate
verification.

Unity documents the native library loading and samples conventions used by
the package. [Native plug-ins](https://docs.unity3d.com/2021.3/Documentation/Manual/NativePlugins.html)
and [package samples](https://docs.unity3d.com/2021.3/Documentation/Manual/cus-samples.html).
