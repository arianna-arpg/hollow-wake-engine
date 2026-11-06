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
