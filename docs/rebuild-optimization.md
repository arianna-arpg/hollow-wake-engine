# Character rebuild copying

Version 0.14.1 changes internal object construction in the shared validated copier.
Public APIs, content schemas and gameplay policy are unchanged. The runtime still
rejects cycles, executable values, nonfinite numbers and nonplain object records.

## Decision and preserved behavior

CPU sampling of complete character rebuilds identified passive-grant construction,
modifier copies and the shared recursive copier as substantial costs. The final
change reuses the detached tuples from `Object.entries`, recursively validates and
copies their values, then constructs the result with `Object.fromEntries`.
This removes one explicit property-descriptor object and one `defineProperty` call
per copied property. It does not remove validation, retain caller data, cache mutable
host state or assume a database will speed up in-memory character calculations.

The copier preserves own enumerable string-key order, explicit undefined values,
sparse array holes, negative zero, ordinary output prototypes and writable data
properties. Shared noncyclic inputs become independent copies as before. Parent
getters are read once before child traversal. Prototype-named keys remain own data;
inherited setters are not called. Symbol keys and nonenumerable fields retain their
existing omission behavior; symbol values are rejected. Item-batch snapshots still
complete before capturing an accumulator, including the existing behavior of reads
that synchronously perform another build operation.

The earlier `Object.assign` modifier experiment was not selected because assignment
can invoke inherited setters. Private mutable modifier templates added retained
copies without a meaningful measured whole-rebuild improvement. A specialized
item-schema copier was also considered; the shared construction change achieved a
useful gain with a smaller semantic and maintenance surface. Experimental files are
retained as evidence, not additional shipped implementations.

## Whole-game measurements

`npm run benchmark:rebuild -- --previous-adapter <retained-v0.14.0-game>` compares
the original game, retained v0.14.0 adapter and current adapter in one process.
The runner verifies original source hashes, identical game source in both adapters,
current installed package bytes and that only the expected validation module differs
between SDK controls. Build the SDK and prepare the reference/current adapter first;
stop other CPU-heavy work before measuring.

Each sample performs 117 complete `World.recalcPlayer` calls across 39 recorded
class allocation states. Authored rare gear is supplied directly to the static
loadout; this is a rebuild test, not a test of acquiring or legally equipping it.
Six warmups precede 25 samples with rotating implementation order. Every class's
attributes, conduits, ordered stat sources, life and mana are compared outside timing
after every batch. Setup, receipt serialization and those additional verification
rebuilds are excluded from timing. Timed batches also require identical checksums.

Median milliseconds per batch on Windows, Node 24.9.0, Intel i9-10900K:

| Static loadout | Original | v0.14.0 | v0.14.1 |
| --- | ---: | ---: | ---: |
| One rare Lapis Ring | 6.2275 | 9.2268 | 8.8095 |
| All nine enabled equipment slots | 8.0321 | 20.6318 | 16.6655 |

The larger loadout improves about 19% relative to v0.14.0; the smaller case improves
about 5%. Both remain slower than the original game. These are local observations,
not device guarantees. Raw samples and the unchanged derived-state hashes are in
`evidence/milestone-seventeen/rebuild-benchmark.json`. No sustained frame pacing,
allocation volume, peak/retained heap or Steam Deck/mobile result is claimed.

The existing selected-contact benchmark also retains matching checksums. It compares
a narrower SDK contact capability to the original full-game contact path; its large
historical ratio is not a speedup caused by this copying change.

## Verification

Run `npm run verify`: 140 tests, 28 behavioral fault controls and six packed consumers.
New independent contracts cover recursive ownership, field order, descriptors,
getter sequencing, invalid input and prototype-named keys. Omitting nested copies
and changing construction to setter-invoking assignment must both be detected.

All ten installed-game adapter checks run sequentially because they temporarily
alter installed modules to prove delegation. The grant course compares 4,103 original
rebuilds and eight live content-refresh phases. Original reexports, game types and
smoke, Inventory/storage courses, passive/editor courses and launcher boot complete
the local acceptance work. The exact revision also runs the existing Windows/Linux
CI matrix. The package remains within all existing size ceilings; no budget was raised.

The first renderer run passed all 187 Inventory checks but stopped at the Oracle
course's next-life commander lookup. The unchanged course passed on a subsequent
diagnostic run and on the retained release. Investigation found that it never
awaited the game's public `__game.hydrated()` promise. A controlled delayed settings
response, using unchanged renderers from both releases, demonstrated that disk
reconciliation can erase the course's initial account ledger. Awaiting hydration
preserved that setup. This establishes a real readiness defect consistent with the
observed failure; the initial run did not capture enough state to prove its exact
cause. The test-only `oracle-navigation-and-readiness/v2` revision now awaits that
promise after each of its three page loads. All original gameplay assertions remain.
The initial failure, controlled negative/positive results and revised courses are
retained under `evidence/milestone-seventeen`.

Further character-rebuild costs, the remaining gameplay extraction families, native
engine packages and device validation remain tracked in `docs/completion.json`.
