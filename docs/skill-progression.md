# Skill progression and tree actions

Version 0.16 provides four optional entries: `skills/tree`, `skills/progression`,
`skills/grants` and `skills/actions`. None is imported by the main runtime entry.
The separate `@hollow-wake/skill-progression` content package carries all 954 skill
caps, 457 support caps, 132 authored trees, level bands, essence costs, Font
recipes and legendary investment tuning. Delivery **type** and color are included
for action routing/presentation; they are not complete delivery implementations.

## Ownership and integration

`SkillProgression` copies and freezes its content and compiles each graph once.
Its `ability` and per-skill `tree(id)` rules can be shared across characters.
The caller supplies each character's level, rarity, empowerment rank and ordered
`treeNodes` array. A repeated node id is a purchased rank. Query results never
change investment. Content replacement means constructing another progression
instance; there is no SDK global registry or invalidation scan.

`compileSkillTree` and `SkillTreeRules` also support explicitly borrowed host
content. Compiled graph maps, sets and arrays belong to that caller; node payloads
and authored branch identities are retained. Keep topology stable until replacing
the graph. Payload reads can observe edits to the borrowed node objects. The game
adapter preserves the original spec-identity cache and refreshes numeric economy
tuning when its values change. In-place topology changes require a new tree spec,
as in the pinned game. These are distinct contracts, not interchangeable caches.

`SkillActions` binds one set of ports to a World/session. It mutates the actual
skill/support objects and wallet supplied by the host, including the original
callback order. It implements levels, whole-tree reset, ordered purchases,
essence grants/spending/conversion and the Font merge commit. `planSkillMerge`
selects eligible inputs without consuming them. Equal rank/level ties retain bag
order; legendary merges keep the selected copy's tree/sockets and combine donor
ranks. Returned donor supports are all decoded before any input is consumed.
The host's grant sinks must retain custody in bag, ground or recovery storage.

Ports remain responsible for player/account authority, station reach, combat
discipline, native world cleanup, derived-stat rebuilding, notifications, pickup
feeds and durable saves. Ports are synchronous and must not throw after a commit
begins, reenter the action host, or change unrelated action state. Reentry is
rejected. There is no rollback of arbitrary host callbacks, distributed transaction
or SDK-owned game save. The support argument must already belong to the authorized
seat; the game's intent resolver still enforces that ownership.

## Preserved behavior and deliberate boundaries

The baseline preserves ordered any-predecessor graph reachability, symmetric
exclusions, first-parent layout, first duplicate-id precedence and original refusal
words. Maximum rank is a silent action no-op above the refusal predicate. Legendary
points fund passive slots first and can expand only those slots. Restoration does
not enforce the opening level for a new purchase: the original retains an earned
legendary passive at level 1 even when its tree opens at level 5. Omitting the
restore level checks structure/ranks without enforcing ordinary point budget.

Graph compilation accepts at most 4,096 node rows. Bands contain 1–256 increasing
positive safe integers; skill/support registries each allow at most 4,096 rows.
Levels queried by the strict SDK are nonnegative safe integers. Nonfinite values,
negative costs, invalid balances and noninteger essence tiers throw before a
currency write. Integer grant/spend tiers retain original endpoint clamping;
conversion rejects out-of-range tiers and unknown directions. Positive fractional
currency counts remain supported. Derived finite amounts are checked. These are
explicit stricter boundaries around authored behavior, not a claim to preserve
malformed direct calls. Hosts must also bound imported selection arrays and content
size for their deployment; a maximum node count is not a total memory budget.

Unreachable first-link cycles used to permit unbounded prerequisite/name reads.
The SDK detects a traversal exceeding the graph size and throws. Graph layout uses
an iterative work list, including a tested 4,096-node chain. Rank normalization
retains the original safe-integer policy; adding capacity to a maximum-safe rank
can produce the original next representable value, so not every derived capacity
is claimed to be a safe integer.

## Resolved grants versus execution

