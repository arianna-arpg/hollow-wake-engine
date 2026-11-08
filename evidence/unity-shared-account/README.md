# Unity shared-account package qualification

Source: `98edfa74a4b9caecf6e0e6ef3ce49cb4365966f8`.

This checkpoint qualifies gameplay **0.5.0-preview.1** and storage
**0.4.0-preview.1** for selected capabilities in Unity **2021.3.6f1 Windows x64
Editor and relocated Standalone Mono player**. See the
[installation guide](../../docs/unity-shared-account.md) and public release.

Both final archives were installed as actual UPM tarballs. Qualification includes:

- 84 shared-owner operations per editor/player run, complete replies, retired
  handles and commands, owner isolation and the documented account example.
- Complete shared account/inventory saves compared with the frozen serial
  control: policy and exception rollback, invalid later actions, unchanged
  dependency conflicts, busy writers, reopening, incomplete initialization and
  failure after the database committed but before gameplay publication.
- Five shared lifecycle courses: two Play Mode entries and exits without domain
  reload, plus script reload. The pending proposal never publishes; storage and
  gameplay close, tracked allocations reach zero, and all three saved records
  retain their original revision and body.
- Retained functionality: 104 progression, 60 combat, 2,334 pouch and 56 workshop
  replies per editor/player run; equipment publication, imported samples,
  corrupted-content rejection and the earlier durable-account API.
- Standalone storage installation, exact-text saves, stale writes, rollback,
  worker ownership, editor lifecycle and recovery after killing the test player.
- Six deliberately broken shared coordinators and four broken earlier
  coordinators rejected at their intended Unity assertions.
- Ten archive controls, including byte-identical rebuilds, unchanged native
  libraries/content/samples/GUIDs, refusal to overwrite outputs, wrong parents,
  failed native evidence and changed source.

The native libraries are unchanged from the previously qualified releases. The
[prepared-account checkpoint](../prepared-account/README.md) supplies the full
1,660-test SDK verification, installed/browser contracts, frozen serial oracle
and native 579+84-command proof. This release adds package qualification; it
does not relabel that earlier verification as a fresh SDK run.

The shared course peaks at 30,719,337 tracked native bytes and releases all
tracked allocations. The native longer course in the earlier checkpoint peaks
at 30,852,635 bytes. These observations exclude Unity, managed allocations and
allocator overhead. No device-speed or total-memory claim follows. All observed
cancellation races in the new shared coordinator committed; cancellation may be
too late. The separate underlying-worker cancellation proof remains distinct.

`acceptance.json` binds real committed source and both artifact hashes.
`reports.json.gz` retains original receipts. `observations.json.gz` preserves
complete replies, saves and specific failing assertion lines. Workstation Unity
logs, including licensing diagnostics, remain local. Their hashes remain in the
original receipts; the public capsule contains no `.log` files. The legacy
standalone verifier needs native provenance that the additive package receipt
does not repeat: its qualification wrapper supplies the unchanged pinned
parent's source map in a temporary receipt and checks the same archive bytes.

## Check recorded evidence

After fetching the source above, run:

```sh
node scripts/check-unity-shared-account-evidence.mjs
```

For historical checking after later source changes, append
`--source-ref 98edfa74a4b9caecf6e0e6ef3ce49cb4365966f8`. This compares actual Git
blobs, not substituted expected hashes. Recorded evidence does not replace a
fresh Unity run.

## Reproduce the archives and engine runs

Use Node 24.9, Python 3 and Unity 2021.3.6f1 on Windows. Install the locked SDK
dependencies and build the SDK. Obtain the exact gameplay 0.4.1 cleanup and
storage 0.3 parent archives from their public releases; both builders reject
different parent hashes. For the embedded input directory, use the `native`
report from `evidence/prepared-account/reports.json.gz` as `report.json` and copy
`evidence/prepared-account/native-inputs.json.gz` to `inputs.json.gz`. These are
recorded inputs; fresh native reproduction uses the earlier checkpoint recipe.

The builders in `adapters/unity-shared-account/qualification/` are `package.py`
(`--parent`, `--embedded`, `--output`) and `storage-package.py` (`--parent`,
`--output`). `verify-archives.py` takes `--gameplay-parent`, `--storage-parent`,
`--embedded`, `--gameplay`, `--storage`, `--output` and rebuilds both packages.
Use fresh output paths; accepted receipts are never overwritten.

Run these actual-engine courses, supplying `--editor` with the Unity executable
and fresh `--output` paths:

| Runner | Package arguments |
| --- | --- |
| `adapters/unity-shared-account/qualification/verify.py` | `--package GAMEPLAY` |
| `adapters/unity-shared-account/qualification/verify-storage.py` | `--gameplay GAMEPLAY --storage STORAGE` |
| `adapters/unity-shared-account/qualification/storage-faults.py` | `--gameplay GAMEPLAY --storage STORAGE`; output is a new directory |
| `scripts/verify-unity-progression.py` | `--gameplay GAMEPLAY` |
| `scripts/verify-live-equipment-unity.py` | `--gameplay GAMEPLAY --storage STORAGE` |
| `scripts/verify-unity-account-storage.py` | `--gameplay GAMEPLAY --storage STORAGE --mutations` |
| `adapters/unity-shared-account/qualification/verify-retained.py` | `--mode gameplay --package GAMEPLAY --release POUCH_REFERENCE` |
| `adapters/unity-shared-account/qualification/verify-standalone.py` | `--package STORAGE` |

`GAMEPLAY` and `STORAGE` are builder output directories. `POUCH_REFERENCE`
contains the unchanged `verification-dotnet-windows.json` receipt from the
published pouch release; the gameplay replay checks its content hash. Every
runner deletes its owned Unity project and cache after collecting observations,
including on failure. Run engine jobs sequentially on the shared workstation.

The checked-in sealer takes a JSON mapping of the nine named reports
(`typed`, `sharedStorage`, `progression`, `equipment`, `accountStorage`,
`retained`, `standalone`, `faults`, `archives`), `--source-ref` and a new
`--output` directory. It verifies local raw hashes and committed source before
removing workstation logs from the public capsule.

Linux Unity, IL2CPP, ARM, Steam Deck and older mobile qualification remain open.
Dynamic group membership, auxiliary-document edits, coherent legacy migration
and shared-account equipment publication are separate implementation work.
The overall SDK completion goal remains active.
