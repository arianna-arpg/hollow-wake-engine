# Unlocks and memory rewards

The 0.44 candidate moves the Vault's unlock queries, purchases, mastery acquisition,
memory discovery and secondary access into optional SDK modules. Authored content
ships separately. The original game remains the reference implementation; named
compatibility repairs have separate expectations.

## Load once and create rules

```ts
import { UnlockContent } from '@hollow-wake/engine/progression/unlock-content';
import { UnlockLifecycle } from '@hollow-wake/engine/progression/unlocks';
import { ProgressionGateContent } from '@hollow-wake/engine/progression/gate-content';
import { MemoryRewardContent } from '@hollow-wake/engine/progression/memory-content';

const gates = new ProgressionGateContent(gatePack);
const memories = new MemoryRewardContent(memoryPack);
const content = new UnlockContent(unlockPack, { gates, memories });
const rules = new UnlockLifecycle(content.context(relicServices));

const available = rules.availableUnlocks(account);
const offer = content.definition(offerId);
if (offer) {
  const completed = rules.applyUnlock(account, offer, random);
  // The host persists the account and refreshes presentation after completion.
}
```

The three packs are parsed JSON supplied by the host asset loader. `account` is
caller-owned state satisfying `UnlockAccount` and `MemoryAccount`. Sets and
dictionaries retain their identities during synchronous operations. `random`
explicitly supplies values in `[0, 1)`. Queries require no random source.

`relicServices` supplies `reliquaryCost`, `reliquaryPower`, `stashPageCost`,
`investReliquary` and `investRelicStash`. Existing SDK `RelicCustody` and
`StashPolicy` services can implement these. The host selects their item identity,
geometry and custody ports. The standalone package consumer demonstrates this
composition without importing the original game.

Share loaded content. Loaders validate, detach, freeze and index their definitions.
Each `UnlockLifecycle` owns its milestone caches. Create a new lifecycle when
replacing a mutable catalogue; cached milestone membership does not automatically
track later edits.

## Entry points and content

| Entry | Responsibility |
| --- | --- |
| `progression/unlocks` | Ownership, visibility, progress, rumors, shelves, claims, investment and purchases |
| `progression/unlock-content` | Immutable catalogue and composition with gate, memory and relic services |
| `progression/unlock-predicates` | Ordered prerequisite data and short-circuit evaluation |
| `progression/memories` | Discovery, awakening, secondary access and explicit-random rewards |
| `progression/memory-content` | Initialized reward columns and immutable definitions |
| `presentation/runes` | Alphabet lookup and phrase-local deterministic reveal |

The unlock archive contains 190 static entries, 39 class definitions, 39 packages,
108 package prerequisite expressions represented as data, bundles, slot and shelf
configuration, and the rune alphabet. The memory archive retains selected columns
for all 954 initialized skills and 457 supports, including six late-initialized
skills marked `noDrop`. Its default eligible catalogue contains 1,061 entries.

The compiler accepts booleans, numeric ledger or account-level comparisons, and
ordered AND/OR groups. It refuses calls, assignments and unreviewed syntax. Runtime
evaluation never executes source text. Compilation checks 2,432 original predicate
outcomes and ordered reads, plus 2,370 rune reveal observations. Dependency content
IDs must match. Manifests provide byte hashes for host asset-integrity checks;
content IDs alone are not signatures.

Authoring data may live in a database. Gameplay uses validated immutable records
and indexes, with mutable account state outside them. No database engine or query
language is required at runtime. An authoring database can therefore change
independently of a game's asset loader.

## Behavior and repairs

Ordinary investment clamps spending to available currency and the remaining price.
It retains partial payment and grants on completion. Repeatable services remain
distinct from permanent ownership. Earned claims and pending-reward acknowledgment
are separate operations. Package tiers retain prerequisite order. Memory grants
preserve pool ordering, explicit draw counts, before-draw capture and nested
callback ordering.

