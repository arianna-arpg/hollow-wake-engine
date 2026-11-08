# Live equipment adapter preview

The first connection is deliberately bounded: common, unsocketed Lapis Rings,
Coral Rings and Opal Amulets, with the existing Magician/Ruin combat capability.
The full workshop can own other items, but this connection refuses to equip an
item whose combat behavior it cannot reproduce. The [accepted local checkpoint](../evidence/live-equipment-adapter/README.md)
qualifies the named editor/player path.
[Gameplay 0.3 with storage 0.2 is public](https://github.com/arianna-arpg/hollow-wake-engine/releases/tag/unity-live-equipment-v0.3.0-preview.1).
All ten hosted workflows passed at release commit `03eb2d504a9fe410b97d3959a76d4a494c5d3541`;
the publication receipt records all nine asset hashes. Physical-device
qualification remains separate.

## Ownership and publication

`CraftingSession.equipmentText(profile)` serializes only the complete worn-item
map. It does not copy the inventory, account, wallets or random continuation.
`CraftingWorkshop.Profile.EquipmentJson()` exposes that read to Unity.

`CombatWorld.Actor.PrepareEquipment(json)` compiles and validates a private
character projection. There is one outstanding preparation per actor. The actor
can advance, finish a cast, pay for another cast, take damage and consume combat
randomness while preparation is pending. Competing structural equipment batches
are refused before any batch command runs. Disposing the preparation discards it;
disposing its actor or world invalidates it.

`PreparedEquipment.Publish()` replaces only the equipment-derived character and
clamps **current** life and mana to the resulting caps. It copies current
conditions and gauges. It does not restore earlier casts, clocks, resources,
targets, effects or randomness. Unknown fields, identities, slots or unsupported
item effects fail explicitly. Original UI cue randomness is not combat randomness;
see the [raw boundary](live-equipment-boundary.md).

The Unity storage preview adds
`new DurableWorkshop(absolutePath, slot, actor)`. This overload transfers actor
lifetime to the workshop. Dispose the workshop before disposing its combat world.
Use the actor only after `IsReady`, and call `Poll` at a main-thread simulation
boundary. The existing two-argument overload continues to work independently.

The bridge prepares changed gear before submitting the candidate save. It keeps
both committed views on a busy/stale/failed write. Only a successfully observed
commit publishes the prepared actor and candidate inventory. An unchanged worn
map avoids another character compilation. No database read or loadout rebuild is
added to combat ticks.

A disk commit followed by a live publication failure is a distinct failure: the
bridge closes itself and its actor, throws an error identifying the committed
save, and requires reopening that saved slot with a new actor. A further cleanup
exception remains attached to that committed-save error. It never pretends
that the disk commit rolled back. Actor configuration and combat snapshot saving
remain separate host responsibilities; reconnecting equipment is not a complete
combat-save migration.

Unity's package-version define exposes this overload with gameplay 0.3 preview
or later. Storage 0.2 retains the existing workshop bridge for gameplay 0.2 and
continues to support plain storage without gameplay installed. These installation
modes require separate checks before release.

## Evidence gates

The source tests compare all twelve frozen original-game courses, exact item
custody and derived combat values. Additional cases cover dynamic state, dead
actors, structural conflicts, token isolation and unsupported content. Deliberate
early publication, stale-resource restoration, cast reset, random rewind and
silent unsupported effects must each fail an intended assertion.

The native replay uses the unchanged shipping Windows library with a fresh rules
bundle and checks exact replies and zero live allocations after teardown.
The Unity course installs actual UPM archives, exercises pending, busy, stale and
post-commit failure paths, relocates a Mono player, checks reopen continuation,
and independently inspects SQLite and combat snapshots. Source/fixture hashes
and retained raw results identify which implementation each result tested.

The native combat and workshop limits remain 64 MiB and 32 MiB respectively.
They are limits, not optimization achievements or total-process budgets. Unity,
managed objects and SQLite consume additional memory. Steam Deck and older mobile
hardware still need measured device qualification; this candidate does not add
IL2CPP, ARM, mobile or Unreal support.
