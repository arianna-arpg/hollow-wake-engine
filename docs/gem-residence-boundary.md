# Gem residence and item restoration

Version 0.47 adds optional `inventory/gems` and `items/restoration` entries for
the persistence seam needed by the owned crafting session. Their isolated game
adapter matches the immutable pre-extraction baseline below. They supply portable
policies over explicit host services. The [owned crafting session](crafting-session.md)
now supplies bounded strict admission and command transactions; its native
engine package remains separate work.

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

`createGemResidence` accepts explicit definition, instance, tree-validation,
identity, item-restoration and geometry services. `createItemRestoration` supplies
the common envelope policy through live base/affix/unique/vestige, socket-cap,
identity-floor and choice-repair services. Existing skill-tree and item-choice
policies can provide those services; no duplicate catalogue is loaded here.
Neither entry is imported by the core runtime. The policies retain their port
objects, so callers own their lifetime and any live authoring changes.

Packing helpers are also standalone exports. The game adapter replaces 19 public
gem helpers and common item restoration after checking 23 original declaration
hashes, including constants and the removed private socket helper. Both files
are preflighted before installation; rollback preserves concurrent host edits.
Unrelated imports, host extensions and line endings are retained.

These services operate on well-shaped records with side-effect-free field reads.
Definitions and factories must
return coherent identities and supported rarity/level shapes. Ports are
synchronous. Minted wrapper IDs must be positive safe integers; invalid allocator
results throw after that allocation attempt. The implementation has no process-
global registries, random stream, UID counter or bag source. Its callbacks retain
the original lookup and write ordering. A thrown callback leaves earlier affix or
payload mutations and consumed identities in place. No durable transaction is
implied by this borrowed-state interface.

The owned session validates and detaches external input before invoking that
layer. It owns item identity, wallet/account state, saved support cargo and
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

The installed package matches all 3,847 courses. Twelve independent contracts
check identity, live lookups, failure effects and isolation in a fresh package
consumer. Thirty deliberate runtime faults and eight installed-game faults are
detected, with restored controls. Twelve installer scenarios and all 23 guarded
declarations are checked. The Windows/Linux workflow also reproduces these paths;
hosted results are a separate gate.

```text
npm run test:gem-residence-package
npm run test:gem-residence-mutations
npm run adapter:gem-residence-source
node scripts/prepare-gem-residence-adapter.mjs --location <predecessor-location.json>
npm run adapter:gem-residence
npm run adapter:gem-residence-faults
```

The optional files are 7,599 and 1,286 bytes of unminified JavaScript, with separate
10 KiB and 3 KiB growth limits. Earlier module budgets are unchanged. The browser
bundle is 5,428 bytes and runs the same 12 contracts with ambient RNG and host APIs
disabled. These are package-size and correctness checks, not throughput, peak
memory, native-engine or physical-device measurements.

Remaining work: native/editor package exposure; renderer interaction;
complete session resource measurements and
physical Steam Deck/older mobile measurements.

The [runtime evidence](../evidence/gem-residence/runtime-windows.json) records
the installed traces, package contracts, faults, fresh preparation, full checks
and preservation receipts. Earlier original observations are unchanged.
