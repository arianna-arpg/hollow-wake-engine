# Vestige inlays — 0.59.0-candidate.0

The installed SDK handles vestige pickups, satchel spending, first-empty and explicit socket placement, destructive replacement, worn-item recalculation and epitaph activation. The Godot inventory exposes those actions and persists their resulting owners in a revision-checked SQLite transaction. The standalone sample makes Held Breath on a legitimately forged two-socket helmet.

## Accepted evidence

- `world.json` identifies the SDK archive and frozen original source. Two independent captures agreed. The installed adapter matched all 46 original action courses, including interrupted hooks and same-UID resolution. An intentionally missing debit was detected in 26 courses.
- The catalogue matched 140 category-specific effect results and 1,600 epitaph checks. Its 14 vestiges and 10 epitaphs occupy 7,858 bytes of standalone content.
- `godot-windows.json` and `godot-linux.json` identify the actual project, addon and player archives. Both the editor and relocated shipping player passed the inventory course and reopened its result in a second process. Stale writers, legacy saves, full sockets and worn items are exercised by the course.
- Both platforms produced save checksum `66bb3ad2c7f5ae4d80a1a6255a30ecdd52c1e5b8d987eafe7f52d8010b99a952`. The final revision is 5, the helmet holds Thal and Sylph, and each of Morren, Sylph and Thal has one remaining satchel entry.
- `checks.json` records successful full verification, source verification and contact benchmarking. The full run passed 1,574 tests. All seven 20,000-contact replay rounds had equal original and extracted checksums. Contact timings describe that isolated workload on this desktop.
- The source-free crafting bundle occupies 112,776 bytes. The existing base-session size gate passes. The vestige module is an optional package entry point.

The exact accepted SDK SHA-256 is `cd7eee90db198eb1f3f3a61f2e5bb6adc8a221ae7e5c7f5d4ccab1f9d6f48d8d`. All seven deliverable archives were rehashed against their receipts before recording this milestone.

## Authored socket limits

The pinned ordinary forge can produce equipment for Wakeward, Still Waters and Held Breath. Seven epitaphs require more sockets than that forge permits in every eligible category. Those are Pyre Song, Gravebound Choir, Herald of Dawn, Following Wind, Wuthering, Scalding Grip and Terrace Stair. The original item restoration also caps socket arrays by category.

All ten authored recipes are represented and their matching rules are verified. The example uses Held Breath. Supporting the other seven through ordinary forging requires an explicit authored balance decision. Scripted equipment and custom hosts have their own creation boundaries.

## Save-cost experiment

The Intel Core i9-10900K desktop ran the actual archived Godot profile and native SQLite store. Each platform used four fresh databases in DELETE, WAL, WAL, DELETE order. Each case performed eight warmup inlays and 32 measured inlays. Each action explicitly overwrote a socket, spent one stone and durably saved. The native store requested synchronous=EXTRA in both modes.

| Filesystem and journal | Median full action, paired runs | Median commit, paired runs | Median work outside stage/commit |
| --- | --- | --- | --- |
| Windows D drive, DELETE | 141.90 / 141.54 ms | 139.62 / 139.18 ms | 1.50 / 1.49 ms |
| Windows D drive, WAL | 33.30 / 33.55 ms | 31.57 / 32.03 ms | 1.55 / 1.45 ms |
| Linux container overlayfs, DELETE | 10.43 / 9.96 ms | 8.96 / 8.54 ms | 1.30 / 1.30 ms |
| Linux container overlayfs, WAL | 4.01 / 4.02 ms | 2.66 / 2.67 ms | 1.26 / 1.23 ms |

`storage-windows.json` and `storage-linux.json` retain every sample and separate staging, committing and remaining work. The remaining work includes the SDK transaction, serialization and Godot bridge. The measurements attribute the largest observed delay to persistence. The initial platform acceptance timings ran alongside verification and used a Windows-mounted directory for Linux. The separate storage experiment ran after that verification and used the container's Linux filesystem.

Every case also killed an owned child process at two exact boundaries. Termination immediately before COMMIT recovered the previous revision and exact save bytes. Termination immediately after COMMIT recovered the spent stone and new socket together at the next revision. SQLite integrity checks passed after both interruptions. The measured final save checksum is identical in all eight runs, `10d72c0ee3fae2fe89cfaaa7aa6afd6931a8e44c6f04170994f6084154a4a431`.

The candidate's shipped save policy uses DELETE/EXTRA. WAL/EXTRA merits the next persistence experiment, including checkpoint costs, long-lived connections and contention. SQLite documents its append-and-checkpoint behavior and the synchronization settings. [SQLite WAL](https://www.sqlite.org/wal.html), [SQLite synchronization](https://www.sqlite.org/pragma.html#pragma_synchronous)

The controlled Linux probe uses direct native-extension registration in its disposable source fixture. Editor import in that Linux-native temporary location failed inside Godot with `Index p_index = 1 is out of bounds (size() = 0)`. The separate packaged-project acceptance successfully imported and ran its editor and shipping player on the Windows-mounted Linux test directory. The storage probe loads the archived profile and libraries through the generated extension list. Godot's manager reads that list at startup. [Godot extension loader](https://github.com/godotengine/godot/blob/master/core/extension/gdextension_manager.cpp)

Process-interruption coverage is limited to these transaction boundaries. Power-loss tests, physical Steam Deck and older mobile measurements remain open. Container filesystem timings describe this desktop environment.

## Reproduction

Run `npm run verify`, `npm run reference:verify` and `npm run benchmark` in the prepared SDK checkout. Stop other CPU-heavy work for the benchmark. Run `npm run reference:vestiges` for the original-source boundary and installed-consumer comparisons.

Use `scripts/verify-vestige-workshop.mjs` with the verified 0.59 release directory, 0.57 workshop donor directory and existing Godot tools receipt. Its optional final argument selects the pinned Linux editor. It verifies donor hashes, builds from the installed SDK and exercises the actual shipping player.

Run the storage probe with absolute paths and a fresh output filename.

```text
python -I -B scripts/measure-vestige-storage.py EDITOR DRIVER PROJECT_ZIP SCRATCH OUTPUT_JSON PROJECT_SHA256
```

DRIVER is `test/godot-inventory/vestige-storage.gd`. The Linux-native fixture adds `--register-extensions`. Use the pinned Steam runtime digest from `godot-linux.json`, disable network access and place SCRATCH inside its writable Linux filesystem. Temporary profiles, databases, sidecars and Godot caches are owned by the probe and removed on success or failure.

## Scope and retention

This milestone is a local candidate. The publishing boundary requires a new approved path for later authored content and original traces following the earlier automatic-review rejection. The existing public repository approval for v0.22 is recorded separately.

The broader completion inventory tracks 13 families, with 11 still carrying extraction or integration work. The candidate covers this inlay path and its demonstrated hosts.

No worktrees were created. The retained Windows and Linux release directories contain the player, addon, editable project and hash receipts, totaling approximately 44.6 MiB and 38.5 MiB. The SDK archive is approximately 0.94 MiB. These are the deliverables for this milestone. Temporary test directories and intermediate archives are removed after evidence is recorded.
