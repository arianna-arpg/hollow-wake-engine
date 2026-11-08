# Shared account Unity integration

This integration adds `AccountWorkshopSession` to the existing
Unity gameplay package. It supplies one account authority across several
inventories, lossless save text, typed lifetime handles and prepared changes.
The [published gameplay 0.5 / storage 0.4 preview](../../docs/unity-shared-account.md)
is the qualified installation checkpoint. The optional live equipment work in
this checkout is a separate, unpublished [development candidate](../../docs/shared-account-equipment.md).

```csharp
using (var owner = SharedAccountWorkshop.Open())
{
    // fieldsJson contains state, craftLore and extra; inventoryJson excludes
    // duplicated account fields. The game supplies authorized starting data.
    using (var account = owner.OpenAccount(1, accountKey, accountSeed, fieldsJson))
    using (var inventory = account.OpenInventory(1, itemSeed, inventoryJson))
    using (var change = owner.Prepare(inventory.Command(commandJson)))
    {
        // Inspect change.RepliesJson and policy before saving. Save(i) returns
        // each changed record; Writes identifies its kind and handle.
        // Persist the entire guarded dependency group with revision checks.
        // Call change.Commit() only after storage acknowledges success.
        // Disposing an uncommitted change aborts it.
    }
}
```

Ordinary account and inventory `Execute` calls return the complete outer reply.
`Save` returns complete JSON plus gameplay versions. These versions are separate
from storage revisions. Retired handles and previously constructed commands
cannot reach replacement objects using the same numeric handle. Disposing the
owner invalidates every handle and releases its native allocations.

`Open()` checks the bundled rules/content hashes. The constructor also accepts
trusted custom compiled rules and matching content bytes. The default cap is
48 MiB of tracked native heap, with one explicit collection after loading.
Collection has no frame-time bound and is not a per-frame operation. A 32 MiB
configuration is exercised by the qualification course; this does not promise
that every admissible save, Unity process or physical device fits that budget.

The [prepared-change contract](../../docs/prepared-account-changes.md) explains
provisional results, whole-group revision checks and recovery. This interface
does not automatically connect a scene or migrate competing legacy account
projections. The separate storage coordinator below
composes it with the existing SQLite extension.

## Durable aggregate

`Storage/DurableSharedAccount.cs` adds an optional coordinator to the storage
package. Reserve distinct slots for one account and 1–7 participating inventories
when constructing it. It reads the complete group coherently and rejects partial
initialization. `BeginCreate` publishes nothing until the initial save succeeds.

`Submit` accepts an ordered array of account/inventory actions and an explicit
gameplay policy that inspects the provisional replies. Account actions use index
`-1`; inventory indices follow the configured slot order. A false policy result
or exception aborts the proposal. Policy callbacks cannot submit another batch
while evaluation is in progress. Nested purchase refusal must be considered by
the policy; transport success alone is insufficient.

Every write checks all configured storage revisions, including unchanged
inventories and the account. `Poll` publishes one immutable `Current` snapshot
and returns its replies only after acknowledgement. Cancellation can arrive too
late; always consume its final result. A stale revision leaves the previous
view intact: dispose and reopen the owner to read the new complete group, then
evaluate the action again. Post-commit publication failure closes gameplay and
the storage worker so recovery must reopen the acknowledged records.

The first coordinator keeps a fixed group and preserves each auxiliary document.
Changing membership, editing those auxiliary documents and legacy migration
require their own explicit transaction boundaries. The development equipment
overload has its own capability, ownership and publication contract.
It does not invent those policies from account keys or file paths.

## Reproduction

The `qualification/package.py` builder derives a candidate from the exact
released 0.4.1 archive and a source-bound native replay. It preserves the native
DLL, old content, existing asset identities and notices; it replaces the host
binding additively and adds the shared-account resources and binding.

`qualification/verify.py` installs that actual tarball into an empty Unity
2021.3.6f1 project, checks 84 transaction-course operations and lifetime
boundaries, and builds and relocates a Windows x64 Mono player. The same full
replies are checked outside the editor. Temporary projects and caches are
removed on success or failure. Logs remain local until publication review
removes machine and licensing metadata.

This integration has not qualified Unity Linux, IL2CPP, ARM, physical Steam Deck
or mobile hardware. The existing Godot and Unreal integration paths are
separate packages and do not gain this new capability automatically.
