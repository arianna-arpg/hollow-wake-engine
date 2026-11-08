# Grouped-save native checkpoint

The optional storage extension provides a bounded, atomic group of existing
records and a consistent grouped read. The base ABI and database schema remain
compatible. This is the storage prerequisite for durable account/workshop
coordination; it is not yet a qualified Unity integration.

windows.json identifies the accepted Release DLL. windows-raw.json.gz retains
its build receipt, C++/C/C# observations, sleeping-worker checks and full SDK
regression receipt. sdk-verify.txt.gz preserves that regression's complete log.
The source-bound checker is scripts/check-grouped-save-evidence.mjs.
superseded.json.gz retains earlier successful test/build receipts from before
the final read-boundary corrections; their generated binaries were removed.

The original C consumer is rebuilt against the new DLL. The original native
library is rebuilt against the new C# binding, which preserves single-record
operations and explicitly refuses the unavailable group extension. The source
capsule is pinned under baseline/grouped-saves.

Six process-exit/reopen cases cover staged, committed and late-stale transactions
under WAL and rollback journals. Twelve deliberately broken stores must fail:
the eight retained controls plus partial-group commit, output reordering,
aggregate-limit removal and treating a damaged row as an empty slot. The
independent worker course retains its cancellation and thread-launch controls.

Two native read-boundary corrections were made during the full SDK regression.
The original receipt's whole-source stability flag remains false; the checker
requires every SDK source to be unchanged and both native files to match the
separately qualified final Release build and consumers. No native coverage is
inferred from the TypeScript regression.

Temporary compiler, fixture and consumer directories are removed after their
receipts are retained. cleanup.json records this checkpoint's cleanup and the
three existing worktrees retained for ongoing work.

This Windows checkpoint does not qualify Linux, Unity, Godot, ARM, Steam Deck,
older phones/tablets or physical power loss. The hosted native workflow supplies
separate Windows/Linux results and Linux sanitizer evidence after publication.
See [the contract](../../docs/grouped-saves.md) for ownership and reproduction.
