# Unity account progression checkpoint

The gameplay 0.4 candidate adds typed account profiles over the existing shared
progression session. Three immutable content packs retain their original
compiled-content hashes. The shipping native library is unchanged.

The actual UPM archive passes Unity 2021.3.6f1 Windows x64 editor and relocated
Mono player courses. Each compares 104 complete account operations/snapshots
with the already-qualified SDK session. Independent checks cover partial
purchase arithmetic, all 258 catalogue entries, class claim retirement, relic
overflow placement, maximum safe account values, uint32 relic/profile IDs,
opaque keys and values, large saves and ten random-reward continuations.
Retired handles cannot reach a replacement account. Profiles and owners close
with zero tracked native bytes and blocks.

The imported AccountProgressionExample grants example credits, purchases a
memory and restores a complete in-memory checkpoint. Its next reward and
account snapshot exactly match the saved continuation in both runs.

Three actual modified UPM packages fail their intended checks: a missing
retired-handle guard, cross-profile command routing and restore replaced with
a blank open. Altered progression rules and content files fail their integrity
checks before creating a usable host. The accepted archive stays unchanged.

The same archive passes the retained combat (60 replies), pouch (2,334 replies)
and workshop (56 replies) courses in both editor and relocated player, along
with sample import, no-domain-reload Play exits and changed-asset rejection.
Its live-equipment/storage integration preserves current combat on publication,
refuses busy/stale writes, closes after post-commit publication failure and
recovers the exact revision-seven SQLite record.

The progression course peaks at 3,925,373 tracked native bytes in each run,
under its 32 MiB cap. This excludes Unity, managed memory and allocator overhead.
All elapsed-time fields in retained reports are diagnostic observations from
concurrent verification; no performance improvement is claimed.

## Evidence and reproduction

The archive SHA-256 is
`e75f83bad493ddb159ab0217513e5216e203bdb0c7e5834a1c5dc0a8a2721317`
(1,582,281 bytes). `acceptance.json` binds current sources and public evidence.
`reports.json` contains package/engine/fault/regression receipts.
`observations.json.gz` preserves complete progression replies, equipment
observations and intended fault assertion lines. Full Unity logs stay local
because they include machine/licensing diagnostics.

Run `node scripts/check-unity-progression-evidence.mjs` after the SDK build.
The adapter unit tests, actual-engine verifier and deliberate-fault runner are
listed in [the integration contract](../../docs/unity-progression.md).
Five cleanup controls cover success, failure, transient locks, missing children
and persistent locks. Temporary Unity projects/caches are removed even on
failure. Prior test-code and cleanup failures remain identified in acceptance.

The complete `npm run verify` SDK regression passes with unchanged source
hashes. Its compressed log is retained. The original-game reference inputs
and production TypeScript implementation have not changed in this milestone;
this is new binding qualification, not regenerated original-game behavior.
Afterward, the focused checks passed again with test setup explicitly creating
the ignored artifacts parent on a clean checkout; `focused-checks.json` records
that test-only adjustment. Cleanup removed 68 owned consumer directories,
9,635 files and 334,121,759 bytes. Their compact receipts remain local.

Account durability and atomic account/workshop publication, other Unity
platforms, IL2CPP, ARM and physical Steam Deck/mobile measurements remain open.
The entire SDK completion goal remains active.
