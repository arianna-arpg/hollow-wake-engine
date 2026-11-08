# Grouped saves

The optional native storage extension commits several existing records in one
SQLite transaction. It is intended for an account and character inventory that
must become durable together. The database stays at application ID 0x48575331
and schema version 1; existing records and two-document saves need no migration.
The extension does not automatically connect gameplay owners or assign slots.

## Ownership and limits

A group contains 1–8 distinct slots, each in 0–65535. Each record carries its
observed revision and the same two opaque UTF-8 documents as the existing store.
Each document is limited to 512 KiB; a group is limited to 4 MiB of document
bytes. Empty slots have revision zero. Every expected revision must match before
the transaction can succeed. A stale last record rolls back earlier updates
and inserts. Revision increments remain exactly one per committed record.

One group uses the existing sleeping worker, request slot and completion.
It does not create another queue or thread. Input bytes are copied before an
asynchronous submission returns. Cancellation, commit admission, close, ticket
consumption and stale-write recovery retain their established meanings.
The worker never receives engine objects or invokes host callbacks.

Group reads use a single SELECT and therefore one SQLite read snapshot.
Missing records keep their requested positions and return revision zero.
Explicit ordinals place output records without sorting their document payloads
inside SQLite. The C interface publishes no partial output on an invalid stored
document. Borrowed single/group views all expire on any read, close or destruction,
including a failed read. C# copies the complete result while holding its owner lock.

The C extension is negotiated through hwe_save_group_info_v1. The base ABI stays
at version 1; existing exported functions and structures keep their layouts.
The C# SupportsGroupedSaves property checks extension version, structure sizes
and limits. With an older library, established operations remain available and
group operations report AbiMismatch. The C# group encoding buffer is allocated
on first use, grows only as needed, is reused and is bounded at 4 MiB. These are
payload/retention bounds, not a claim that total process memory is 4 MiB.

## Host transaction boundary

The host reserves distinct records for account, workshop and any shared stash.
It reads those records as one group, validates complete gameplay documents and
constructs private candidate states. After applying a proposed action to those
candidates, it submits every affected record with the revisions it read.
Only a successful completion permits publication of all candidates. A refused
or cancelled transaction discards them. A stale revision requires a reload and
fresh action evaluation; retrying the same stale proposal is not safe.

The host also owns authorization, cross-owner isolation and failure handling if
publication itself fails after a durable commit. This native extension does not
yet supply a Unity account/workshop coordinator. Existing engine packages retain
their own qualified library and behavior.

## Evidence and reproduction

The pre-extension source is captured from commit
67fa07a50a58380af22fc52e354f0091a9009b55 in baseline/grouped-saves.
Its manifest records exact source hashes. The native verifier rebuilds the
original C consumer against the new library and the original library against
the new C# binding, so compatibility is tested in both directions.
The [Windows checkpoint](../evidence/grouped-saves/README.md) binds the final
library, consumers and retained regression evidence to their source hashes.

The grouped course exercises late stale updates/inserts, exact and excessive
byte/record limits, duplicate slots, UTF-8 and embedded NUL documents, owned
asynchronous input, pending completion, cancellation, coherent reads during
concurrent commits and failed COMMIT rollback. Separate processes abruptly
exit after staging, committing or refusing a late stale write, then reopen
both WAL and rollback databases and check exact records. These process-exit
checks do not simulate a device losing power during a physical write.

The existing eight deliberate faults remain required. Additional faults commit
a partial group, reverse returned record order, weaken the aggregate byte
limit or mistake a damaged record for an empty slot; each must be rejected at
its intended assertion. Linux qualification
also runs the core and C consumers with address/undefined-behavior sanitizers
and leak detection. A Windows result alone does not establish Linux, Unity,
Steam Deck, ARM or mobile support.

Build and verify with the existing portable save builder and verifier:

    node scripts/build-portable-save.mjs --tools TOOLS_JSON --sqlite SQLITE_ZIP --output NEW_DELIVERY
    node scripts/test-portable-save.mjs --sqlite SQLITE_ZIP --python PYTHON --output NEW_REPORT --library NEW_DELIVERY/build-receipt.json --mutations --managed
    node scripts/test-save-worker.mjs NEW_WORKER_REPORT --mutations

## Why this database boundary

SQLite's transaction and isolation rules provide all-or-none writes and a
consistent read snapshot. The SDK adds bounded payloads, optimistic revision
checks and host ownership around that mechanism. The original authored gameplay
content remains separately compiled, loaded and indexed; runtime combat does not
issue database queries. This is a specific persistence decision, not a claim
about World of Warcraft's internal implementation or a reason to move every
gameplay operation into SQL.

Primary references: [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
and [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html).
