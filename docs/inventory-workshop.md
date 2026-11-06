# Inventory workshop

The workshop is a runnable Godot inventory screen backed by the standalone
crafting SDK. Forge a ring, sell a pack item, recover overflow, move an item
to the stash, or return it to a free cell. The profile keeps its random state,
next item ID, wallet, crafting lore and exact item bodies across restarts.
Pointer controls and keyboard navigation run through the same actions.

Choose the download for your platform and purpose.

| Archive | Use |
| --- | --- |
| hollow-wake-inventory-PLATFORM-x64.zip | Extract the folder and launch Inventory.exe or Inventory.x86_64. |
| hollow-wake-inventory-project-PLATFORM-x64.zip | Extract it and import project.godot into Godot 4.7.2. Both native addons and the authored definitions are included. |
| hollow-wake-local-save-PLATFORM-x64.zip | Copy addons/hollow_wake_save into your Godot project to use the optional local slot store. |

The example creates four pack items and one overflow item on first use. Its
two-by-two pack, 64-item stash, selling counter and starter recipe are host
choices. The game uses the SDK to generate items, fill random affixes, decide
placement, protect locked items and award sale proceeds. It keeps its save in
`user://inventory.sqlite3` under its own application directory.

## Equipment inspection

In the workshop, select an item in the pack, overflow or stash. Its detail
panel displays item-level and equip requirements, folded defenses, rolled
affixes and tier markers. Uniques, sockets and triggered effects add their
authored text. Long cards scroll independently of the inventory actions.

For JavaScript hosts, build the data-only item package with `npm run items:build`
and install it alongside `@hollow-wake/engine`. Supply the same ItemContent
instance used to mint and equip items. Load the vocabulary once per inventory
host. A standalone inspection accepts the item body from a save.

```js
import { ItemInspector } from '@hollow-wake/engine/items/inspection';
import terms from '@hollow-wake/items/inspection.json' with { type: 'json' };

const inspector = new ItemInspector(items, terms);
const card = inspector.inspect(candidate);
const changes = inspector.compare(candidate, worn);
```

Godot exposes the same results through `inspect_item` and `compare_items` on
the crafting wrapper. Inspecting requires no open profile. The workshop uses
the equipment card. Dedicated gem and memory-pouch cards, hero-specific
eligibility and an equipped-slot comparison selector are separate UI work.

Original-game observations cover 26,407 saved items and candidate/worn pairs.
Run `npm run test:inspection` after building the SDK to check the frozen
expectations. `npm run reference:inspection` replays the pinned game. The
54,540-byte vocabulary encodes repeated graft names once and reconstructs
all 3,931 reachable stat labels. Save data, combat content and rendering each
have separate ownership.

The exported Windows and Linux workshops each matched 12 detailed original
cards and comparisons while a second profile held 128 items and 3,929 lore
entries. Both exercised keyboard scrolling at 960×600. The embedded runtime
peaked below 30 MiB on this course and held zero tracked allocations after
close. These figures cover the rules runtime. Total device memory, frame
time, controls and battery life need measurements on physical hardware.
[Windows results](../evidence/item-inspection/windows.json) ·
[Linux results](../evidence/item-inspection/linux.json) ·
[Steam Runtime player replay](../evidence/item-inspection/steam-player.json)

To measure a Node host, build the SDK, stop other CPU-heavy work and run
`node scripts/benchmark-item-inspection.mjs NEW_REPORT.json`. The command
measures vocabulary setup and then five full passes per query. It reports
the median and 95th percentile of 64-item batch averages in microseconds per
item. Keep these numbers separate from native transport and rendering costs.

## Ownership and recovery

The host holds one published inventory revision. When a player moves an item
from overflow, the SDK hands back its complete body. The host prepares a new
crafting checkpoint and a stash containing that body. SQLite writes both
documents and advances the revision in the same transaction. The screen shows
the new state after commit. Returning an item uses the SDK's placement rules.
A full bag or stash preserves the prior owners.

Each action carries the selected UID and displayed revision. A second game
window can read the committed state. A competing write either gets the writer
lock and matches that revision or is refused. On a failed write the coordinator
reloads the durable slot before accepting another action. It never replays an
interrupted payment or transfer automatically.

On restore, the SDK validates the source profile against its authored content.
A temporary second profile validates the stashed item bodies and their UID
floor. The host checks for duplicate identities across the bag, equipment,
overflow and stash. The screen reads detached, read-only views. An incompatible
database, corrupt save or duplicate owner leaves the slot unavailable.

## Storage boundary

SQLite is optional host infrastructure. The native save addon links the pinned
SQLite amalgamation into one extension library. It uses two bounded UTF-8 text
fields in one row per save slot. The SDK's portable JSON codec preserves
binary64 values and item IDs. A staged write returns a token for immediate
commit or cancellation. The database uses an application ID, schema version
and synchronous EXTRA. A busy writer returns control to the host immediately.

This choice gives the sample a transaction across both owners. A full checkpoint
write has a size and latency cost. Other hosts may supply their own transactional
storage. Live database backups and migrations need their own policy. SQLite
describes the filesystem and device assumptions for atomic commits.
[SQLite atomic commit](https://sqlite.org/atomiccommit.html)

## Reproduce

Use the pinned native tool receipt, combined addon archive and desktop acceptance
receipt for the same platform. The command verifies the SQLite source digest,
compiles the save extension, imports the packaged source in a fresh project,
exports the game, and runs recovery and UI checks. Pass `--sqlite ARCHIVE` to
use a previously downloaded source archive. On Linux a virtual display can
provide the rendered test environment.

~~~sh
node scripts/verify-inventory-workshop.mjs --tools TOOLS_JSON --addon COMBINED_ZIP --addon-proof DESKTOP_PROOF_JSON --out NEW_DIRECTORY --render
~~~

The test kills a separate game process before SQL staging, with a live rollback
journal, and after commit before the UI receives the result. A new game process
loads the profile before an independent SQL reader compares every saved value
with the frozen original checkpoint. Other checks exercise competing processes,
a blocked commit, cancellation, full destinations, stale clicks, protected
sales, invalid ownership and unrelated databases. Rendered tests activate
Godot controls and capture the resulting viewport. Steam Runtime additionally
opens the shipped executable in the offline player image and checks the actual
loaded library paths.

The evidence covers process termination on the tested Windows and Linux file
systems. Physical power loss, Steam Deck controller hardware, mobile builds
and target-device save latency remain separate acceptance work.
[Workshop verification](../evidence/inventory-workshop/verification.json)