Original fixtures retain known defects. Separate expectations and independent
assertions record these repairs:

- Refuse nonfinite currency or investment, nonfinite or negative costs, and NaN
  requests before spending. Ordinary positive-infinity requests retain finite
  clamping; memory and relic services retain their own request constraints.
- Treat investment and receipt IDs as literal own properties, including
  `__proto__`. Legacy transfers read the destination's own balance.
- Read memory completion from the reward definition's receipt ID, which may differ
  from the offer ID. Report success only after the requested service completes.
- Require actual skill membership for awakening, an incrementable receipt sequence
  and a finite positive weighted total. Invalid grant preflight consumes no draw
  and changes no account state.

The host owns authorization, ledger event production, durable transactions,
save-envelope migration, input, rendering and audio. The SDK mutates borrowed
in-memory state synchronously; it does not provide a database transaction or
network authority model.

## Adapter and verification

The adapter preflights both unlock and memory source files before writing either.
It accepts frozen original functions and reviewed earlier SDK delegations. Existing
class-claim and class-reward delegations remain in place. Other operations use the
new lifecycle through lazy live-content ports. Installation preserves unrelated
declarations, rejects concurrent edits and rolls back only its own writes.

Raw policy, transaction and memory fixtures predate implementation. The supplement
manifest records the actual later capture times; supplements are not relabeled
as pre-implementation evidence. Repaired outputs never replace the originals.

```sh
npm run build
npm run reference:unlock-content
node scripts/test-reference-unlock-lifecycle.mjs
npm run test:unlock-package
npm run test:unlock-mutations
npm run adapter:unlock-source
# After preparing an isolated game with adapter:prepare:
npm run adapter:unlocks
```

The package consumer replays 46 policy profiles, 508 purchase traces, 32 mastery
rungs, 2,645 memory draws and 216 drop observations through installed public
imports. Type and browser checks exercise immutable content and an actual purchase.
Sixty-eight deliberate faults cover rewards, purchases, prerequisites, validation
and rune behavior. The game observer also checks 23 save/load transitions and
previous character, continuity and gate observations.

Custom class IDs and configured ledger prefixes are matched literally, including
punctuation. Objective aggregation preserves own keys such as `__proto__` and
`constructor` without inherited values or prototype changes. These additional
custom-content repairs have independent regression cases and a separate
[decision](../baseline/unlock-lifecycle/repairs/custom-identifiers.json); the
frozen game observations are unchanged.

`node scripts/test-native-unlocks.mjs --amalgam-dir <pinned-source>` rebuilds the
C, C++ and .NET replay from the maintained package receipt and frozen fixtures.
It compares 3,242 requests in each host, checks three deliberately wrong variants
and verifies zero tracked allocations after disposal. It records the actual
platform, toolchain and package hash; running it is required evidence for that host.

`npm run adapter:unlock-ui` restores the preserved renderer shell into a fresh
copy, builds the installed game and checks Vault, memory and class interaction.
The lower-level `scripts/test-unlock-ui.mjs` accepts `--game`,
`--dist` and `--electron` paths and runs the three unchanged original Vault and
memory courses with fresh saves. The workflow schedules these on Windows and
the package, installed-game and native checks on Windows and Linux. A workflow
definition alone does not establish a passing hosted run.

`node scripts/benchmark-unlock-content-load.mjs` measures JSON parsing,
validation and index construction from the last accepted package. Stop other
heavy work first. Each variant uses eight separate processes, 32 warmups and
256 timed constructions, plus explicit-GC retained-heap observations over 32
copies. Module/file startup, gameplay queries, rendering, native execution and
physical-device costs are excluded; this is an absolute desktop measurement.

Complete release verification, actual Vault interaction, native/editor packaging
and physical Steam Deck/older-mobile acceptance are separate gates. Browser-targeted
execution and Windows C/C++/.NET replay alone do not establish Unity, Godot, Unreal
or physical-device support.
