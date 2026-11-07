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
