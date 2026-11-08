# Hollow Wake Storage for Unity

Development preview for Unity 2021.3, Windows x64 Editor and Mono player.
Install the supplied tarball through **Window → Package Manager → + → Add package
from tarball**. This optional package does not require Hollow Wake Gameplay.

Create a store for the lifetime of the owning game service:

```csharp
using System.IO;
using HollowWake.Storage;
using UnityEngine;

using var owner = new UnitySaveStore();
var store = owner.Store;
var opened = store.Open(Path.Combine(Application.persistentDataPath, "profile.db"));
if (!opened.Succeeded) { /* Report or retry the storage refusal. */ }
```

Read the slot's committed revision. Prepare and validate the next gameplay state
separately, then submit its two complete UTF-8 documents with that revision:

```csharp
var current = store.Read(1);
if (current.Result.Succeeded)
{
    var submitted = store.Submit(1, current.Revision, candidateProfileJson, candidateStashJson);
    // Retain submitted.Value as the ticket when submission succeeds.
    // Poll that ticket on subsequent frames. Publish the candidate only when
    // completion succeeds; Pending means the transaction has not completed.
}
```

An empty slot has revision zero. Each document is limited to 512 KiB of UTF-8;
the database stores both documents and their next revision together. Keep full
snapshots as strings. The game owns JSON interpretation, validation, permissions
and stale-state reloads. A stale writer must reload before retrying its action.

One pending request or unconsumed result occupies the store. `CancelAsync`
can stop a request before commit is admitted; otherwise consume its actual
completion. During normal departure, consume the completion and dispose the
owner. Play exit, assembly reload and application exit also dispose live owners.
Forced cleanup may wait for an admitted disk operation and does not promise to
commit a request cancelled before admission. Handles do not survive Play mode.

The reusable `SlotStore` exposes synchronous stage/commit/cancel, asynchronous
submit/poll/cancel and checkpoint operations. It preserves exact document bytes
through the native boundary. Its C# implementation has no Unity dependency;
`UnitySaveStore` supplies Unity lifetime cleanup.

The package contains the pinned SQLite library and both license notices.
It does not provide cloud synchronization. Unity IL2CPP, other Unity platforms,
mobile packaging and physical-device performance require separate qualification.

When Hollow Wake Gameplay 0.2.0-preview.1 or later is also installed, an optional
assembly enables `DurableWorkshop`. It owns a private candidate profile while a
save is pending. `Snapshot`, `StashJson` and `Revision` continue to describe
the committed view. Successful `Poll()` publishes the candidate; a refusal
discards it. Pending replies expose no candidate command result.

`BeginCreate` initializes an empty slot and can apply initial grants before its
first commit. `Submit` executes one authorized SDK command; `Reload` validates
an existing saved profile before replacing the view. Loaded profiles use the
SDK's canonical snapshot representation; reading does not rewrite the database.
Commands that leave the canonical snapshot and stash unchanged do not issue a
disk write. Keep one owner per workshop service and consume pending completion
before normal departure.

Create and call these Unity adapters on the main thread. The save worker performs
only native storage work and does not call Unity or gameplay code.
Closing the bridge's storage owner also retires its gameplay state, including
entering Play with domain reload disabled.

For a working example, import **Durable Inventory** from the storage package's
Samples section after installing the gameplay package. Choose **Hollow Wake →
Create durable inventory sample**, press Play and open the workshop. Forge,
inlay, wait for the saved confirmation, then leave Play mode and reopen. The
sample keeps existing saves and grants its initial material only once.
Its read-only display model never replaces the complete saved snapshot.

## Account and inventory groups

With Gameplay 0.4.0-preview.1 or later, DurableAccountWorkshop owns an account
progression profile and a workshop profile in two distinct reserved slots.
BeginCreate initializes both empty records together; a partially populated
pair is refused. Submit runs up to one command per owner on private candidates.
Poll publishes one immutable Current view only after the entire group commits.
Read the fields from that one view when a screen needs a coherent pair.

Invalid commands (ok:false) or progression replies with result:false
discard both candidates. Workshop ok:true means processed, including its
original no-op, event and RNG behavior; it is not proof that an item was granted
or a purchase succeeded. This adapter does not implement a cross-system shop
transaction or merge the progression account's features/ledger with the
workshop's account/lore projection. The host owns those domain policies.

Both complete saves include their own random continuation. AccountExtraJson
and StashJson are opaque host-owned documents. Each record has its own revision;
both expected revisions must match before either write can commit. Reload reads
one database snapshot and validates both profiles before replacing either.
An unchanged proposal avoids disk writes. One pending operation prevents another
submit or reload. Failed storage completion retains the prior view.

The optional actor constructor transfers actor lifetime to this owner and
publishes supported equipment with the committed inventory. Dispose the owner
before its combat world. If publication fails after a durable commit, the owner
closes both gameplay VMs and the actor and throws an IOException: reopen the
saved pair rather than retrying the action as though it rolled back.

Import **Durable Account** and choose **Hollow Wake → Create durable account
sample** for separate memory-discovery and forging actions with one-time starting
credits. Its default save namespace is separate from the older inventory sample.
Both samples remain optional. Plain storage needs no gameplay installation, and
the older workshop bridge remains available with Gameplay 0.2 or later.

The native group API also supports 1–8 distinct slots, at most 4 MiB of combined
document bytes. The gameplay coordinator uses exactly two records and at most
two profiles in each VM. Candidate cloning and serialization happen on commands,
not on combat ticks; a pending poll does not clone gameplay. These bounds do not
establish CPU time or whole-process memory budgets on any physical device.
