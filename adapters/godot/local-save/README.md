# Local save slots

HollowWakeSlotStore provides a local SQLite database for a Godot host. The build
statically links SQLite 3.54.1 from the source archive pinned in sqlite-lock.json.
SQLite source is in the public domain. See https://sqlite.org/copyright.html.
The Hollow Wake code retains the SDK's license.

Copy the release's addons/hollow_wake_save directory into a Godot 4.7 project.
Instantiate HollowWakeSlotStore from GDScript. This extension needs its native
library and descriptor. Its API stores opaque documents, so any game can supply
its own validated save format.

Open an absolute local file path. Slot numbers range from 0 through 65535.
read_slot returns revision zero for an empty slot. stage_slot takes the observed
revision and two opaque UTF-8 JSON documents of up to 512 KiB each. The host
validates their gameplay meaning. Hold the returned token only for the immediate
commit_slot or cancel_slot call. Closing a handle discards an uncommitted write.
Each successful commit advances the revision exactly once. A busy or stale
writer must reload and present the current state before the player acts again.

The store uses SQLite transactions and synchronous EXTRA on local storage.
For interactive saves, save_slot_async accepts the same arguments as stage_slot
and returns a ticket. Poll that ticket with poll_save on later frames. A pending
reply has pending=true; a completed reply has pending=false and the actual
transaction result. Completion is consumed once. A stale or unknown ticket
cannot consume another request.

One request or unconsumed result occupies the store. Further submissions and
synchronous slot/checkpoint calls are refused while it is occupied. Concurrent
synchronous operations also fail promptly instead of waiting on a store lock.
The worker sleeps between writes and receives owned UTF-8 documents and numbers;
gameplay code and Godot objects stay with the host.

cancel_save accepts a ticket until COMMIT is admitted. An accepted cancellation
prevents that commit; polling reports cancellation or an earlier staging error.
Once COMMIT is admitted, cancellation returns too-late and the host must observe
its actual result. close_file cancels earlier work when possible, waits for an
admitted commit, and invalidates its ticket. Poll before normal scene departure
to avoid making shutdown wait for storage. Destruction also joins the worker.
Tickets remain distinct when the same store object is reopened.

Opening a validated slot database selects write-ahead logging. This includes
older slot databases using rollback journals. The optional second argument to
open_file accepts "wal" (default), "rollback" or "preserve". The returned journal
field reports the actual mode. A busy conversion fails and closes the handle.
The host can retry opening after the competing connection releases its lock.

checkpoint performs a passive checkpoint and reports frames, copied and complete.
It can finish partially while another reader holds an older snapshot. Schedule
explicit checkpoints at idle points. SQLite also performs its default automatic
checkpoint after 1,000 WAL pages and a final checkpoint when the last connection
closes. A long-lived reader can delay reclamation and allow the WAL to grow.

Keep SQLite's WAL, shared-memory and journal sidecars with the database during
recovery. Use SQLite's backup facilities for live backups. The database carries
an application ID and schema version, checked before selecting a journal policy.
In rollback mode checkpoint returns -1 for both frame counts.

Build from source with CMake 3.25 or newer, a C++17 compiler, Python, godot-cpp
bindings for Godot 4.7, and the SQLite amalgamation identified by sqlite-lock.json.
Verify the archive's SHA3-256 before extracting sqlite3.c and sqlite3.h.

```text
cmake -S adapters/godot/local-save -B build -DCMAKE_BUILD_TYPE=Release -DGODOT_CPP_SOURCE=GODOT_CPP -DSQLITE_SOURCE=SQLITE -DHWE_OUTPUT=OUTPUT
cmake --build build --parallel 4
```

The local build profile includes RefCounted and the OS class used by godot-cpp's
diagnostic output.
Package the resulting library under addons/hollow_wake_save/bin with
store.gdextension and the Hollow Wake, godot-cpp and SQLite notices.

The standalone verifier creates an empty Godot project, loads the addon and
checks transactions, competing writers, older saves and checkpoint progress.
It removes its disposable project and databases on success or failure.

```text
python -I -B scripts/check-slot-addon.py GODOT_EDITOR ADDON_ZIP SCRATCH_DIRECTORY OUTPUT_JSON
```

Use absolute paths and a fresh output filename. The verifier uses the
companion test/godot-inventory/wal-storage.gd driver.
