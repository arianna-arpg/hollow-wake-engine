# Local save slots

HollowWakeSlotStore provides a local SQLite database for a Godot host. The build
statically links SQLite 3.54.1 from the source archive pinned in sqlite-lock.json.
SQLite source is in the public domain. See https://sqlite.org/copyright.html.
The Hollow Wake code retains the SDK's license.

Open an absolute local file path. Slot numbers range from 0 through 65535.
read_slot returns revision zero for an empty slot. stage_slot takes the observed
revision and two opaque UTF-8 JSON documents of up to 512 KiB each. The host
validates their gameplay meaning. Hold the returned token only for the immediate
commit_slot or cancel_slot call. Closing a handle discards an uncommitted write.
Each successful commit advances the revision exactly once. A busy or stale
writer must reload and present the current state before the player acts again.

The store uses SQLite transactions and synchronous EXTRA on local storage.
New databases use SQLite's default rollback journal. Keep SQLite's journal
files with the database during recovery. Use SQLite's backup facilities for
live backups. The database carries an application ID and schema version.
