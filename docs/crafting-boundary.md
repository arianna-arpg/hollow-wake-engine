# Crafting and salvage extraction boundary

This is an accepted original-behavior boundary, captured before a crafting SDK
implementation. The production runtime is unchanged. Item generation and modifier
compilation already live in the SDK; the following account/character operations
are the next complete extraction path. Its acceptance record is
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

## Next implementation and completion gates

1. Compile the recorded tuning into validated immutable data, using the existing
   immutable item pack as an explicit dependency. Do not evaluate captured source
   text or duplicate the full item catalogue per character.
2. Extract policy and action orchestration behind explicit state, random,
   authority, presentation and persistence ports. Keep eligible affix pools bounded
   by authored bases and retain source order.
3. Install the package into an isolated game adapter and replay these exact
   observations, plus independent invalid-input/ownership tests and deliberately
   broken installed implementations.
4. Expose a complete engine-facing path with item and wallet continuity, then
   measure real workloads before claiming an optimization. Physical Steam Deck
   and named older mobile acceptance remain required separately.

Vendor stock generation/buying, quest forge-writ work, vestige inlay and broader
item/account migration are additional extraction work. This baseline does not
claim those systems, a crafting SDK, an editor package, or a performance gain.
Validated in-memory content remains the runtime boundary; optional database
authoring/persistence follows [the existing storage decision](content-storage.md).
