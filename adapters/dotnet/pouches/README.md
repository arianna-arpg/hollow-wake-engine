# Hollow Wake memory pouches for .NET 8

Extract the archive and add a project reference to `HollowWake.Pouches.csproj`.
The project copies the native runtime, authored content and checksums into
the consuming application's output. The packaged target is Windows x64.
It runs without a Godot installation, a server or an online package restore.

~~~csharp
using HollowWake.Pouches;

using var pouches = new MemoryPouches();
var profile = new RecallProfile(currentState, Math.Max(zoneLevel, heroLevel),
                                spoilsSealed, previousRecallMetadata);
var panel = pouches.Inspect(profile, pouchUid);
var move = pouches.Recall(profile, pouchUid, selectedGroup, nextUid, selectedFacet);
if (move.GetProperty("ok").GetBoolean())
{
    // Commit items, nextUid, ledger and memory from move in a single save
    // transaction against the displayed revision. Then publish move.result.
}
~~~

`currentState` is a `System.Text.Json.JsonElement` with the SDK's admitted
`items`, `board` and `account` fields. The board has width `w`, height `h`
and optional mask rows. The account provides `ledger`, `features` and the
boolean `progression`. A null initial memory starts a fresh hero with the
authored starter unlocks. To import an existing hero, use
`pouches.CreateMemory(unlockedSkills, unlockedSupports, secondary, seatLedger)`.
Pass back the returned `memory` for later actions.
The adapter uses the local-player lesson policy. A sealed profile can inspect
groups and receives the original refusal on an attempted recall.

The `Sample` project runs a full preformed-pouch recall and prints the gem.
Run `dotnet run --project Sample` from the extracted directory. Applications
maintain one `MemoryPouches` instance for the duration of an open workshop
and dispose it when finished. The release's source observations and managed
tests cover Windows x64 .NET 8. Unity editor, IL2CPP, Linux .NET and ARM
acceptance are separate.
