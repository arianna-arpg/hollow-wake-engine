# Install the Unity shared-account preview

The [shared-account release](https://github.com/arianna-arpg/hollow-wake-engine/releases/tag/unity-shared-account-v0.5.0-preview.1)
contains two optional packages:

| Package | Purpose |
| --- | --- |
| `com.hollowwake.gameplay-0.5.0-preview.1.tgz` | Existing combat, pouches, crafting, progression and equipment APIs, plus one account authority across several inventories |
| `com.hollowwake.storage-0.4.0-preview.1.tgz` | Existing SQLite storage APIs, plus atomic saving and publication of that shared account group |

Install the gameplay tarball through **Window → Package Manager → + → Add
package from tarball**. Add storage when the game needs local durable saves.
The accepted target is **Unity 2021.3.6f1, Windows x64 Editor and Windows x64
Standalone with Mono**. Storage can also be installed alone.

Import **Casting and Burning** and open **Ruin Encounter** for the existing
combat and inventory sample. The new shared-account API has a tested example
in the [gameplay package guide](../adapters/unity-shared-account/PackageREADME.md).
The **Durable Account** storage sample still demonstrates the earlier paired
account API; installing the new package does not migrate that sample or saves.

## One authority, one saved group

`SharedAccountWorkshop` owns account progression, crafting expertise and ledger
counters once. Each attached character inventory stores its own items and random
continuation and references that account. Preparation stages a batch privately;
commit publishes it and abort discards it. Compiled rules and unchanged records
are shared within the owner instead of loading another VM for the proposal.

`DurableSharedAccount` composes this with SQLite. Reserve one account slot and
1–7 inventory slots. A save checks the revisions of every configured record,
including unchanged dependencies. The coordinator publishes its immutable view
and replies after successful acknowledgement. Rejected gameplay policy, a busy
writer or a stale revision cannot publish a partial new view.

The game supplies authorized earnings and actions, decides whether provisional
gameplay results are acceptable, and presents events only after publication.
After a stale save, reopen the complete group before evaluating the action again.
After a committed save whose in-memory publication fails, the coordinator closes;
reopening restores the complete saved group. Cancellation can be too late, so
always consume the terminal result.

See the [storage package guide](../adapters/unity-shared-account/StoragePackageREADME.md)
and [transaction contract](prepared-account-changes.md). Fixed membership,
auxiliary-document preservation and legacy migration limits are explicit there.
The shared coordinator does not yet publish equipment changes into a combat owner.

## Qualification and budgets

[Recorded evidence and reproduction](../evidence/unity-shared-account/README.md)
cover actual installation, editor and relocated player execution, documented
usage, existing gameplay regression, storage alone, save failure controls,
Play Mode transitions and script reload. Both archives rebuild byte-for-byte
from their pinned parents. Existing samples, asset identifiers, content and
native binaries are preserved.

The shared course peaks at 30,719,337 tracked native bytes and releases all
tracked allocations on disposal. Its default heap limit is 48 MiB; the native
course also passes at 32 MiB. These are bounded desktop observations, not total
Unity memory or a guarantee for every save. Startup collection is explicit and
has no frame-time bound. Inventory transactions are not per-frame combat work.

Physical Steam Deck and older mobile tests, Unity Linux, ARM and IL2CPP remain
unqualified. This checkpoint qualifies the selected packaged capabilities;
it does not complete every SDK extraction or engine integration.

Gameplay SHA-256:
`a34b721bc3cc4649e28a33fe1821d30b508884f0d3b43f659008a2a1305df44c`

Storage SHA-256:
`6d22281f2ba07e7631270e9af19bf11d5e512be54254bbc8bb230b574714428b`
