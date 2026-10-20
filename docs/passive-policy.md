# Passive allocation and refund policy

Version 0.6 adds the optional `@hollow-wake/engine/passives` entry and a separate
`@hollow-wake/passives` content archive. `PassivePolicy` compiles an immutable graph;
`PassiveBuild` owns one character's allocations, choices, wallets and graft bindings.
Neither imports the game, UI, filesystem, a database or an engine object.

This is `passive-policy/v1`: allocation and refund authority, choice deals,
character-unique options, multi-pick costs, realm access and currencies, earned
vocation membership and gates, free roots, graft binding eligibility and point
refunds. It does not execute the selected nodes' stat grants, conduits or grafted
supports. Those authored payloads remain preserved in the full catalogue. Vocation
quests, earning points, level progression, legacy migration and live-game delegation
remain separate work. The older `Character` selected-build API is unchanged.

## Usage and ownership

```js
import { PassivePolicy } from '@hollow-wake/engine/passives';
// Host loads validated JSON from @hollow-wake/passives/passives.json once.
const policy = new PassivePolicy(pack);
const build = policy.create({
  classId, allocated: [policy.start(classId)], choices: {}, grafts: {},
  vocations: [], passivePoints: 10, vocationPoints: 0, realmPoints: {},
});
const purchase = build.allocate(nodeId, { ledger }, optionId);
const preview = build.quoteRefund(nodeId);
// The host supplies its Font/proximity/living/combat/service refusal, or null.
const refund = build.refund(nodeId, serviceRefusal);
const resumed = policy.restore(JSON.parse(JSON.stringify(build.snapshot())));
```

The host authorizes initial budgets, earned vocations, known skill ids, ledger
values and service access. The policy does not authenticate a network request or
infer spatial reach. `openAllRealms` is an explicit testing override corresponding
to the original developer setting. Production adapters must not accept it from an
untrusted player. Sharing one immutable policy across builds is supported; build
state and graph-walk scratch never cross characters.

State is copied on ingress and snapshots are detached. Snapshots carry the exact
content id; the content compiler derives it from SHA-256 of the policy projection.
Restore rejects another id or schema. A custom content author owns id/version
discipline. Unknown allocated ids, invalid choices, stale graft sources and unsafe
wallet numbers are errors. This is strict loading, not the game's tolerant legacy
save migration; callers must perform an explicit migration first. Construction
does not establish that every supplied allocation was earned or is connected.
Content compilation also checks vocation root domains and bounds every possible
multi-pick refund to an exact safe integer.

## Observed semantics

An allocation in an open realm seeds its free roots **before** checking the
purchase. A refusal can therefore retain new roots. `rootsAdded` reports them
even when `accepted` is false. Closing the realm does not revoke existing roots.
`ensureOpenRoots` is idempotent. A future game adapter must preserve the original
rebuild after root grants and the rebuild/company refresh after a paid allocation.
The standalone call returns the resulting state; it does not invoke host callbacks.

Each pick spends the configured pick cost. The first pick also allocates its node;
later picks do not repeat adjacency. `sole` groups exclude sibling nodes. A spent
`first` group leaves siblings as one-point paths without a new choice. A claimant
cannot be refunded before its paid shortcuts. Character-unique options remain
unique across nodes sharing that group.

Refunds anchor only the owning class start, earned vocation roots and realm roots.
A purchased other-class start is not a free anchor. Traversal stays within each
vocation or realm; a cycle or cross-realm edge cannot rescue a detached branch.
Dependent vocation nodes keep their gate. Free-adjacency realms require no path.
Whole-node refunds return all paid picks to their original pool and clear the
node's graft bindings. A host service refusal prevents mutation. Numeric overflow
also fails before mutation, rather than silently losing integer points.

Graft binding verifies an allocated node or selected option grants the source and
the requested skill belongs to the host-supplied learned set. Binding to the
current target is idempotent, including the original absent-to-null behavior.
Rebuilding skill supports and existing summons remains a host integration task.

## Evidence and cost model

`reference/export-passives.ts` runs original `World` allocation/refund/binding
methods and original shared helpers against the frozen source. Host rebuild,
service and observer callbacks are stubbed and recorded. This proves policy state,
not the omitted callbacks' combat effects or UI. Accepted fixtures are immutable;
normal re-export compares them instead of replacing them.

The reference suite compares 9,699 commands across authored class builds,
registered edge cases and every vocation, including exact refusal text, choice
order, currency balances and snapshot continuation. Independent tests cover
non-unit pick prices, realm separation, graph cycles, ownership, invalid input and
overflow. Deliberate faults remove realm separation and lose multi-pick refunds;
the behavior tests must reject both. A fresh consumer installs the two packed
archives with ambient random, network and browser APIs disabled.

Graph edges and domains compile once into integer arrays. Each build reuses a
queue and visitation array totaling five bytes per graph node. Refund traversal
does not allocate a temporary graph, Set or queue. It still creates a small result
and closures; no zero-allocation claim is made. Allocation uses the existing
ordered set and choice records to preserve observed ordering. These are build-edit
operations, not work that needs to run every animation frame.

```sh
npm run verify
npm run reference:passives
npm run passives:build
npm run benchmark:passives
```

The benchmark alternates original and SDK refund previews over identical saved
builds, checks results first, records samples/tool versions and excludes startup.
Run it without competing CPU-heavy tasks. Local timing is not a Steam Deck,
mobile, whole-frame or total-memory measurement. No database query sits in this
runtime path; authoring/query tooling can still use the existing SQLite catalogue.
The optional passive JS budget is 32 KiB; core and item limits remain unchanged.
