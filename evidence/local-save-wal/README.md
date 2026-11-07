# Godot local saves 0.2.0

The standalone native addon now opens compatible slot databases in write-ahead logging mode. It checks the application identifier and schema version first. The optional journal policy supports explicit rollback mode and preserving a file's existing mode. The open result reports the selected mode and linked SQLite version. A passive checkpoint operation exposes copied and pending frames.

The addon builds independently with its own Godot binding profile. Both RefCounted and OS are required by the pinned bindings, including their diagnostic output. A trial removing OS failed compilation and was corrected before acceptance. The runtime uses the existing slot schema and synchronous=EXTRA.

The accepted binaries use SQLite 3.54.1, Godot bindings commit 507ed9d840c01a3c5b2a39af8bb4000bfac30bf5, MSVC 19.38.33133.0 on Windows and GCC 14.2.0 in the pinned Steam Runtime 4 SDK on Linux. Both were loaded by Godot 4.7.2. Build inputs, library hashes and standalone addon hashes are recorded in `builds.json`. Source hashes there normalize CRLF to LF.

`standalone-windows.json` and `standalone-linux.json` record installation into empty Godot projects through the editor's normal import process. They cover fresh and legacy databases, rejected foreign files, future schema versions, invalid policy, stale revisions, busy writers, wrong tokens, cancellation, closing a staged transaction, UTF-8 limits and explicit journal conversions. The checks run through the compiled public API and inspect durable results with independent SQLite connections.

Each standalone run also commits 1,100 small records on a long-lived connection. The automatic checkpoint restarts the journal after 1,000 pages, leaving 100 frames and a retained 4,120,032-byte WAL. Holding an independent reader's snapshot allows all 1,100 writes to commit, while a passive checkpoint reports zero copied frames. Releasing that reader allows the checkpoint to finish. Closing the final connection removes the sidecar. These observations describe the tested small-record workload.

`workshop-windows.json` and `workshop-linux.json` qualify the updated project and actual relocated player archives. Both players complete the existing vestige course, restart in a second process and reopen the committed owners with WAL enabled. `inventory-windows.json` records all 32 runs of the broader existing inventory harness, including three forcibly interrupted processes and its rollback-mode busy-commit course. The initial workshop verifier omitted the second process's resume flag. That test invocation was corrected, and both final packages passed.

`checks.json` records successful full SDK verification with 1,574 tests and the additional package and mutation gates. Seven 20,000-contact benchmark rounds retained equal original and extracted checksums. Their timings describe the existing isolated combat replay.

The separate controlled save experiment ran after other verification work stopped. It used the final library inside the archived workshop, four fresh databases in DELETE, WAL, WAL, DELETE order, eight warmups and 32 measured inlays per case. Both modes used synchronous=EXTRA.

| Host filesystem and mode | Paired median inlay-and-save times |
| --- | --- |
| Windows D drive, DELETE | 133.11 / 129.14 ms |
| Windows D drive, WAL | 25.27 / 33.32 ms |
| Linux container overlayfs, DELETE | 10.00 / 9.85 ms |
| Linux container overlayfs, WAL | 3.82 / 3.88 ms |

`storage-windows.json` and `storage-linux.json` retain every sample, separating staging, committing and remaining work. The host is an Intel Core i9-10900K desktop. Each case also terminates its owned process immediately before and immediately after COMMIT, then independently checks revision, both owners, exact save bytes and database integrity. All 16 interruptions passed. Final measured saves have the same checksum in all eight cases.

The initial native correctness sweeps ran alongside other verification and retain diagnostic timings. The controlled storage files above support the paired comparison. Container results and desktop timings leave physical Steam Deck, older mobile hardware and power-loss qualification open. The full Linux workshop's earlier headless editor-import limitation on the native container filesystem is recorded in the vestige evidence. This milestone additionally verifies normal import of the standalone addon on both platforms.

SQLite's default automatic checkpoint threshold is 1,000 pages. Long-running readers can prevent full checkpoint progress. The new explicit checkpoint uses PASSIVE mode, which can return partial progress while readers retain snapshots. [SQLite WAL](https://www.sqlite.org/wal.html), [SQLite checkpoint API](https://www.sqlite.org/c3ref/wal_checkpoint_v2.html)

Reproduce the standalone installation and storage tests with `scripts/check-slot-addon.py` and its companion `test/godot-inventory/wal-storage.gd`. The addon README documents the arguments and standalone CMake build. The full workshop verifier is `scripts/verify-wal-store.py`, using the accepted 0.59 workshop donors and the new native build receipt. Its correctness-only mode omits the short player timing run. The controlled paired experiment uses `scripts/measure-vestige-storage.py` with the resulting project archive and its recorded hash. The Linux workshop experiment selects direct extension registration in its disposable fixture.

The public component consists of the independent native addon, its source, notices, build records and generic storage checks. The later gameplay content and original-game traces have a separate publication boundary.
