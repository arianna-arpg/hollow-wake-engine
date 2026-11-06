# Gems and memory pouches

`@hollow-wake/engine/inventory/cargo-cards` projects a detached gem or pouch
into plain text, numeric prices, requirements and optional compatibility rows.
Use ordinary equipment inspection for gear. Pass the same skill progression
and crafting content instances the game uses for its transactions.

The local JS distribution includes five installable archives. Install the
engine, items, skill-progression, crafting and cargo-cards tarballs together.
Run `node node_modules/@hollow-wake/engine/examples/cargo-cards.mjs` for a
complete Firebolt example with verified range reads. Supply an item JSON file
as its first argument to inspect your own saved gem or pouch.

```js
import { CargoAtlas, CargoInspector } from '@hollow-wake/engine/inventory/cargo-cards';
import index from '@hollow-wake/cargo-cards/index.json' with { type: 'json' };

const atlas = new CargoAtlas(index, readVerifiedPage);
const inspector = new CargoInspector(skills, crafting, atlas.config);
const card = inspector.inspect(item, {
  inBag: true, attributes: hero.attributes, lane: 'sell', confirmMemorySale: true
}, atlas.read, equippedSupportFit);
```

Build the data-only package with `npm run cargo:build`. The page loader accepts
`(page, {offset, length, sha256})`. Read that byte range from the package's
`pages.txt`, verify its SHA-256 digest and return its UTF-8 text. The atlas
retains up to four decoded pages. Pass a third constructor argument from 1 to
4 to set a smaller cache. An asynchronous host can use `inspector.references(item)`
to prefetch the required pages before rendering. The caller resolves custody
and visibility before passing an item body. Unknown primary gem IDs return
`null`. Unknown socket and pin names, legacy cache addresses and unknown
monster provenance follow the original card's fallback rules.

Pass `createCargoFitReader(rules, supportById, equippedBar, crewOf)` to use an
existing SupportRules instance. The reader consults the current owner, skill
slots, rolled support and summon crew at query time. Compatibility and
remaining sockets are independent fields. An omitted reader leaves the bar
unspecified. A reader returning an empty array represents a known empty bar.
Omit attributes for a detached preview to leave each requirement verdict unknown.

Prices come from the crafting rules. The host controls the active salvage
lane, whether this item occupies the bag, sale confirmation preferences and
the final transaction. A granted gem can yield no essence. A stacked pouch
is sold whole. Pouch rows follow the first occurrence of each provenance and
promised-gem pair, while the newest label comes from the last unit.

## Godot

`crafting.inspect_cargo(item, view, fit_rows)` handles page selection, bounded
reads and digest checks. `set_cargo_page_limit(1)` selects the minimum cache.
Pass the active actor's socket-gate rows in slot
order, or omit them when the host has no actor. The workshop includes a
separate sample profile. Launch the player with `-- --cargo-sample` and select
the empowered skill, rolled support or a pouch. The sample preserves its own
save across restarts. It displays requirements without claiming a hero and
exposes sale actions through the crafting session.

The SDK returns the original skill showcase's skill ID, level and socketed
supports. Hosts own animation, input gestures and learning, recall or
socketing actions in their own UI.

## Reproduction

Run `npm run test:cargo-cards` after building the runtime. The fixture stores
the actual title, HTML body, metadata and source-side numeric observations
from the pinned game's inventory tooltip. The observer compares text in
order and checks requirement colors, full sockets, crew admission, pin
colors, sale prices and confirmation thresholds. `npm run reference:cargo-cards`
replays the source and tests the installed SDK's support rules on that bar.

The [installed consumer](../evidence/cargo-cards/installed.json) checks every
equipped-slot verdict in the source course. The exported workshop runs 25
specialized cases alongside a second, loaded profile. It checks damaged-page
refusal, canceled and stale quotes, one successful sale and post-close heap
accounting. [Windows](../evidence/cargo-cards/windows.json) ·
[Linux](../evidence/cargo-cards/linux.json) ·
[Steam Runtime player](../evidence/cargo-cards/steam-player.json).

To compare a single JSON file, a bounded page reader and a read-only indexed
SQLite table, use Node 24 and run
`node scripts/benchmark-cargo-storage.mjs NEW_REPORT.json` after building.
The workload measures opening the first card, reopening one card, alternating
among four bag items and browsing skill definitions. It verifies complete
answers across implementations before timing. Device flash reads, total game
memory, battery use and frame time need measurements on the target device.

On the reference Windows desktop, the four-page reader opened its first card
in 0.86 ms. Cycling the four sample items took 23.5 μs per card, versus
111.5 μs with a one-page cache. Eager JSON opened in 3.60 ms and handled
the broad catalogue browse in 14.4 μs per card. SQLite opened in 2.77 ms
and handled that browse in 148.5 μs per card. These are medians across seven
rounds with a warm OS file cache and the same fully verified outputs. The
Godot workshop uses four pages by default. Bulk tools can load the whole
catalogue, and hosts with tighter memory limits can select a smaller cache.
[Storage comparison](../evidence/cargo-cards/storage-cache-windows.json)

## A read-only SQLite catalogue

The optional `@hollow-wake/cargo-sqlite` package contains the same 2,595
display definitions in a database indexed by kind and ID. Its Node 24 host
adapter verifies the packaged file, opens it read-only and keeps one read
transaction open until closed. In the follow-up comparison, the SQLite
snapshot and four-page reader took 34.7 and 35.1 μs per card in the four-item
bag. Across the wider catalogue they took 35.3 and 173.5 μs. The page reader
opened the first card in 1.37 ms, versus 5.68 ms for the snapshot. The
database occupies 454,656 bytes. [Snapshot comparison](../evidence/cargo-cards/storage-snapshot-windows.json)

```js
import { openCargoCatalogue } from '@hollow-wake/cargo-sqlite';
const catalogue = openCargoCatalogue();
try {
  const inspector = new CargoInspector(skills, crafting, catalogue.config);
  const card = inspector.inspect(item, view, catalogue.read, equippedSupportFit);
  // Use the detached card in the host UI.
} finally {
  catalogue.close();
}
```

Other engines can open `cargo-display.sqlite3` read-only, use the configuration
in `catalog.json` and prepare `SELECT payload FROM faces WHERE kind=? AND id=?`.
The payload is UTF-8 JSON. Bind the reader's table and ID parameters and return
null for a missing row. Keep the published catalogue separate from player
saves. To rebuild it from the frozen source observations, run
`node scripts/build-cargo-sqlite.mjs NEW_DIRECTORY` after building the SDK.
Run `npm run test:cargo-sqlite` after `npm run reference:cargo-cards` to
compare the installed page and SQLite packages across the original items.
