# Shared account equipment publication

This **unpublished development candidate** connects the shared account's
inventories to selected live combat actors. The public installation checkpoint
remains [gameplay 0.5 / storage 0.4](unity-shared-account.md). Candidate archives
are gameplay `0.6.0-candidate.0` and storage `0.5.0-candidate.0`; broader package
regression, compatibility and public release evidence remain separate gates.

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
