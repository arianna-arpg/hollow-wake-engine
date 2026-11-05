# Crafting and salvage extraction boundary

The 0.46 candidate implements crafting policy, immutable content and ordered
crafting/salvage actions. The accepted original-behavior boundary was captured
before implementation; its fixtures remain unchanged. Item generation and modifier
compilation share the existing SDK item definitions. The acceptance record is
[`baseline/crafting/acceptance.json`](../baseline/crafting/acceptance.json).

## Raw material and ownership

The source is the existing hashed game capsule, not the UI's descriptions or
derived tooltips. Two fresh processes run the original `engine/crafting.ts` and
actual `World` methods. The source lock, individual declarations, observer helpers
and uncompressed observations are hashed. Existing item definitions retain their
authored order; this boundary does not replace the accepted item content pack.

| Responsibility | Extraction target | Host responsibility |
| --- | --- | --- |
| Gear/gem quality, salvage/sale yields and shelf price | Data-driven crafting policy | Present the resulting prices |
| Expertise ranks, progress, tier-qualified study and first-rank ledger stamp | Crafting policy and action sequence | Own and durably persist the account |
| Eligible affix families, shared craft/socket capacity and minigame lift | Crafting policy | Authenticate minigame input and account features |
| Affix crafting, socket chiseling and Oracle rerolls | Ordered actions over borrowed item/wallet state | Station reach, live stat recalculation, presentation and save completion |
| Single/bulk salvage, keeper marks and protected-item filters | Ordered actions over borrowed inventory state | Authoritative inventory ownership and persistence |
| Skill socket recovery and memory-pouch sales | Action orchestration | Rebuild skill/support instances, place or spill returned supports, resolve memory kind |

Account expertise outlives a run; material wallets belong to characters. Those
must remain different owners. A sealed character can spend known expertise and
gain material, but its salvage cannot teach the account. The live progression
predicate is read after the material grant and again before account persistence.

The adapter must preserve item identity and callback order, including completed
work when a callback throws. These original methods are synchronous sequences,
not durable database transactions or automatic rollback. A future JSON facade can
add an owned draft/checkpoint boundary; it must not disguise an uncertain host
failure as an ordinary gameplay refusal.

## Observed rules that constrain the extraction

- Ordinary crafting checks eligibility and spends before rolling. Oracle rerolls
  roll before the affordability check; insufficient funds still consume those
  draws. Oracle results are locked against another reroll.
- Crafting a socket shares the affix budget. The extra-slot account feature adds
  one slot. Jewelry has no authored socket capacity; a keeper mark protects
  against salvage but does not itself forbid crafting.
- Craft rolls span the unlocked ladder with the original low-weighted base draw
  and score lift. Descending-value ladders and shared-roll lines retain their
  distinct arithmetic. Three authored affixes have no non-exquisite tiers and
  yield no crafted roll; their definitions are retained, not silently removed.
- The bench pays rarity-specific material and studies natural lines. The counter
  pays coarse material without study. Weak lines stop teaching after expertise
  passes them; crafted lines never teach.
- Worn gear is outside bag salvage. Single salvage refuses account relics, quest
  cargo and keeper marks. Bulk gear salvage also skips gem wrappers and memory
  pouches. Skill sweeps preserve granted sparks and use payload rarity; support
  sweeps preserve keeper marks. Empty sweeps still mark character state dirty.
- Single removal of a granted skill produces no material, but still returns its
  socketed supports. A full bag spills a returned support using the native
  support-drop shape and preserves its identity/level. Unknown skill payloads
  follow the original remove-without-yield behavior.
- Memory pouches cannot be broken at the bench; the counter purchases the whole
  stack. Bulk sweeps leave them alone.
- Presentation also consumes the original random stream. The observer records
  every draw and its callback context, so pure rule draws and host presentation
  draws can be distinguished without deleting either from the trace.

## Acceptance evidence

The policy capture includes all 3,929 authored affixes and 79 bases, 23,906 crafted
and rerolled results with draw counts, 16,042 study transitions, 108 gear-price
cases, 24 gem-price cases, memory pricing and ordered craft-option lists. The two
descending ladders, two shared-roll families, exquisite-only definitions and
unknown-definition fallbacks are observed explicitly.
Gear-price inputs deliberately combine authored lines and rarity flags to expose
each pricing term; roll and eligibility coverage is recorded separately.

The action capture contains 70 real-World courses with bag/worn ownership,
wallets, lore, ledger stamps, draws, callbacks, save observations, returned support
bodies and interruption state. Actual recalculation, material grants, support
placement/spill and serialization run. Station observations and the progression
predicate are controlled input ports. Browser storage and the save endpoint are
in-memory observers in the isolated process; no real save is written or sent.

Deliberate source faults run in a disposable source copy, with a fresh unchanged
control for both observers. A changed observation or an independent assertion is
a detection; process/parse/import errors are not. The receipt records each result.
Normal verification never regenerates accepted fixtures.

```text
npm run reference:crafting
npm run test:crafting-observer
```

The retained development failures document observer assumptions repaired against
the original implementation: exquisite-only affixes cannot always produce a
crafted line, text can consume random draws, rings cannot be chiseled, and a
spilled support is not a gear-wrapper drop. These were observation fixes, not
gameplay changes.

