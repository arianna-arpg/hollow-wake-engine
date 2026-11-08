# Hollow Wake Storage for Unity

Install this optional tarball through **Window → Package Manager → + → Add
package from tarball**. It supplies the existing SQLite storage extension for
Unity 2021.3 Windows x64 Editor and Standalone with Mono. The package has no
mandatory gameplay dependency; its base storage API remains usable alone.

With Hollow Wake Gameplay 0.5 installed, this preview also enables
`HollowWake.Storage.DurableSharedAccount`. It coordinates one canonical account
and 1–7 character inventories through one native gameplay owner and one save
worker. Reserve distinct database slots for the complete group.

```csharp
using HollowWake.Storage;

// Create on the main thread; retain until the owning scene/service ends.
var owner = new DurableSharedAccount(absoluteDatabasePath, 10, 20, 30);
// An existing complete group is restored automatically. If IsReady is false,
// call BeginCreate with authorized account fields and two inventory starts.
```

`Submit` takes an ordered array of `SharedAccountAction` plus an explicit
gameplay policy. Index `-1` addresses the account; indices `0` and `1` address
the inventories in the example above. The policy inspects complete provisional
replies and must consider nested gameplay refusals. Returning false or throwing
aborts the proposal. No presentation event should run from that policy callback.

Call `Poll` while `IsBusy` is true. Only an acknowledged successful commit
publishes a new immutable `Current` snapshot and its replies. Every transaction
checks and writes all configured records, including unchanged dependencies,
using their observed storage revisions. This prevents another session's save
from invalidating an admitted decision. Storage revisions are distinct from
gameplay versions and prepared tokens.

Cancellation may be too late; consume the final result. A stale revision leaves
the previous view intact: dispose and reopen the complete group, then evaluate
the action again. If storage commits but gameplay publication fails, the
coordinator closes both owners. Reopen to recover the acknowledged saved group.

Initial creation is private until the full group commits. Partial initialization
is refused. Group membership is fixed in this first coordinator; each record's
auxiliary document is preserved. Membership changes, auxiliary-document edits,
legacy-account reconciliation and combat-equipment publication need their own
explicit transaction boundaries.

The older `DurableWorkshop` and `DurableAccountWorkshop` APIs and their imported
samples remain available with their established semantics. **Durable Account**
demonstrates the earlier paired-owner coordinator; it does not automatically
switch to shared authority. Existing records are not silently migrated.

A group is limited to eight records and 4 MiB of document bytes; each document
is limited to 512 KiB. The worker receives bytes, never Unity objects or
callbacks. Dispose the coordinator on scene/service shutdown. See
`Documentation~/SharedAccount.md` and the SDK evidence for qualification scope.
Physical-device, ARM, IL2CPP and Unity Linux acceptance remain separate.
