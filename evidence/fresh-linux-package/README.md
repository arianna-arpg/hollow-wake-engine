# Fresh Linux package and recovery qualification

The canonical builders now pass from empty compiled output in the pinned
Steam Runtime 4 SDK. The progression builder previously loaded content
compilers before building their dependencies. The inventory verifier also
failed its final rename across container bind mounts after its tests passed.
The repairs defer compiler imports until after the build and stage deliveries
beside their requested destination. Windows and Linux staging tests cover
failure cleanup and preservation of existing destinations.

The fresh combined addon and its sealed crafting/progression exports pass
the SDK and runtime-only Platform courses. Crafting passes 190 assertions;
its original 56 replies remain byte-identical to the frozen reference and
Windows capture. The Platform runner now compares added capabilities with
the matching fresh Windows receipt instead of the older 180-assertion course.
Progression passes 91 assertions. The 113,812-byte crafting bundle peaks at
32,382,588 tracked bytes during the original course; all tracked allocations
are released when each host closes. This is not total process memory or a
device-speed measurement.

The freshly compiled save extension, packaged inventory, background saving,
station and inlay courses pass in the editor and extracted player. Delivered
workflow checks cover the original 56 commands, 95 equipment comparisons,
42 support cases, 15 recall cases and 21 profile views, plus existing fault
controls. Each editor/player station course passes 79 assertions.

## Process-death recovery

The actual shipping game runs in the offline Platform image with its packaged
libraries. For both WAL and DELETE journal modes, a separate writer is killed
before staging, after staging and after commit. The shipping game opens first
after each kill. A matched game reader and independent SQLite reader then
compare the entire original/transferred checkpoint, stash and revision.
Every uncommitted transfer rolls back; every committed transfer survives.

Journal sizes are observations, not acceptance conditions. The old runner
reproduces a missing rollback-journal failure against this same player.
The corrected run observes a zero-byte WAL after staging and a nonempty WAL
after commit. DELETE mode exposes a rollback journal after staging.

Two genuinely altered exported test packs are rejected: one cancels instead
of committing, and one commits before the after-stage barrier. Six separate
receipt mutations reject missing or inconsistent recovery evidence. The
production archive and unmodified test bundle remain hash-identical.

## Reproduce and limits

Use the staged commands in [Steam Runtime](../../docs/steam-runtime.md) and
[inventory workshop](../../docs/inventory-workshop.md). The full hosted
workflow includes fault-pack preparation, Platform replay and evidence retention.
That revised hosted workflow has not been run here.

This acceptance used Linux x64 inside Docker Desktop on Windows, Godot 4.7.2,
Node 24.9.0 and Steam Runtime 4.0.20261021.265997. Source mounts were read-only;
build outputs, dependencies and temporary homes were isolated. Existing matched
native base/library archives were reused after checking their binary receipts
and compiled-source hashes; the current save extension was built anew.
No original-game or production SDK runtime code changed.

Physical power loss, controller/graphics integration, physical Steam Deck and
older-mobile latency/power measurements, and full Unity/Unreal packages remain
open. The evidence proves these packaged Linux courses, not the complete SDK.

`acceptance.json` records exact sources, evidence and retained delivery hashes.
`logs.json.gz` contains the build diagnostics, container configurations, loader
traces and fault failures, including the prior failed attempts. Those failures
remain separate from accepted results. Historical Windows evidence is unchanged.
