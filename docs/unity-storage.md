# Unity storage integration

The development [account/inventory coordinator](unity-account-storage.md)
composes two records through the grouped native transaction. Its Unity acceptance
is recorded separately from the single-workshop releases below.

The first [public storage preview](https://github.com/arianna-arpg/hollow-wake-engine/releases/tag/unity-storage-v0.1.0-preview.1)
is available as a Unity Package Manager tarball. Its qualified archive hash is
`10a052e8ccffc50e3f92ab9757610564edcaf1942c4bae514c76688c7d9c2d95`.
See the [publication receipt](../evidence/unity-storage/publication.json) for
the source commit, hosted checks and exact assets.

The optional `com.hollowwake.storage` package adapts the accepted portable
save library to Unity. It has no dependency on the gameplay package. The
first delivery targets the installed Unity 2021.3 Windows x64 editor and
Mono player; the separately verified Linux native library does not establish
Linux Unity, IL2CPP, ARM or mobile support.

The raw implementation and C# binding remain in `native/save`. The Unity
adapter owns native-handle cleanup at play exit, assembly reload and application
exit. It owns no gameplay documents, station permissions, save migrations or
global character state. The game chooses its storage path and validates the
two opaque documents. Normal departure consumes a pending result before closing;
forced lifecycle cleanup may cancel a write before its commit boundary or join
an already admitted commit.

The workshop integration must prepare a candidate profile separately from the
visible committed profile. Only successful durable completion publishes the
candidate. A refusal, stale writer, cancellation or failed commit keeps the
committed view and permits a reload/retry. Inventory, stash, random state and
item-ID continuation cross the same transaction boundary. JSON strings must
remain exact, including arbitrary map keys, fractions and large safe-integer IDs.

Acceptance gates:

- Install the actual tarball in an empty Unity project. Verify native importer
  platform restrictions and the absence of a gameplay-package dependency.
- Exercise the real native binding in the editor and a relocated Mono player.
  Restart the player and inspect persisted records independently with SQLite.
- Verify paired commits, stale writers, cancelled transactions, exact UTF-8
  documents, background completion and orderly disposal.
- Exit real Play mode twice with domain reload disabled; retained references
  must report closed stores and uncommitted transactions must be rolled back.
  Entering Play with an editor-owned workshop also retires both resources.
- Interrupt a staged transaction in a separate process, then verify the last
  committed state and database integrity. This is process recovery evidence,
  not a physical power-loss claim.
- Connect the workshop and verify exact inventory/RNG continuation, committed-view
  publication and failure recovery through real editor and player runs.

The published gameplay 0.2 preview remains unchanged. Install the optional
storage preview alongside it to add durable workshop checkpoints.

The storage package's optional gameplay assembly uses Unity's documented
[package-version defines and assembly constraints](https://docs.unity3d.com/cn/2021.3/Manual/ScriptCompilationAssemblyDefinitionFiles.html).
It becomes available when the gameplay package is installed, without making
gameplay a required dependency for plain storage consumers. Both installation
modes require actual editor verification. The lifecycle course requests a real
script reload and observes cleanup before Unity's
[assembly-reload event](https://docs.unity3d.com/2021.3/Documentation/ScriptReference/AssemblyReloadEvents-beforeAssemblyReload.html)
finishes.

## Durable workshop sample

The optional gameplay assembly owns a committed profile and a private candidate
inside one workshop VM. It exposes no candidate snapshot or command reply while
a save is pending. Success replaces the committed view; failure discards the
candidate, preserving random state and the next item ID for a later retry.
Unchanged commands avoid a database write. Revision conflicts require reloading
the authoritative saved record.

The Package Manager sample demonstrates forge, inlay and reopen using this
bridge. The verification course imports that sample from the real tarball,
builds and relocates it, drives its component methods, checks its rendered UI,
then launches another player to verify exact continuation. This is component
integration evidence; it is not a mouse/controller accessibility test.

SQLite remains an optional local persistence service. Content and combat rules
run in memory; a storage transaction is not inserted into every combat frame.
The worker accepts only one request or unconsumed result, bounding its queue.
The workshop's 32 MiB native VM cap does not include Unity's process, managed
allocations or SQLite. Physical-device CPU, memory and battery measurements are
still required before making Steam Deck or older-mobile performance claims.