The grant entry folds scalar overrides once per distinct node in first-investment
order, repeats aura arrays and modifiers by purchased rank, unions summon/tag
lists in original sorted order and preserves effect/buff ordering. It never
mutates native definitions. Unchanged effects/channels and a single plain override
retain their borrowed references. Later scalar fields replace earlier fields;
buff modifiers append. A channel override cannot create a channel-less skill.

`resolveSkillTreeEffects` requires the host's suppression decision, including
challenge delivery. The adapter supplies the existing `challengeDelivery` result.
Carrying invocation, trigger, summon, guard, charge, companion, graft or other
opaque payload data does not execute that mechanic. Native delivery, conditional
mechanics and support compatibility still need their own extraction paths. The
compiled package carries authored data without evaluating source strings or
silently interpreting unknown payloads as damage.

## Evidence and measured cost

Two independent original captures produced identical results. Pure observations
cover 257 level queries, 22 rank/numeral cases, all 132 layouts, 2,376 ordered
purchase sequences, 6,336 restoration cases and 5,148 graph/payload states.
The all-node payload views intentionally include exclusive combinations to test
folding order; they are not legal-build claims. The World capture covers 4,461
transitions in 138 worlds and 133 saved records, including all trees, real native
cleanup/recalculation, save/wire restoration, live price/merge edits and full-bag
support spill. Per-tree account/combat refusals are controlled host inputs.

The installed-package check compares both captures and rejects deliberately broken
empowerment budgets, aura ranks, paid levels and donor investment. The guarded
overlay checks six source files and two binding collisions before writing anything.
The standalone packed consumer performs levels, choice, payload resolution, reset
and legendary merging without the game, plus checks public TypeScript declarations.

The rotating desktop benchmark compares original, retained v0.15.0 and v0.16.0
adapters. Five warmups precede 25 samples; setup and result comparisons are outside
timing. All final outputs match. Median milliseconds from the confirmation run:

| Workload | Original | v0.15.0 | v0.16.0 |
| --- | ---: | ---: | ---: |
| Compile all 132 fresh trees | 3.6145 | 3.8239 | 3.3366 |
| Ten Inventory preview passes over 132 invested skills | 92.1652 | 92.2494 | 37.5774 |
| Forty complete level/pick/pick/reset sequences | 2.9967 | 3.5845 | 3.6725 |

Precomputed reverse adjacency avoids full-node scans during reachability, queue
cursors replace shifting, iterative layout avoids recursive depth and modifier
folds count ranks once. Uninvested and channel-less skills retain their early
returns in the game adapter. Two final measured runs put previews 59–60% below
v0.15.0. The complete action course is 2.5–8.6% slower than v0.15.0 and 23–30%
above the original. Both runs are retained; an earlier pilot's small apparent
action improvement was not consistent. This course includes native rebuilds and
callbacks and remains an optimization target. No allocation, whole-frame,
rendering, Steam Deck or older-mobile result is inferred from desktop timings.

The four optional modules receive a combined 48 KiB unminified JavaScript bound.
The combined runtime bound rises from 252 to 300 KiB for this added capability;
all earlier individual budgets remain unchanged. Skill content has a separate
2 MiB unpacked-package bound. Runtime queries use compiled in-memory data, with
no database dependency. Authoring/database tradeoffs remain documented in
[content-storage.md](content-storage.md).

## Reproduction

Run `npm run verify`, `npm run reference:verify`, `npm run reference:skills`,
`npm run adapter:skills-source` and `npm run adapter:skills` after preparing the
pinned reference and isolated adapter. The game additionally runs `npm run check`,
sim smoke and its `probe_abilityecon`, `probe_skillmodes` and
`probe_skillempowerment` courses. Run `npm run benchmark` and
`npm run benchmark:skills -- --previous-adapter <retained-v0.15-game>` with other
CPU-heavy work stopped. The benchmark verifies old/new source and installed bytes.

For mounted UI controls use `node scripts/test-skill-progression-ui.mjs --game
<isolated-game> --dist <built-game> --electron <electron-executable>`. It uses a
hidden desktop renderer, isolated profiles/saves and a controlled account permission.
This course is not native pointer, target-device or Unity/Godot/Unreal acceptance.
