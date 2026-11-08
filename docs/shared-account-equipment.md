# Shared account equipment publication

The [gameplay 0.6 / storage 0.5 preview](unity-shared-equipment.md) connects the
shared account's inventories to selected live combat actors. Its versioned
archives preserve the complete Runtime payloads of the development candidates
(`0.6.0-candidate.0` and `0.5.0-candidate.0`). The
[preview qualification](../evidence/unity-shared-equipment/README.md) adds fresh
installation, imported sample and compatibility results to the
[retained-feature and archive courses](../evidence/shared-account-equipment/retained/README.md).

The [recorded development checkpoint](../evidence/shared-account-equipment/README.md)
contains the completed local SDK, original, Unity, failure and compatibility
courses. Broader engine exposure and physical-device acceptance remain separate.

## Read boundary

The optional account/workshops entry adds two read-only commands:

| Command | View |
| --- | --- |
| `{op:'workshop-equipment-text', profile}` | The committed worn-item map |
| `{op:'prepared-workshop-equipment-text', profile, token}` | The map in the active proposal, including unchanged attached inventories |

Each returns `{ok:true,text}` with exact JSON text. Reads serialize only equipped
items from the owned record. They do not execute gameplay, load another kernel,
copy the bag/account, change random continuation or publish the proposal.
Handles remain uint32; the candidate token must be the active positive safe
integer. Closed inventories, stale/zero tokens and unexpected fields refuse.
Token zero represents an unchanged proposal with no candidate to read.

Unity exposes `Inventory.EquipmentJson()` and
`PreparedChange.EquipmentJson(inventory)`. Both validate lifetime; the latter
also refuses an inventory from another owner before any native request.
No Unity field serializer reconstructs the item body or its numeric IDs.

## Optional actor bindings

With the new gameplay package installed, the storage bridge defines
`HWE_STORAGE_SHARED_EQUIPMENT` and exposes `SharedCombatBinding`. The additional
constructor takes an explicit inventory-slot array followed by bindings:

```csharp
var saved = new DurableSharedAccount(path, accountSlot, inventorySlots,
    new SharedCombatBinding(0, firstActor),
    new SharedCombatBinding(1, secondActor));
```

Indices refer to the configured inventories. An inventory and an actor may each
appear once. All bindings must be valid before lifetime ownership transfers;
invalid lists leave caller-owned actors alive. Once accepted, the coordinator
owns the bound actors and closes them on disposal or unrecoverable publication
failure. It does **not** own their shared `CombatWorld` or unbound actors.
Dispose the coordinator before the world. Call on the main thread and publish
at a simulation boundary so no other observer sees an intermediate actor.

Creation and reopening validate the complete saved group before exposing it.
On Submit, only changed inventories are read; only changed worn maps compile a
private actor projection. Account-only changes issue zero combat requests.
The current combat capability admits common unsocketed Lapis/Coral rings and
Opal amulets. Unsupported gear refuses before storage submission and discards
every prepared projection, including earlier valid actors.

Actors may continue casting, advancing clocks, taking timed damage and consuming
randomness while a save is pending. After acknowledged storage success, the
coordinator publishes the prepared account and equipment, then its immutable
Current view. Equipment publication preserves the actor's **current** cast,
clock, effects, resources and random continuation; it does not restore a snapshot
captured before the save. Derived resource caps follow the equipment rules.

Busy, stale and otherwise refused writes discard every projection and preserve
the prior view. Every configured save revision is still guarded, including
unchanged dependencies. Reopen the entire group after stale revision. A failure
after storage commits closes the coordinator and all bound actors, even if an
earlier actor already published. The acknowledged save remains authoritative;
recovery creates fresh actors and restores the complete group.

## Verification and limits

The existing portable, embedded-text, installed-package and browser contracts
cover committed/candidate reads, abort, stale tokens, unchanged dependencies,
ownership and malformed input. Three new deliberately broken reads must fail.
The installed consumer now has 33 contracts and 26 fault controls, with an
unchanged 180 KiB bundle limit. The optional unminified account module grows
from 20,768 to 21,829 bytes; its explicit allowance is 22 KiB.

`qualification/equipment-reference.mjs` compares all 12 frozen original
equipment courses through both the portable shared owner and compiled text
transport: 74 observed steps and 17 equipment publications per route. It checks
attributes, stats, skill previews/costs, resources, casts and complete worn/bag
states. The original fixture is read by its accepted hash, never regenerated.

`qualification/equipment-package.py` under `adapters/unity-shared-account` builds
the two candidates from exact public parent hashes. It preserves native DLLs,
asset identifiers, notices and other capabilities. `verify-equipment.py` installs
the actual archives in Unity 2021.3.6f1 and checks two live actors in the editor
and relocated Windows x64 Mono player. An independent SQLite read checks every
saved group, and Python compares complete actor snapshots across publication,
allowing only the character configuration to change. Play entry/exit without
domain reload and script reload exercise pending-save cleanup.

`equipment-faults.py` runs an unchanged complete control, broken coordinator
archives through the editor, and an injected failure between the two actor
publications. Raw reports remain local until evidence review removes licensing
and machine metadata. Script availability is not a passing result.

`equipment-compatibility.py` exercises the candidate storage package alone and
with the exact public gameplay 0.5 archive. The latter's source is checked at
its original commit, so a later local SDK edit cannot substitute for the
published binary. The old gameplay package omits the new equipment feature
define while retaining ordinary shared-account saving.

The first complete two-actor course peaked at 30,720,846 shared-account and
25,507,426 combat tracked native bytes; each host released every tracked byte
and block on disposal. These are desktop observations, not total Unity memory,
performance improvements or physical Steam Deck/mobile acceptance. The default
shared heap remains 48 MiB. Broad gear effects, cross-engine bindings, ARM,
IL2CPP and target-device frame/allocation budgets remain open.

## Retained package checks

`qualification/verify-equipment-retained.py` runs the existing Unity courses
against the unchanged equipment candidate. Supply `--editor`, `--gameplay`,
`--storage` and a fresh `--output` JSON path. Run these modes sequentially:

| Mode | Existing behavior exercised |
| --- | --- |
| `gameplay` | 60 combat requests, 2,334 pouch requests, 56 workshop requests, imported samples, content corruption and native content-load controls |
| `shared` | 84 typed shared-account operations, the documented example and retired/foreign handles |
| `equipment` | The older separate workshop/equipment save coordinator and live combat continuation |
| `account-storage` | The older paired account/workshop coordinator, imported sample, five lifecycle paths and four deliberate faults |

The progression course remains `scripts/verify-unity-progression.py`, taking
`--editor`, `--gameplay` and `--output`. Each course uses the actual UPM archive
in the editor and a relocated Windows x64 Mono player. A passing result is
specific to the recorded archive hashes and this host configuration.

The retained runner verifies every archive member and all declared source
hashes. Older tools need a resource-hash index and frozen inputs beside the
archive, so it derives a supplemental receipt in a private temporary directory.
The report records the original and supplemental receipt hashes; it never
edits the candidate receipt or archive. The pouch reference and prepared
expectations come from accepted repository evidence, not regenerated output.
Generated projects, caches and supplementary metadata are removed on failure
as well as success, including Windows paths beyond the legacy path limit.

`qualification/verify-equipment-archives.py` takes `--gameplay-parent`,
`--storage-parent`, the candidate `--gameplay` and `--storage` directories and
a fresh `--output`. It rebuilds both archives byte for byte, checks the exact
allowed changes independently, and refuses altered parent archives, source or
member hashes, contradictory resource metadata and existing output folders.
These archive controls do not replace actual-engine qualification.
