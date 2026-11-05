# Gem residence and item restoration

This is the pre-extraction baseline for the persistence seam needed by the owned
crafting session. It records the pinned original game, without adding a new
production capability or changing an accepted fixture. Crafting currently uses
host-provided gem reconstruction and recovery; this seam must become portable
before a complete crafting session can be packaged for another engine.

## Observed contract

The original `engine/gemitems.ts` wraps loose skills and supports as inventory
items, packs equipment-granted skills, and restores persisted cargo. The captured
`itemgen.rebuildItem` restores the common item envelope first. The observations
cover all 954 skills, 457 supports, 132 trees, 79 item bases and six unique items
with choice groups, across 3,847 named courses.

- A skill wrapper preserves level, rarity, valid legendary empowerment,
  replenishment pause, granted status, attunement, ordered tree ranks and every
  socket row. A legendary skill uses the item rarity `unique`. Top-level locks
  belong to the wrapper; socketed supports retain their own locks.
- Packing copies socket arrays, saved support rolls and tree ranks. Unpacking
  retains live definition identities but detaches saved support rolls. Temporary
  skill markers, support gauges and forwarded-support state do not survive.
- Loose skill restoration retains the saved socket count, including zero. An
  unknown socketed support becomes an empty socket. Unknown attunement and
  invalid tree picks are removed when unpacking, not when rebuilding a wrapper.
- Equipment-granted skills restore only the new grant's socket capacity. Their
  tree restoration uses the normal level budget without the loose skill's
  empowerment context. Empty saved tree lists leave existing grant picks alone.
  This is observed behavior, not an endorsement of merging the two policies.
- Reading one support from a stored skill requires a nonnegative safe integer
  index and an own-property support lookup. It never normalizes other cargo.
- Support write-back replaces the payload and name, preserves wrapper identity
  and other fields, and deletes a cleared lock instead of storing `false`.
- Bag queries retain source order and item identity. The legacy free-cell query
  subtracts each placed item's area, including overlapping items, and reads the
  live width and height separately. It is not an occupancy validator.
- Unknown item bases or unique definitions reject an item before advancing the
  UID floor. Known-base wrappers advance the floor before gem validation, so an
  unknown gem can be discarded while still reserving its former UID.
- Common restoration filters retired affixes, clamps their tiers, trims sockets
  to the current base-category capacity and clears retired vestiges. It repairs
  unique choices deterministically. Empty socket arrays are removed.
- Native common restoration copies the envelope and affix list, but mutates and
  retains accepted affix objects. Implicit rolls, gem cargo, memory units and
  equipment-grant cargo remain borrowed. Gem rank normalization can therefore
  mutate the supplied saved payload. Restored gem names use live definitions.
- The legacy UID floor tolerates finite fractional inputs by flooring them.
  This is distinct from the SDK-owned item allocator's safe-integer contract.

These observations exercise well-shaped typed data and specific legacy field
omissions. They do not establish safe ingestion of arbitrary JSON, accessor
objects, cycles, inherited registry keys in every helper, or unbounded data.

## Extraction boundary

The low-level compatibility layer will accept explicit definition, instance,
tree-validation, identity and geometry services. It must preserve borrowed
identity and the order of writes where the original game relies on them. Shared
registries and process-global UID or bag state are not permitted in the portable
implementation.

The owned session must validate and detach external input before invoking that
layer. It will own item identity, wallet/account state, saved support cargo and
random continuation together. A failed validated session command must not commit
partial state or reused IDs. It must explicitly distinguish strict admission
from tolerant migration against revised content; compatibility changes require
their own decision and tests. Durable disk/network transactions remain the host's
responsibility.

Content IDs and metadata should compose with the existing item, skill-progression
and support catalogues. A database may serve authoring or durable storage; these
small synchronous policies operate on validated in-memory content as recorded in
[the content/storage decision](content-storage.md). No database migration or
performance improvement is claimed here.

## Reproduction and acceptance

```text
npm run reference:gem-residence
npm run test:gem-residence-observer
node scripts/test-reference-gem-residence.mjs --game <isolated-installed-game>
```

The original-only helper calls the real source implementation. Independent
assertions check copied versus borrowed identity, lock ownership, transient
omissions, capacity differences, name refresh, retired IDs and UID sequencing.
Ambient randomness is disabled after original-game initialization; deterministic
unique repair still uses its native private seeded stream. Two fresh captures
must agree before acceptance.

The source-fault runner mutates disposable original copies and requires an
observed difference or an assertion failure. Syntax/import/process errors are
not successful detection. Clean controls run before and after the faults, and
the pinned source is checked again. Accepted observations are immutable and normal
verification only compares them. The baseline and evidence are recorded in
`baseline/gem-residence/acceptance.json` and
`evidence/gem-residence/baseline-windows.json`.

Remaining work: portable runtime and installed-game delegation; strict owned
crafting save/restore and recovery; native/editor package exposure; renderer
interaction; bounded resource tests and physical Steam Deck/older mobile
measurements. Windows reference evidence is not native or device acceptance.
