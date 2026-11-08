# Durable Unity account and inventory

The storage 0.3 preview adds an optional coordinator for Gameplay 0.4 or later.
It composes the already-qualified account progression and workshop sessions with
the bounded native grouped-save service. The original game and authored content
are not changed. The baseline capsule pins the preceding implementation at
b599864c30dde72f794a972d19951b593d0e3416.

## Contract

The host reserves two distinct slots and chooses a local database path. An empty
pair may be initialized once. A partly populated pair is rejected without
writing anything. Complete progression and workshop saves retain arbitrary JSON,
safe integer IDs and each owner's random continuation. The two auxiliary
documents belong to the host and are never parsed or reconstructed by the bridge.

Each command proposal restores private profiles from the committed saves.
Invalid commands and false progression outcomes discard both candidates.
An unchanged proposal skips persistence. Otherwise one native transaction
compares both observed revisions and writes both records; even a conflict at the
second record rolls back the first. Only observed successful completion replaces
the single immutable Current object. Pending results expose no candidate replies.

Workshop ok=true means processed, not necessarily successful gameplay. Existing
no-op and event semantics, including pre-payment random draws, remain intact.
The coordinator is not a shop authorization policy. It does not merge the
progression account's features/ledger with the workshop account's expertise and
observations. Consolidating those overlapping domain authorities requires its
own extraction boundary and original-game comparisons.

Reload reads one coherent database snapshot and validates both profiles before
promotion. Invalid secondary data leaves the visible pair intact. Revisions may
differ after a legitimate independent writer, so the bridge retains both rather
than assuming they are one counter. Slot assignment must be exclusive or use
the shared optimistic concurrency contract.

The optional actor overload owns the actor and privately prepares supported
equipment. Successful publication preserves ongoing cast state. Failure after
disk commit closes both gameplay owners and the actor, then reports that the
saved pair must be reopened. It never reports a committed transaction as rollback.
All coordinator calls are on Unity's main thread; the sleeping save worker runs
only native storage operations.

## Acceptance

The independent Node oracle uses the qualified SDK and content from the exact
gameplay archive. It produces complete account/workshop states, including
random continuation and opaque relic payloads. The Unity course imports actual
UPM archives, runs in the installed editor and a relocated Mono player, then
compares complete saves and independently inspects SQLite records.

Additional courses cover actual Play entry/exit with domain reload disabled,
script reload, the Package Manager sample and deliberate early publication,
false-result acceptance, failed-write publication and post-commit leak defects.
The sample's partial view is read-only and its one-time credits are sample
authorization. A repeated candidate-retirement course checks continued bounded
operation, not timing.

Run the verifier with the exact gameplay/storage delivery directories and
--mutations. Receipts retain input hashes and command outcomes; failed attempts
are not rewritten into accepted evidence. Owned editor projects, package caches,
builds and temporary directories are removed even on failure.

## Performance and remaining scope

No database operation enters the combat tick. One write or unread completion is
admitted at a time. Each gameplay VM has its existing 32 MiB native allocation
limit; the coordinator holds at most one committed and one private candidate
profile per VM. The native group encoding buffer is lazy and capped at 4 MiB.
These are component bounds, not whole-game or managed-memory measurements.

The initial target is Unity 2021.3.6f1, Windows x64 Mono. Existing Linux native
storage evidence is not Linux Unity qualification. IL2CPP, ARM/mobile packages,
Steam Deck budgets, unified domain authority and broader equipment projections
remain separate work. The delivered record transaction alone does not establish
a complete cross-engine SDK or an optimized device budget.

The next domain path is concrete: salvaging teaches expertise and increments
the shared crafts-unlocked ledger; progression must observe that same ledger,
and purchasing an extra crafting slot must immediately affect workshop
eligibility. Today these are separate projections. Start from the original
account object, salvage callbacks and unlock application order, then capture
that complete sequence before changing ownership. Give shared fields one
authority inside the SDK, preserve opaque saves and random continuation, and
reuse this transaction boundary. Comparing those full source outcomes is the
acceptance test; merely copying fields between partial C# models is insufficient.
