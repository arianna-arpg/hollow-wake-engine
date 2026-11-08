# Hollow Wake local storage

Optional native SQLite save storage, with a C interface and a reusable C# binding.
The gameplay runtime does not depend on this library. The store commits two
opaque UTF-8 documents and a revision together; the game validates their meaning
and publishes a proposed gameplay change only after a successful commit.

This is a development candidate. Earlier single-record releases have separate
Godot and Unity qualification. The optional grouped-save extension needs its own
native and engine acceptance; do not infer it from those earlier packages.
ARM, physical-device budgets and physical power-loss behavior remain unqualified.
See the repository's portable save boundary and grouped-save evidence.

The C interface is declared in `hwe_save.h`. Include it when building a native
consumer; define `HWE_SAVE_SHARED` when linking the supplied Windows import
library. Copy the runtime library beside the host executable or use the host's
normal native-plugin loader. C# consumers compile `SlotStore.cs` and load the
same runtime library. Its implementation uses C# 8-compatible syntax and has
no engine or NuGet dependency. Each native handle has one host owner; the C#
binding serializes its calls and uses a SafeHandle for native ownership.

An empty slot has revision zero. Stage/commit and asynchronous submit/poll paths
use the same transaction rules. A stale writer reloads the latest state before
retrying a gameplay action. One pending request or unconsumed result occupies a
store. Cancellation succeeds only before commit is admitted; otherwise observe
the actual completion. Dispose after consuming completion during normal shutdown.
Forced close joins admitted work and can wait for storage.

Each document is limited to 512 KiB. Preserve map keys, safe-integer IDs,
fractional values and RNG state in the complete document. The returned C read
view is borrowed until the next read, close or destruction; the C# binding
returns owned strings. No gameplay objects, scene references or callbacks enter
the writer thread. Intermediate input bytes are not retained after return.

Keep the database and SQLite sidecars together during recovery; use SQLite's
backup facilities for live backups. This library uses local filesystem paths
and does not provide cloud synchronization or account authorization.

The optional version-1 group extension saves 1–8 distinct records together,
with a 4 MiB aggregate document limit. Query hwe_save_group_info_v1 before
calling its C functions; C# exposes SupportsGroupedSaves, ReadGroup, StageGroup
and SubmitGroup. Existing commit/cancel/poll operations handle its single token
or ticket. A group read returns one consistent snapshot in requested order.
Every borrowed view expires on any read. Group support does not change the
database schema or automatically coordinate account and inventory owners.
See docs/grouped-saves.md in the source repository for the complete contract.

Build from the pinned SQLite amalgamation identified by
`adapters/godot/local-save/sqlite-lock.json`:

```text
cmake -S native/save -B BUILD -DCMAKE_BUILD_TYPE=Release -DSQLITE_SOURCE=SQLITE -DHWE_OUTPUT=BIN
cmake --build BUILD --config Release
```

The repository builder verifies the pinned archive before extracting it, records
source and binary hashes, and removes compiler intermediates on success or failure:

```text
node scripts/build-portable-save.mjs --tools TOOLS_JSON --sqlite SQLITE_ZIP --output NEW_DIRECTORY
```

`TOOLS_JSON` supplies `cmake`, `ninja` and `python` executable paths. It does
not require a game engine. CMake 3.25+, a C++17 compiler and threads are required.
SQLite is public-domain software; the Hollow Wake code retains the repository
license. The package includes both notices.
