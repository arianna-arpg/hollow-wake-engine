# Relic custody and progression (version 0.12)

`@hollow-wake/engine/inventory/relics` supplies canonical account relic bodies,
board/bag/reserve views, storage planning, legacy carry/corpse migration, death
tombstones, restoration, occupied-cell experience and bounded power/storage
investments. The game adapter delegates `engine/accountReliquary.ts` and
`meta/reliquary.ts` through one explicit host binding. World still authorizes and
commits player actions, applies actor effects and persists account state.

```ts
import { RelicCustody } from '@hollow-wake/engine/inventory/relics';

const relics = new RelicCustody<Item>({
  isRelic: item => itemBases[item.baseId]?.category === 'relic',
  footprint: item => itemBases[item.baseId],
  nextUid: () => ids.next(),
  bumpUidFloor: seen => ids.reserveThrough(seen),
  cloneItems: items => structuredClone(items), // host-selected deep clone
  stash: () => storageDefinition,
  bagBoard: () => currentBagBoard,
  progression: () => containerPack.custody.progression,
});
const state = relics.restore(decodedSave);
const stored = relics.bank(state, incoming, characterScope);
// An authorized host transfer uses this canonical object, if returned.
const spent = relics.investPower(state, wallet, attunementAuthorized, requested);
// Persist the complete account transaction through the host's save service.
```

## State and identity

State remains host-owned and mutable. `bank` adopts the incoming object after
classification; it does not copy its payload. Stable `relicKey` precedes session
UID. An already owned key returns the canonical body without changing either
payload. A released key is refused. Missing keys derive from explicit scope and
the pre-transfer UID. New adoption clears bag coordinates. UID collision obtains
a fresh host address while preserving the stable key.

Views retain canonical body identities. Migration adopts legacy bag pieces into
reserve and new legacy board pieces at their original cells. Replaying a save
cannot replace an already chosen account board. Canonical carried bodies return
to the bag; a full/conflicting bag routes them to reserve/recovery. Ordinary gear
collisions can reassign session UIDs without changing stable relic identity.
Death loss deduplicates keys, removes matching bodies/addresses, and records
tombstones. Replaying an old bag, board or corpse cannot resurrect those keys.
Tombstones are not silently capped or expired: safe retention requires a save
version and authority design.

Restore is the explicit copying boundary. It retains the first body per nonempty
key, excludes released keys, deduplicates selections, and gives board selection
precedence over bag selection. It clamps original rank/investment metadata and
repairs storage addresses. It does not rebuild, validate or rewrite opaque item
content. The caller decodes saves and supplies a deep clone preserving payloads
and aliases. The game uses its existing structured clone behavior. The runtime
imports no serializer, filesystem, database, clock, RNG or engine objects.

No account, item body or lookup index survives in the custody instance. Selection
sets are rebuilt from current state, so direct host edits appear on the next
call. Numeric scratch has the existing inventory/storage bounds. Temporary lists
and sets scale with the account collection. Separate accounts may use one instance
sequentially without sharing property.

## Ports, authorization and failures

Ports are synchronous and bound to their supplying object. Classification,
footprint, board and content reads must be pure during an operation. The UID
provider owns the address space and returns fresh safe nonnegative integers.
Collision repair requires monotonically advancing allocated values; repetition
is rejected instead of spinning forever. `bank` rejects an already owned
allocated address before adopting the new body. The original valid allocator
satisfies these requirements. Restore calls its floor port for every retained UID.

Mutations preserve original synchronous ordering. Reentry is refused and guards
release after an exception. This is not rollback across arbitrary throwing host
callbacks: ports must not throw after mutation begins. A host needing transaction
isolation can work on an account copy, durably commit it, then publish it.
Network authorization, optimistic concurrency, crash recovery and multi-process
locking are not supplied by an in-memory custody object.

World still checks local-host identity, alive/calm state, Oracle access, features
and attunement. It chooses final transfer/swap destinations, item-lock policy,
summon cleanup, health ratios and save scheduling. Investment receives an explicit
authorization result; an untrusted client must never supply that decision.

## Economy and content

A power pour spends the lesser of available integer currency, floored request
and the current rank's remaining quadratic cost. It completes at most one rank.
A storage pour follows the same law for one page and repairs addresses after it
opens. Invalid/nonpositive requests or missing authorization take nothing.
Surplus stays in the wallet. Investment assumes valid restored balances and
investments; it does not repair arbitrary mutated economy state.

Progression tuning uses an explicit live port. Maximum rank is a safe nonnegative
integer; cost base is finite and positive, and the largest next-rank cost fits
the safe integer range. Power and XP factors are finite/nonnegative. These are
SDK bounds, separate from legacy field repair. Experience counts footprint area
with the original zero floor and disabled-state behavior.

Container content package 0.2 adds a `relic-custody/v1` projection: progression
tuning, storage layout and authorization key names. The consumer still supplies
classification, acceptance and identity services. Container rung purchases and
quest earning remain separate capabilities; reading those fields does not execute
them. Gameplay operations do not query SQL. A database can support durable
records or content tooling; its transactions belong behind host persistence.

## Evidence and measured limits

Two independent original exports agreed byte-for-byte before implementation:
240 restores, 600 investments, 120 sequences comprising 2,520 custody transitions,
and 160 experience folds. They cover repeated keys, canonical/stale bodies, UID
collisions, selection precedence, full-bag fallback, corpse adoption, tombstones,
replayed migrations and bounded pours. Independent tests add account isolation,
deep-copy ownership, live tuning, broken allocator and reentry contracts. Normal
tests never regenerate accepted observations.

The benchmark compares the original, M13 (original custody with SDK storage), and
M14. It uses three warmup batches, 15 samples in rotating implementation order,
unchanged-input checks and equal checksums. Desktop medians in milliseconds
**per batch**, i9-10900K/Windows/Node 24.9.0:

| Workload | Calls/batch | Original | M13 | M14 |
| --- | ---: | ---: | ---: | ---: |
| Empty reserve | 128 | 0.0287 | 0.0291 | 0.0965 |
| 8-item restore | 2 | 0.2459 | 0.1606 | 0.2050 |
| 96-item restore | 2 | 4.8647 | 0.7500 | 0.7237 |
| 384-item restore | 2 | 117.8790 | 4.8271 | 4.3065 |
| 96-item migration | 2 | 5.8806 | 0.8280 | 0.9449 |
| 384-item migration | 2 | 123.4186 | 4.1548 | 4.1246 |
| 384-item bank batch | 4 | 10.0088 | 10.5486 | 10.0466 |
| Empty XP fold | 128 | 0.0194 | 0.0205 | 0.0833 |
| 8-item XP fold | 128 | 0.0219 | 0.0211 | 0.0544 |
| 384-item XP fold | 128 | 0.5141 | 0.4132 | 0.2002 |

Most large restore/migration gains versus original already come from M12 storage.
M14 selection indexing improves large reserve/restore work, while validation and
call boundaries add overhead to some small cases. Those regressions remain
recorded. Restore includes payload cloning; migration includes cloning mutable
input. The 384-item stress case exceeds authored storage's 192 cells and exercises
recovery. Raw samples cover all 20 profiles. These are not frame-time or Steam
Deck/mobile measurements; allocation, GC and device acceptance remain outstanding.

The optional custody module has a 16 KiB unminified-JS allowance within the
existing 224 KiB combined bound. Earlier module/content limits stay unchanged.
The implementation still needs a JavaScript host; this does not establish Unity,
Godot, Unreal or ARM package compatibility.
