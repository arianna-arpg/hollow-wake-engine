# Memory pouch verification

Both [Windows](windows.json) and [Linux](linux.json) include the checksums
of their standalone player, Godot project, add-on and JavaScript packages.
The Linux run used the pinned Valve Steam Runtime 4 image. Both used the
i9-10900K development machine.

## Original behavior

The original simulation ran twice for each [base capture](../../baseline/pouch-recall/acceptance.json)
and [interaction capture](../../baseline/pouch-interactions/acceptance.json).
The 3,024 cuts include the zero seed, maximum uint32 seed, monster kit and
tag preferences, two-axis and three-axis support rolls, all three
facets, purchased rarity ceilings, and terrain-specific drop floors.
The interaction capture combines a real boss with champion and crowned
provenance, floor and facet, two actor brackets, altered tag weights and
zero-weight choices. The initial game registry has 954 skill definitions.
Its ordinary draw list has 948 entries in a particular order.

Fifteen complete original actions supplied expected panel groups, grants,
refusal messages, bag order, item positions and progression receipts.
The headless JavaScript checks exercise all cuts and actions. Both Godot
hosts also run the 15 panel and action courses. A separate legacy save
demonstrates that a retired promise survives load and can resolve to a wild
draw. Admitted live gem levels retain their authored limits.

## Save and packaging

The original workshop save remains readable. The first successful recall
atomically wraps the crafting snapshot with the player's recall metadata in
the existing SQLite slot transaction. The fixture learns Firebolt to make
one free cell, recalls the first preformed unit, refuses a second writer
holding the old revision and recalls the last unit into the pouch's cell.
The editor and each exported release executable, exercised with a matched
test scene, produced the same digest of the four-revision fixture's final
inventory payload. A separate SQLite reader checked its integrity, counts,
positions, gem properties and lesson receipt. The shipped game boots in both
ordinary and support-sample modes and runs the recall measurement directly.

The [managed-package receipt](dotnet-windows.json) covers a separate Windows
x64 .NET 8 project that can be referenced directly by a C# host. Its neutral
JSON entry calls the same session implementation as Godot. The verifier packs
the archive and restores and builds both the supplied sample and an independent
consumer from the extracted archive, offline. It also publishes the sample
to a separate directory, verifies its shipped assets and executes it there
with the same result. The clean consumer compared
2,304 original draws and all 15 full actions, including import of existing
unlock sets and IDs above 32 bits. The loader rejected a modified rule bundle
and released all tracked heap allocations after the replay. Reproduce with
`node scripts/package-dotnet-pouches.mjs TOOLS.json VERIFIED_RELEASE_DIRECTORY`.
The [C# integration guide](../../adapters/dotnet/pouches/README.md) describes
the project reference and save handoff.

## Current game checkout

The [working-game comparison](current-game.json) records the observed source
hashes and uses the pinned original as a control for the relocated observer.
Two runs of the current checkout at `faf1ab3a` produced identical data.
All 3,024 sampled cuts and all 15 inventory actions matched the pinned
observations. The current checkout adds 14 skills excluded from ordinary
drops and one monster. Its complete recall data is available separately as
`pouch-content-working-game.json` beside the release packages. The public
JavaScript rules loaded that table and matched the original game's explicit
promises for every one of its 1,425 skill and support definitions.

The shipped Godot and .NET packages keep their pinned content identities.
The current game's panel also gives old cache addresses the label “Chest”
and unknown sources the label “Found in the world”. The pinned SDK panel
retains their saved IDs as labels. The optional table updates the definitions.
The current game's label policy and other skill and casting upgrades remain
separate. Reproduce the comparison from this checkout with
`node scripts/compare-pouch-game.mjs GAME_ROOT NEW_REPORT NEW_CONTENT_JSON`.

## Memory and reproduction

In an alternating four-load native comparison, the same executable, rules,
input and panel response used 5,085,607 versus 4,604,107 bytes of peak
evaluator heap on Windows. Linux measured 5,085,591 versus 4,604,091 bytes.
Letting the SDK parse its own content removes an extra object-tree copy
and saves **481,500 bytes** on both hosts. The content asset grows from
314,510 to 369,504 bytes before compression. Using DEFLATE at level six,
the two payloads measured 65,701 and 68,203 bytes with zlib framing.
Each evaluator released all tracked allocations on close.

Run `npm run verify` and `npm run reference:verify` for the source and
portable checks. `node scripts/compile-pouch-recall.mjs` reproduces the
shipped content. Pass `--out NEW_FILE` to write a fresh copy or
`--validate FILE` to check an authored table. The verifier checks registry
references, pool order and identity, valid fallbacks, roll axes, facets
and weights. Independent fault cases reject duplicate pool entries,
unknown floor skills, invalid probability and empty support axes.

On a Steam Deck, run `./Inventory.x86_64 --headless -- --measure-recall`
from the extracted player folder. This checks 66 outcomes and reports cold
and warm latency, CPU identity, peak evaluator bytes and bytes still live
after close. The recorded timings are desktop observations. Physical Deck
and older-mobile performance, and full Godot process memory, remain open.
