# Portable save boundary

The Godot slot-store implementation is extracted into an optional native
library. The separately qualified [Unity storage package](unity-storage.md)
now supplies durable workshop saves. The [grouped-save extension](grouped-saves.md)
adds atomic multi-record storage; its engine coordinator has separate acceptance.

The raw starting point is the accepted database implementation, sleeping writer,
and existing Godot/worker contract courses at commit
`1c1218d17d507a0d784919eb911936358c4a6b31`. Their exact source is preserved in
`baseline/portable-save/source.json.gz`; its manifest identifies every hash.
Neither that capture nor a successful C++ build establishes engine compatibility.

The core owns one SQLite connection, transaction tokens and a bounded writer.
Adapters own engine paths, user authorization, gameplay validation, UI publication
after a successful commit, and orderly shutdown. Two opaque UTF-8 documents and
their observed revision commit together. The database format, application ID,
revision limits and existing WAL/rollback choices must remain compatible.

Keep these observations during extraction:

- An empty slot has revision zero. Successful commits advance once; stale writers
  reload before issuing a new gameplay action.
- A staged write blocks further synchronous operations on its owner. A competing
  reader sees only committed state and another writer can receive busy.
- Each document is limited to 512 KiB of UTF-8 bytes. Arbitrary JSON map keys,
  fractional values and safe-integer IDs pass through without reserialization.
- One queued request or unconsumed completion occupies the writer. Submissions and
  polls do not wait for its disk work. The worker sleeps when idle.
- Cancellation admitted before commit prevents that commit. Once commit is
  admitted, the caller must observe its actual outcome.
- Closing cancels earlier work where possible, joins admitted writes, rolls back
  an uncommitted transaction, and invalidates old tickets without reusing them.
- Checkpoints report partial progress while readers retain snapshots. Database
  identity is checked before journal conversion.

A C interface carries explicit byte lengths and fixed-width numbers, with
owned instances and no engine objects or callbacks on the writer thread. The
Godot adapter and engine-independent C# binding translate this shared contract.
Each engine integration has its own lifecycle acceptance. SQLite remains an
optional save dependency; authored gameplay definitions remain separately loaded
runtime data.

The new C interface rejects malformed UTF-8 and embedded NUL in paths rather
than permitting encoding replacement or filename truncation. It uses native
absolute-path rules and a 128 KiB path-input limit before allocation. These are
explicit boundary rules for the new interface, not authored gameplay changes.
Database documents remain opaque; JSON validation belongs to the game. An early
write-eligibility check avoids document conversion while the owner is occupied,
and the actual write repeats admission before changing anything.

Acceptance requires the existing Godot courses against both original and extracted
implementations, native caller contracts, barrier/fault controls, fresh Unity
editor and relocated-player save/restart courses, and exact inventory/RNG
continuation. Injected stale writes, cancellation, storage failures and interrupted
transactions must produce the intended refusal or recovery. A process-kill course
does not establish physical power-loss or mobile storage behavior.

The design follows SQLite's [atomic-commit boundary](https://www.sqlite.org/atomiccommit.html)
and [WAL concurrency/checkpoint contract](https://www.sqlite.org/wal.html), and
Unity's [C interface for native plug-ins](https://docs.unity3d.com/2021.3/Documentation/Manual/NativePlugins.html).
The existing pinned SQLite 3.54.1 is newer than the WAL-reset fix documented in
3.51.3. No SQLite version change is part of this extraction.

## Reproduction and qualification

One intentional correction extends the original worker's thread-start recovery
to allocation failures. Previously, an allocation exception could escape with a
queued request and no worker. A refused start now clears the request and returns
`worker-unavailable`; a subsequent submission can proceed. A disposable-header
test injects both allocation and OS thread-start failures, checks that no backend
write occurred, and then commits one retry through a real thread. Restoring the
old catch clause must make that test fail. The frozen original source remains
unchanged.

The standalone builder needs installed CMake, Ninja, Python and a C++17 compiler.
The focused hosted workflow supplies Windows x64 and Ubuntu x64 jobs, a pinned
SQLite archive and .NET 8. It does not install a game editor or JavaScript runtime
dependencies. Run the same preparation and checks locally:

```text
node scripts/prepare-portable-save.mjs --cmake CMAKE --ninja NINJA --python PYTHON --output NEW_TOOLS
node scripts/build-portable-save.mjs --tools NEW_TOOLS/tools.json --sqlite NEW_TOOLS/sqlite.zip --output NEW_DELIVERY
node scripts/test-portable-save.mjs --sqlite NEW_TOOLS/sqlite.zip --python PYTHON --output NEW_REPORT.json --library NEW_DELIVERY/build-receipt.json --mutations --managed
node scripts/test-save-worker.mjs NEW_WORKER_REPORT.json --mutations
```

The consumer test checks the exact delivered binary and its recorded source
hashes. Its independent C caller checks layout, bounds, malformed UTF-8, borrowed
views and owned asynchronous inputs. The C# caller checks real native calls and
exact document round-trips. All expected C exports must exist and SQLite exports
must remain private. Linux additionally rebuilds SQLite, the core and C interface
with address and undefined-behavior instrumentation; these instrumented tests
are separate from the Release delivery.

The original-vs-extracted Godot comparison uses an accepted archive hash and a
fresh build receipt:

```text
node scripts/test-portable-save-godot.mjs --tools GODOT_TOOLS.json --original ACCEPTED_ADDON.zip --sha256 ACCEPTED_SHA256 --library GODOT_SAVE_BUILD.json --output NEW_EVIDENCE
```

It runs both implementations through the existing SQLite observations, compares
all synchronous results except timing samples and archive identity, and then
checks the extracted asynchronous implementation in the actual editor. Test and
compiler scratch directories are removed on failure as well as success.
Delivery directories and evidence are retained intentionally.

The two-document limit and single queued write bound admitted work. They do not
establish a total process-memory budget or storage latency on Steam Deck, ARM or
older phones. No new speedup or hardware-support claim accompanies this extraction.
