# Unity account/storage checkpoint

Storage 0.3 composes the shared Gameplay 0.4 progression and workshop profiles
over the grouped native save service. The accepted target is Unity 2021.3.6f1,
Windows x64, editor and relocated Mono player. The original game is unchanged.

The course compares 20 complete account/inventory state pairs with the shared
SDK: six coordinator checkpoints and four imported-sample checkpoints in each
host. It checks opaque relic data, safe integer IDs, independent random streams,
late revision conflicts, competing writers, invalid secondary restores and
publication failure after an already committed write. Live equipment changes
preserve the ongoing combat state. Both observed cancellation attempts crossed
the commit boundary and correctly reported TooLate followed by Committed; this
Unity run is not evidence of the earlier cancellation branch. That boundary is
separately covered by the native worker's controlled tests.

Two Play entries, two Play exits with domain reload disabled, and a real script
reload retire both gameplay owners and the transferred actor while proposals
remain unpublished. Four modified UPM archives are rejected at the intended
assertions: early publication, ignored false progression result, publication
after a failed write, and retained owners after post-commit publication failure.
The genuine archive is unchanged.

The Package Manager sample preserves one-time example credits and complete
continuation across close/reopen. Plain storage and the frozen public Gameplay
0.2 package still pass their editor/player, process-recovery and lifecycle
courses. Existing single-workshop behavior remains available. The full SDK
regression receipt and compressed log accompany the engine evidence.

128 additional unchanged proposals per coordinator run exercise repeated
candidate retirement. Peak tracked native allocations were 4,152,292 bytes for
the account VM and 30,951,885 bytes for the workshop VM, each below its existing
32 MiB cap; both report zero owned bytes and blocks after close. These are
per-VM observations. They exclude Unity, managed allocations, combat and SQLite,
and are not whole-process, CPU-time, battery or physical-device budgets.

The bridge coordinates persistence and publication. It does not merge the
progression and workshop account domains or authorize cross-system purchases.
See [the boundary](../../docs/unity-account-storage.md). Steam Deck, ARM,
older mobile hardware, IL2CPP and other Unity platforms remain unqualified.

## Reproduction

Build the native save delivery with its pinned SQLite input and qualify it
through the grouped C/C++/C# tests. Package it with
scripts/package-unity-storage.mjs. Supply that delivery and the exact qualified
Gameplay 0.4 archive to scripts/verify-unity-account-storage.py with --mutations.
Use scripts/verify-unity-storage.py for plain storage and the frozen Gameplay
0.2 compatibility course. Run npm run verify, then
node scripts/check-unity-account-storage-evidence.mjs.

The baseline preserves nine predecessor files at
b599864c30dde72f794a972d19951b593d0e3416. The accepted receipts bind runtime,
package, verifier and input sources. Public observations contain gameplay JSON
and exact fault assertion lines; complete local Unity logs are omitted because
they contain machine licensing metadata. Failed preliminary attempts remain
listed separately and are never relabeled as successful qualification.

The verifier deletes its owned projects, package caches and players in finally.
The cleanup receipt records removal of this regression's disposable consumers
after retaining compact receipts. No new Git worktree is required.
