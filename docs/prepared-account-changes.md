# Prepared account and inventory changes

`AccountWorkshopSession` can stage a bounded batch without publishing it. The
account, crafting expertise, ledger and inventories still have one authority.
The staged state shares immutable compiled rules and unchanged owned records;
it does not create a second VM or load another content catalogue.

This extends the [shared account owner](shared-account.md). Ordinary commands,
save schemas and the frozen original behavior stay unchanged. Storage remains
optional and host-owned. The new commands are suitable for inventory actions,
not per-frame simulation.

## Contract

| Command | Result |
| --- | --- |
| `{op:'prepare', commands:[…]}` | Admits 1–16 account/workshop commands; returns provisional `replies`, changed `writes` and a lifetime-local `token` |
| `{op:'prepared-save', token, kind, handle}` | Returns the complete candidate save for one changed account or workshop |
| `{op:'commit-prepared', token}` | Publishes all staged records together |
| `{op:'abort-prepared', token}` | Discards the proposal, including both random continuations |

Only ordinary `account` and `workshop` commands can appear in a batch. Opening,
restoring, closing and nested preparation are refused. At most eight records
may change. The existing bounded JSON admission applies to the entire request
and aggregate reply; sixteen individually valid operations are not necessarily
an admissible combined response.

An unchanged batch returns token zero and no pending proposal. Otherwise,
committed `account-save` and `workshop-save` remain readable until publication.
All other ordinary operations, including rule queries, wait for commit or abort.
Candidate save reads execute no new rules. Returned data cannot mutate either
the candidate or the committed owner. A rejected batch publishes nothing and
does not consume a token. Retired tokens cannot reach a later proposal.

Transport admission preserves gameplay semantics. For example, an account
purchase can produce `ok:true` with `reply.result:false`. The caller must inspect
provisional gameplay results and apply its policy before writing anything. Cues
and other presentation events in these replies are also provisional.

## Durable publication

1. Reserve a complete account/inventory save group and load it with one coherent
   read. Validate every gameplay document before making it available to the game.
2. Authorize and prepare the commands. Treat every result as provisional.
3. Collect candidate saves for changed records and committed saves for unchanged
   dependencies. Atomically check the observed storage revision of **every
   record the decision depended on**, not just the records listed in `writes`.
4. After an acknowledged successful storage commit, commit the prepared token
   and publish the complete new view and its events.
5. On a definite storage refusal, abort. A stale revision requires a coherent
   reload and new evaluation. If durable completion is uncertain, resolve the
   stored group before choosing an outcome.
6. If native execution or publication fails after storage commits, discard the
   owner and restore the acknowledged complete group. Do not attempt to keep
   using a poisoned VM or report a durable change as rolled back.

`writes` identifies changed gameplay records; it is **not a complete database
read set**. Inventory actions can depend on an unchanged account, and account
changes validate attached inventories. A safe first coordinator reserves one
account and all its participating inventories and guards that entire aggregate.
With the current grouped-save API, write the unchanged records too, using their
observed revisions. This prevents a concurrent writer from invalidating a
decision between admission and durable commit. The aggregate must fit the
storage limit of eight records and 4 MiB, independently of the command limits.

Prepared tokens and gameplay version counters are not durable revision numbers.
Use the storage service's revisions for concurrency checks. Initial creation
and reload are host publication boundaries; preparation does not implement
legacy-account reconciliation or infer which of two old projections is correct.

## Engine transport and verification

`adapters/embedded/account-workshop-session.mjs` supplies a compiled factory and
lossless text envelopes. `prepare-text` accepts a JSON array of account/workshop
text commands, validates every envelope before execution, and returns complete
provisional replies as JSON text. `prepared-save-text` retains the complete save
and both random continuations. Engine serializers only handle routing and
small metadata, preserving arbitrary authored IDs, opaque data and numbers.

The package contracts cover commit, abort, stale tokens, pending reads,
admission failures, bounds, random overflow and response ownership. They run
against an installed package and a browser bundle with ambient host facilities
disabled. Deliberately broken publication, rollback, token and ownership logic
must fail assertions. Native replay also compares staged results and saves with
the frozen pre-transaction implementation running the same operations serially.

The optional unminified account module's allowance rises from 20 to 21 KiB for
this additive boundary (20,768 bytes in this revision). The separate 180 KiB
bundled consumer limit remains unchanged. Native heap observations do not
measure Unity allocations, frame time or physical-device performance.
