# Passive grants and the character rebuild

Version 0.7 exposes `@hollow-wake/engine/passives/grants` with capability
`passive-grants/v1`. It assembles attributes and ordered statistics from all 2,489
captured passive nodes and their choice options. The isolated Hollow Wake adapter
delegates this calculation to the installed package during `World.recalcSeat`.
Allocation legality remains the separate [passive policy](passive-policy.md).

## Ownership and numerical behavior

`new PassiveGrants(pack)` validates and freezes its own content copy. Attribute
vectors and node metadata compile once. Share that content across characters.
`begin(baseAttributes, allocated, choices)` creates a private rebuild accumulator.
Call `addItemModifiers` for each eligible item/container source in host order;
it consumes attribute lines and returns detached nonattribute lines for that
source. An invalid batch leaves the accumulator unchanged. `attributes()` returns
the final totals and `attributeModifiers()` expands the registered per-point rules.

The fold preserves base, allocated-node and chosen-option order. Flat grants are
not pre-summed: doing that changes floating-point results. Equipment and eligible
container grants join the same attribute pool. Percentages apply once, after all
flat grants, followed by the original rounding and zero clamp. Attribute item lines
other than `flat` and `increased` remain inert, as in the original game.
Modifier conditions, gauges, tags and ordering pass through unchanged.

The output getters return detached modifiers, conduit specifications and graft
sources. Validated output rows use schema-specific copies; nested tag arrays and
graft objects are still independent. General content/input validation remains at
the boundary. No database, ambient randomness, global game registry or host API
is imported by the runtime.

Unknown allocations/options fail by default. The explicit `skip` mode supports
the original rebuild's tolerance of retired saved ids; it does not authorize a
purchase or replace strict policy/save validation. Builds are short-lived derived
state. Persist the authoritative policy/build inputs, not the accumulator.

## Content and game adapter

`npm run passives:grants` compiles the captured data into the separate
`@hollow-wake/passive-grants` archive. Its manifest includes a capability, content
hash and byte size. The optional data package is bounded to 1 MiB unpacked.
Grant and allocation-policy JavaScript together stay within the existing 32 KiB
optional-passive budget. These are distribution bounds, not heap measurements.

The live game bridge caches one compiled content instance and exports
`refreshSdkPassiveGrants()` for authoring changes. The actual passive editor
invalidates that cache on panel input/change/click events and node creation/deletion.
Direct programmatic authoring must call the same hook before the next rebuild.
Normal rebuilds do not scan or recompile the content registry.

Some original proc-rider statistics have no `STAT_DEFS` display entry. The frozen
compiler declares those from `PROC_RIDER_LIST`; for example, Static Shrapnel's
`procRider_static_shrapnel` is read by the real proc engine. The live editor bridge
also declares its authored numeric/link keys and graft support references to
preserve the original handling of custom numeric keys and retired content. A
missing support definition still produces no host support effect. Missing choice
groups preserve the base node's grants and omit the missing choice payload.

The guarded adapter changes only the reviewed rebuild method, required imports,
editor invalidation hooks and the new bridge. It verifies all inputs before writes,
preserves unrelated World edits and line endings, and refuses reapplication.
Original module registration order is retained. Item eligibility, container
amplification, level grants, skill lookup, pool clamps and all combat effect
execution remain in the host. The primary game checkout stays unchanged.

## Evidence and reproduction

```sh
npm run verify
npm run reference:passive-grants
npm run adapter:grant-source
npm run adapter:prepare
npm run adapter:passive-grants
```

Preparation requires a new destination; it refuses existing dependencies/bridges.
The normal reference command re-exports the original and compares immutable
accepted results. It never replaces them. The new evidence covers:

- 4,103 actual original World rebuilds: every node and choice option, 39 class
  attribute spreads with real gear, and retired saved selections. Class-spread
  cases retain the Magician host identity; they are not all-class gameplay tests.
- 162,246 numeric reads with inactive/active conditions, gauges and tags, plus
  exact attribute totals, ordered sheet sources, conduit rows and graft sources.
- Eight live authoring revisions, including a deliberately retired support
  reference, custom numeric key, removed choice group and removed node.
- Independent ordering, rounding, ownership and atomic-rejection checks; two
  deliberate runtime faults; an installed-package fault that the real game detects.
- A fresh offline consumer combining policy, grants and statistics through 277
  purchase/refund paths over 39 classes, with ambient RNG/network/browser access disabled.

For a full game checkout with renderer inputs, use:

```sh
node scripts/build-game-item-ui.mjs --game GAME --output NEW_BUILD
node scripts/test-passive-grant-ui.mjs --game GAME --dist NEW_BUILD --electron ELECTRON
node scripts/test-game-item-ui.mjs --game GAME --dist NEW_BUILD --electron ELECTRON
node scripts/test-game-boot.mjs --game GAME --dist NEW_BUILD --electron ELECTRON
```

Renderer courses use hidden windows and isolated profiles/saves. The original
attribute-choice and Font assertions remain unchanged. An additional course uses
the editor mounted by the actual game, proving edit/restore/create/delete refresh
against that same registry. The earlier original editor serialization course
bundles a separate editor copy; it alone would not prove live cache refresh.
The source capsule omits renderer entry files and media. The recorded local run
supplements five hashed renderer/configuration files from the clean managed game;
CI's portable reference job does not claim renderer acceptance.

## Performance and remaining scope

Run `npm run benchmark:passive-grants` with a freshly installed current adapter and
other CPU-heavy work stopped. It compares complete character rebuilds over 39
recorded allocation states with real gear, requires identical derived-state hashes,
warms both implementations and retains 25 timing samples per implementation.
It includes prior item delegation and unchanged host work, so it does not isolate
the cost of passive arithmetic. On the recorded i9-10900K/Node 24 desktop run,
117 rebuilds took a median 9.035 ms through the final adapter versus 6.224 ms in
the original. Schema-specific copies reduced the first adapter candidate's
25.498 ms result substantially, but the final adapter remains about 45% slower
than the original in this workload. No performance win over the original is
claimed. Full samples and identical-output hashes are in
[final measurements](../evidence/milestone-nine/rebuild-benchmark.json) and
[initial measurements](../evidence/milestone-nine/rebuild-benchmark-initial.json).

This is attribute/stat assembly and specification delivery. Conduit pumping,
proc payload execution, graft/support effects, vocation rewards and full level
progression are not extracted here. The original fixture has one nonempty live
graft-support binding row; all graft payloads are compared, but that is not broad
support-runtime coverage. Game allocation policy delegation is still pending.
No Steam Deck, mobile, Unity, Godot or Unreal support is inferred from these checks.
