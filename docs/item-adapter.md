# Item adapter integration

Version 0.5 connects the actual game's `rollItem`, `forgeItem` and
`compileItemMods` functions to the installed SDK. The separate game checkout
retains its existing uid allocator and caller-supplied random functions. The
original working checkout is not the integration target.

`@hollow-wake/engine/items/host` exposes `createItemHost(ItemContent, nextUid)`.
Its roll/forge commands take an explicit random port, so a world can interleave
item generation with its other random decisions without reseeding or guessing
how many draws occurred. The ordinary `ItemRules` API still owns and snapshots
its own random and identity state. Neither API uses ambient randomness.

The host interface validates commands before using either port. Random outputs
must be finite and in `[0,1)`; allocated uids must be positive safe integers.
Reentrant mint commands are rejected. A failing external callback can already
have consumed host state: the SDK cannot roll it back. A host needing transactional
failure recovery must checkpoint its ports itself. The interface intentionally
does not claim allocator uniqueness across worlds or network authority.

The Hollow Wake bridge supplies the game's original `Math.random` default only
when its existing caller omitted an RNG. This default remains game-owned and
outside the SDK. Immutable item content is captured lazily after registration.
`refreshSdkItemContent()` explicitly discards that snapshot and its derived
pools after a deliberate authoring edit; the next command validates fresh content.
It does not change the game's allocator or RNG. Hosts should refresh before
recalculating affected equipment. Arbitrary in-place registry edits are not
polled on every item roll.

The source transformer checks the original source before writing, retains every
public helper, and removes private generation functions that become unreachable
after delegation. The game continues to own tooltips, themed-base selection,
post-mint crafting operations, save migration, slot/unique eligibility and economy
policy. No live-game performance claim is made from the standalone benchmark.

The host interface reproduces the captured uninterrupted
1,500-operation stream. The actual installed-game bridge reproduces all five
milestone-four item observation files, including generation, modifier compilation
and equip/replace/remove. Changing the installed SDK's value rounding changes the
game's equipment trace. An additional original trace covers 300 commands
interleaved with unrelated random draws and uid allocation, seven save migration
cases, and content editing/restoration. The old game's `rebuildItem` remains the
migration authority: retired bases/uniques are removed, retired affixes/vestiges
are reconciled, tier bounds are applied, and unique choices retain their fallback.
Malformed arbitrary saves are not declared valid by these seven cases.

Run `npm run reference:item-bridge` to reproduce those original observations.
`npm run adapter:prepare` reconstructs a clean game from the source capsule,
installs separate pinned tools and the packed SDK, and applies both adapters.
It refuses to replace an existing checkout or dependencies. `npm run adapter:verify`
checks casting/Burning; `npm run adapter:items` checks item observations, migrations,
content refresh and the installed compiler fault. Temporary exporters are uniquely
named and removed without overwriting files already in a game checkout.

This reconstruction is a verification installation. The original game's dependency
manifest and distribution/update pipeline have not yet been migrated. The SDK
itself is also verified in a clean package consumer, including its explicit host
entry point with ambient RNG/browser/network access disabled.

## Renderer checks and captured baseline failure

The source-checked Inventory courses can run against a full game checkout:

```sh
node scripts/build-game-item-ui.mjs --game GAME --output NEW_BUILD
node scripts/test-game-item-ui.mjs --game GAME --dist NEW_BUILD --electron ELECTRON --services
```

The build command refuses existing output and verifies that source did not change.
The UI command retains each course's result, uses separate saves/profiles, and
returns failure if any course fails. Build/report locations are redirected; the
explicit Inventory assertion revision is documented in [the repair contract](inventory-ui-adapter.md).
Other courses are unchanged. For a control, build into another new directory
with `--original-items`: only the item generator is replaced by its hash-verified
original source. All other game source stays identical. Build manifests record
source and output hashes.

The captured older `inventory-ui` course failed at `Escape disarms before step closes panels`
with both the extracted and original item implementation. This is a retained
baseline UI test failure, not a passing check or a reason to weaken an assertion. The
newer `inventory-pages-ui` course passed 81 checks on both builds. The separate
[Inventory repair](inventory-ui-adapter.md) resolves this path in the isolated adapter,
retains the failing control and preserves the newer NPC/player panel contract.
