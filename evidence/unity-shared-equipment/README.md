# Unity shared-equipment preview qualification

Source: `bb50099f8d516f4d1faf938283f37c09a10c1933`.
The versioned gameplay `0.6.0-preview.1` and storage `0.5.0-preview.1` archives
have fresh Unity 2021.3.6f1 Windows x64 Editor and relocated Mono player results.
Publication is recorded separately by the [release](https://github.com/arianna-arpg/hollow-wake-engine/releases/tag/unity-shared-equipment-v0.6.0-preview.1).

The release changes documentation and package metadata above the exact
[equipment candidates](../shared-account-equipment/README.md). All 48 gameplay
and 19 storage Runtime files are unchanged, including assembly definitions,
rules, content, C# bindings and native libraries. Existing samples and asset
identifiers are preserved. Installation verifies the release-version feature
selection, rather than assuming a new version string leaves compilation intact.

Fresh courses passed:

- Two bound actors with casting, elapsed time, random continuation and timed
  damage; private preparation; zero combat requests for account-only saves;
  unsupported gear, busy/stale writes and committed-save recovery; five
  Play Mode/script-reload paths and full tracked-allocation cleanup.
- Storage installed alone, including process interruption/reopening and
  independent SQLite inspection; storage paired with the exact public Gameplay
  0.5 package, with its original source checked at commit
  `98edfa74a4b9caecf6e0e6ef3ce49cb4365966f8`.
- The standard imported gameplay sample, 60 combat requests, 2,334 pouch
  requests and 56 crafting requests, content corruption/load controls and
  relocated-player execution.
- Byte-identical preview rebuilds and nine preservation/altered-input controls.

The [retained candidate courses](../shared-account-equipment/retained/README.md)
add the typed 84-operation shared-account and 104-operation progression courses,
older paired/separate equipment APIs and imported samples. The development and
retained checkpoints together contain eighteen deliberate coordinator faults.
They remain explicit inherited runtime evidence; these are not new fault runs
against differently named archives.

`reports.json.gz` contains the structured receipts. `observations.json.gz`
retains complete fresh observations; workstation/licensing logs are excluded.
The checker verifies all inherited evidence first, then compares fresh outputs
against the same frozen observations. Run IDs are checked against their own
course, not against a different run's ID. Gameplay elapsed timing arrays are
excluded from equivalence; they remain recorded and checked for shape.
No timing speedup or physical-device acceptance is claimed.

The manifest distinguishes current source from the immutable older gameplay
source. Build receipts' `candidate`/`engineQualified` flags describe build time;
installation acceptance lives in this manifest. Receipts and original candidate
evidence are never rewritten to manufacture qualification or a different parent.

After fetching this source and the development/retained/older gameplay commits,
run:

```text
node adapters/unity-shared-account/qualification/check-equipment-preview.mjs --source-ref bb50099f8d516f4d1faf938283f37c09a10c1933
```

Fresh reproduction uses the scripts in `adapters/unity-shared-account/qualification`:
build the pinned development candidates with `equipment-package.py`, then use
`package-equipment-preview.py --candidate CANDIDATE_FOLDER --output PREVIEW_FOLDER`.
`verify-equipment-preview-archives.py` takes `--candidate`, `--preview` and a new
`--output` JSON path. Run `verify-equipment.py --mode complete --packages
PREVIEW_FOLDER`, `equipment-compatibility.py` with the old gameplay and new storage
folders, and `verify-equipment-retained.py --mode gameplay` with the new pair;
each also requires `--editor` and a fresh `--output`.

`seal-equipment-preview.py` takes a JSON `--inputs` mapping for `equipment`,
`compatibility`, `gameplay` and `archives`, `--source-ref`, and a fresh `--output`
directory. It verifies original report/raw hashes and committed source before
excluding logs. Engine projects and caches are deleted on success or failure.

The scope remains selected packaged capabilities on the recorded Windows/Mono
host. Broader gear effects, other engine bindings, newer Unity versions, Unity
Linux, ARM, IL2CPP and physical Steam Deck/mobile qualification remain open.
