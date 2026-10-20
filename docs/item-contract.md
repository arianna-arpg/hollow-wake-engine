# Item rules v1

Import `ItemContent` and `ItemRules` from `@hollow-wake/engine/items`. This optional
entry point is not imported by the core entry. Load `@hollow-wake/items/items.json`
explicitly, verify its manifest hash at the host boundary, and create one immutable
`ItemContent` to share. Each `ItemRules` owns its random stream, numeric uid
allocator and bounded derived pools. No mutable game registry or ambient RNG is used.

## Operations and ownership

`roll` implements the original weighted drop pipeline: base/category gates, rarity
floor/ceiling, affix families and affinity, tier/exquisite/overroll rules, guaranteed
families, quality policy, names, superior rolls, sockets, uniques and rolled choices.
`forge` implements the original deliberate mint path, including explicit affix
picks, quality, random filling and socket count. Forge remains an authorized host
operation; it is not a currency, vendor, salvage or crafting transaction policy.

Instances retain rolls rather than baked final values. `compile`, `ownStats` and
`resolveChoices` derive item modifiers, locally folded values and retained unique
choices. Derivation does not consume mint RNG or uid state. Legacy unique choices
use their original item/group-local seeded fallback; valid stored choices win.
Vestige and epitaph order, source registry order, rounding and RNG draw order
remain observable contracts. Relic `scalable` caps use explicit `null` for no finite
cap in portable data; the compiler uses the original baseline multiplier policy.

Version-1 generator snapshots include content identity, RNG state/draw count and
next uid. Restore requires the same content identity. IDs are an opaque content
version contract to the runtime; the content tool derives them from SHA-256, and
the package consumer verifies file bytes against the manifest. The runtime does
not authenticate a host that supplies different bytes under the same ID.

Numeric uids are unique within an allocator. A host restoring previously owned
items must advance the floor, and must namespace identity across allocators and
worlds (for example `owner-1:123` when adding an item to `Inventory`). This is not
a distributed ownership or trading authority. Exhaustion and invalid commands
fail before changing RNG/identity state. Valid unsatisfiable mint requests return
null and preserve the original RNG consumption up to that rejection point.

Full item payloads remain in Inventory or host persistence. `Character.equipInstance`
accepts an inventory identity, compiled item modifiers and host-authorized slot
eligibility. It retains only currently equipped instance definitions in build
snapshots and prunes replaced/removed records. Duplicate equipment and authored
identity replacement are rejected atomically. Attribute modifiers still fold into
attributes before their stat grants. A complete original World equip/replace/remove
path verifies attributes, stats, spell previews and costs, with save/restore at
each step.

`Character` still declares the resolved-spell-hit capability. Item modifiers that
require unextracted gameplay (grants, procs, defensive pools, etc.) are explicitly
rejected there. The item compiler preserves those modifier values for capable
hosts; compiling a proc-valued stat does not execute its proc. Item eligibility by
level, unique container limits, relic ownership, currencies and gem learning are
separate policies still being extracted.

## Validation and recorded differences

Content is copied, validated and frozen once; callers cannot replace the content
object or mutate its nested data. Returned modifiers do not alias immutable content.
Commands accept data only, never caller RNG callbacks. Nonfinite tuning/commands,
unsupported options, invalid dimensions/caps, broken references and malformed
content are rejected. Known retired/missing unique choices retain the original
migration behavior. Unknown saved item bases/affixes/tiers/uniques/vestiges fail
explicitly instead of silently dropping their contributions as the old compiler
could. A host must make such retirement migrations explicit before calling it.

Two deliberate robustness changes apply to custom content, without changing any
captured authored result: zero-sided magic affix caps are enforced, and a guaranteed
family cannot bypass a zero cap. The original code allowed those combinations.
Independent custom-pack tests cover both cases. Selection-weight overflow also
throws and rolls back the mint rather than producing an arbitrary fallback item.

## Performance shape

An affix pool caches one eligible level per rarity, keyed by its owned base pool.
It stores ordered definition references and Float64 weights. Sampling skips used
families in two passes, preserving the original floating-point accumulation and
draw order without rebuilding candidate arrays on every affix. Arbitrarily many
queried levels cannot accumulate cache entries. Content is immutable, so another
content pack gets independent derived pools.

The desktop benchmark measures roll plus modifier compilation, including SDK
validation and ownership copies. Five fresh processes per implementation each warm
1000 items and measure 5000 level-21 rare items, across droppable bases, in batches
of 20. Median-of-run-medians: original 6.1542 ms, optimized SDK 1.9286 ms; median-of-
run-p95: original 12.4687 ms, SDK 3.3247 ms. An earlier mechanically extracted SDK
measured 10.7033 ms median before the pool optimization. Every run's checksum agrees.

The full optional content load (JSON parse, copy and validation) still measured
183.29 ms median on the desktop. Original content was already booted, so that load
number is not a comparative startup benchmark. Startup/layout work remains useful.
No target-device, allocation-volume, retained-memory or whole-frame claim follows
from these measurements. Preserve the raw reports when changing the pipeline.