The first fault sweep also showed that a rarity-filtered skill sweep masked
removal of the granted-spark protection. The observer now exercises an unfiltered
skill sweep with multiple eligible gems, a granted gem and a locked gem as well.
The escaped fault and the corrected sweep are retained separately.

## Public composition

The optional entries are `@hollow-wake/engine/crafting` (numeric policy),
`@hollow-wake/engine/crafting/content` (validated definitions), and
`@hollow-wake/engine/crafting/actions` (ordered commands). They are absent from
the eager core import. Production code has no external dependencies or host APIs.

Construct one `ItemContent`, then `new CraftingContent(craftingPack, items)`.
The crafting pack declares the exact item content identifier. It owns a frozen
copy of tuning, essence definitions and prices while sharing the immutable item
catalogue; lazy eligibility pools preserve base order. `content.rules` supplies
all price, study, eligibility and roll operations. `content:crafting` builds a
separate `@hollow-wake/crafting` archive with a manifest and content hashes. The
compiler verifies accepted observations and a reviewed cost expression without
evaluating source strings. Smith/rune tuning remains metadata for a host UI.

An existing authoring host may instead call `createCraftingRules(ports)` with
trusted live definitions. The Hollow Wake adapter uses this route so existing
authoring mutations remain visible. This route does not validate or own content;
imported packs should use `CraftingContent`.

`new CraftingActions(rules, ports)` binds reusable host callbacks and can serve
multiple characters sharing its account binding. Bind a separate action service
for each account; immutable rules and content can still be shared. Its commands
are `craftAffix`, `craftSocket`, `rerollAffix`,
`salvageItem`, `salvageBulk` and `salvageLockSet`; `craftSlots` is a query.
The caller supplies the character context on each command. Item bodies, wallets,
account lore, skill/support instances and ownership remain borrowed. Ports provide
station/feature authority, explicit random draws, payment/grants, gem recovery,
recalculation, semantic presentation cues and account saving. No item or account
copy is retained. Random draws must be finite and in [0, 1); scores must be finite
when a roll is possible. The host authenticates requests and owns input validation.

Commands reject recursive use of the same action instance and always release the
guard after an exception. A thrown callback retains preceding payments, removals
and item changes. Account saves are synchronous notifications, not promises of
durability; a host must supply its own durable persistence boundary. Bulk salvage
snapshots targets before mutating the bag and saves account knowledge once.

The game installer verifies every replaced declaration against the accepted
source hashes before changing either file. It preserves unrelated imports and
content, refuses private-helper extensions that would be stranded, and uses the
shared two-file installer with conflict detection and rollback. Preparation and
fault tests use disposable copies; the original game is never edited.

```text
npm run test:crafting-package
npm run test:crafting-mutations
npm run adapter:crafting-source
node scripts/prepare-crafting-adapter.mjs --location .artifacts/adapter-location.json
npm run adapter:crafting
node scripts/test-crafting-installed-faults.mjs --location .artifacts/crafting-adapter-latest.json
```

The isolated consumer exercises the entire captured policy plus independent
action/ownership/content contracts, public TypeScript declarations and a browser
bundle under hostile globals. Deliberate runtime faults and actual game faults
must change an observed result or an assertion; unrelated process errors do not
count. Original observations and helpers are never regenerated by these checks.

## Measured desktop workload

`npm run benchmark:crafting` measures the installed runtime and separate content
archives in five fresh Node processes, after four warmups and with eleven samples
per workload. Run it with other CPU-heavy work stopped. On the recorded Windows
desktop, the median batches were 1.619 ms for 8,192 price operations (each queries
salvage, sale and vendor prices), 6.616 ms for 8,192 crafted rolls, and 24.099 ms
for 256 full option-list queries. Every sample retains the same result checksum.

Loading/validating the shared item catalogue took a median 145.627 ms; the
additional crafting pack took 3.581 ms. Their retained heap increase after explicit
GC was 12,989,000 bytes. This is not peak memory or allocation volume. These are
synthetic batches over authored data, with a warm filesystem cache, not a complete
frame, durable host transaction or hardware acceptance result. No predecessor
crafting speedup is claimed. The optional policy/action browser bundle is 9,733
bytes minified; it excludes the item catalogue and content compiler.

See [the retained runtime evidence](../evidence/crafting/runtime-windows.json)
for source hashes, all observations, package/installer/fault checks and raw samples.
The Windows/Linux CI workflow is prepared; its hosted runs remain unverified.

## Remaining completion gates

An owned engine-facing crafting session with item/wallet save continuation,
native editor packaging and renderer interaction acceptance remain separate work.
The [gem residence and item restoration baseline](gem-residence-boundary.md)
freezes the cargo, identity and migration semantics required by that session.
Measure complete crafting workloads before claiming an optimization; physical
Steam Deck and named older mobile acceptance remain required separately.

Vendor stock generation/buying, quest forge-writ work, vestige inlay and broader
item/account migration are additional extraction work. This baseline does not
claim those systems, an editor package, or a performance gain.
Validated in-memory content remains the runtime boundary; optional database
authoring/persistence follows [the existing storage decision](content-storage.md).
