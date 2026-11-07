# Inventory workshop

The [crafting station workflow](workshop-stations.md) adds durable gear affix
crafting, sockets, rerolls and salvage expertise to the Godot inventory. Quotes
use authored costs; current revision, station access and payment are checked
again on confirmation.

The workshop is a runnable Godot inventory screen backed by the standalone
crafting SDK. Forge a ring, sell a pack item, recover overflow, move an item
to the stash, or return it to a free cell. The profile keeps its random state,
next item ID, wallet, crafting lore and exact item bodies across restarts.
Pointer controls and keyboard navigation run through the same actions.

The standard build now qualifies the current main scene in the editor and a
fresh extraction of the player archive. Background-save contention, cancellation,
close and reopen, the 79-assertion station course, and inlay/save continuation
must pass before a delivery is recorded. These opt-in courses use separate,
marked test directories. The source archive includes the pinned original
station fixture so the exported player can run the same course.

Crash acceptance compares the exact checkpoint, stash and revision recovered
by the game and an independent SQLite reader before staging, after staging and
after commit. Journal byte counts are diagnostics: a small uncommitted WAL
transaction may still be in the page cache. Report fault tests reject lost
commits, partial uncommitted transfers, unobserved barriers and missing workshop
courses. The verification command also runs the existing rack, support, recall,
readonly-view and station fault courses against the delivered archive.
See the [fresh package evidence](../evidence/fresh-godot-package/README.md).
The verification command exposes the requested output folder only after all
checks pass. Choose a destination on the checkout's volume for the final
atomic rename; copy the accepted delivery elsewhere afterwards.

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
the crafting wrapper. Inspecting requires no open profile. Gems and pouches
use their [cargo card](cargo-cards.md).

### Comparing and wearing equipment

Select a ring in the pack and choose **Equip item**. Select another ring, then
**Compare with equipped** to see its changes against each occupied hand.
The next equip uses the first empty compatible slot. With both hands occupied,
the default is the first compatible slot in the authored order. The Equipped
tab lets you return a piece to the pack when it has space.

JavaScript hosts load `equipment.json` from the item package and construct
`new EquipmentSlots(pack)` from `@hollow-wake/engine/inventory/equipment`.
Call `inspector.inspectLoadout(item, equipped, heroLevel, slots, 'full')` for
ordered comparison sections. The default compact mode reports whether a
comparison is available and skips the worn modifier calculations. A worn
piece suppresses comparison by UID. The caller resolves the viewing seat and
ownership before passing item bodies, including shop and stash previews.

Bind the slots to an owned crafting session once with
`session.configureEquipment(slots)`. Send `{op:'equip',profile,uid,actorLevel}`,
with an optional `slot` for an explicit destination, or
`{op:'unequip',profile,uid,slot}`. A successful request returns
`result.changed`; a level or space refusal carries `result.refusal.reason`.
The host supplies the acting body's level for the action and the viewing
hero's level for the card. These can differ during possession. The workshop
uses level ten for both. Its SQLite save commits each successful transfer
under the revision the player saw. Displaced gear that cannot fit goes to
recoverable overflow. The live game can supply its own ground-drop callback.

Godot wraps these calls as `inspect_loadout`, `equip` and `unequip`. Slot
definitions load once on first use. All card and equipment decisions use
in-memory definitions. SQLite stores the completed inventory transaction.
The source observations are in `baseline/loadout-cards`. Reproduce them with
`npm run reference:loadout` and compare the SDK with `npm run test:loadout`.
Measure compact and full reads on a host with `npm run benchmark:loadout`.
The benchmark alternates modes over the same original cards with content loaded.

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

## Learned skills

Pass a `WorkshopRack` from `@hollow-wake/engine/skills/workshop-rack` as the
third argument to `new CraftingSession(definitions, maxProfiles, rack)`.
The Godot workshop package includes it. A successful first learn upgrades
a legacy save to version two. The save contains eight nullable skill payloads,
including socket rolls, empowerment and locks. A learned skill acquires an
item ID when it returns to the bag. The session rejects duplicate learned IDs
and incompatible save versions before opening the profile.

On a refused removal, a full pack still advances the next item ID. A refused
replacement can also move a wrapper to the end of the pack at its previous
coordinates. Save when the command returns `needsSave`. Commit against the
revision shown in the UI, and reload the winning revision on a conflict.
The sample rereads the relevant content page to apply its hero's attribute
requirements at the time of the action.

The session retains one validated, immutable account record per profile.
Inventory and rack commands can share its crafting lore. Salvage receives a
mutable copy and commits a new account after validation. All save limits
include the retained record at its actual nesting depth. Public snapshots are
detached and mutable. A storage host can call `snapshotText(profile)` in
JavaScript or `snapshot_text(profile)` in Godot to get the identical portable
JSON directly from the committed profile.

The data layout follows the access pattern. The original authored skill and
support definitions are shared by all profiles. Small pages supply descriptions
and requirements on demand. The workshop updates SQLite at inventory actions.
This keeps disk reads outside the combat tick. Blizzard describes normalizing
repeated spell effects into related records, and Factorio describes separate
prototype and runtime stages. These examples informed the separation of
definitions from live character state. Device timing still needs measurement.
[Blizzard](https://news.blizzard.com/en-us/article/21881587/dev-watercooler-world-of-warcraft-classic)
and [Factorio](https://lua-api.factorio.com/latest/index.html).

Reproduce the rack check with a pinned Godot tool receipt and the corresponding
0.53 inventory **project** ZIP. It packages the new SDK, reuses the verified
native libraries, runs all 56 retained legacy commands, operates the scene
controls and checks the committed save through an independent SQLite reader.
An optional fourth argument supplies the Linux Godot executable for the pinned
offline Steam Runtime Platform image. That run uses the Linux project ZIP.

~~~sh
npm run build
node scripts/verify-workshop-rack.mjs TOOLS.json PREVIOUS_PROJECT.zip OUTPUT
~~~

Append `--compare RACK_0.55_CANDIDATE_0_PROJECT.zip` to time complete, durable
skill moves against the verified earlier project. The runner reuses one project
with identical native libraries and content, alternates the builds across fresh
Godot processes, and compares the final SQLite rows through an independent
reader. Both the four-item sample and the 128-item profile with 3,929 crafting
lore entries are exercised. Run it with other benchmarks and builds stopped.

For a Linux x86_64 device, unzip the separate measurement player and run
`./measure.sh` from its directory in Desktop Mode. It uses the disk containing
`XDG_DATA_HOME` (normally `~/.local/share`), creates fresh test saves, and
removes them after the run. It prints the package hash, processor, per-action
times and peak embedded memory. Use `./measure.sh > result.txt` to keep the
measurements. Surface temperature, power profile and storage location matter
when comparing runs on a handheld.

To rebuild that player, append `--device-player PREVIOUS_LINUX_GAME.zip` after
the comparison argument in the Steam Runtime run. The builder reuses the
verified 0.53 Linux executable, native libraries and notices. It runs the
finished ZIP in the offline Platform image and checks its reopened saves against
the independent database reader. See the [desktop and Steam Runtime measurements](../evidence/workshop-account).

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
