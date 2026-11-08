# Live equipment publication checkpoint

The candidate connects saved workshop equipment to an already-running combat
actor. All twelve original-game courses are covered by source tests. The
unchanged Windows native library reproduces 37 exact replies from the new rules;
five deliberately broken protocols fail their intended assertions.

Actual UPM archives passed Unity 2021.3.6f1 Windows x64 editor and relocated Mono
player courses. Gear preparation stays invisible; successful publication keeps
the current cast and latest resources, effects and random continuation. Busy and
stale writers retain committed views. A post-commit publication failure closes
the owner and actor; reopening recovers the committed inventory. Independent
SQLite inspection verifies the final record and revision seven.

Three deliberately broken Unity packages fail at the intended assertions:
early equipment publication, missing equipment publication, and an owner left
alive after post-commit failure. A further injected cleanup exception preserves the committed-save error and reopen recovery. The accepted archives remain unchanged.

Storage 0.2 also passes the existing course with the frozen public gameplay 0.2
archive and as standalone storage, including recovery, real Play/reload/quit
cleanup and the two prior publication-fault controls. The full SDK verification
and original-game comparison suites pass. Earlier profile-temp and restricted
Unity-launch failures are recorded in `acceptance.json` rather than discarded.

| Candidate | Archive SHA-256 |
| --- | --- |
| Gameplay 0.3.0-preview.1 | `55af6001cf2c0d29622787d3ac71a607f2200a9a7a2b324fab0a0b1bc26d08e8` |
| Storage 0.2.0-preview.1 | `fdc50aa2541439f73237004da76b01667c60ddc17eab1df2c2afd239ed9a5dcd` |

The three common unsocketed bases are the complete admission scope. This is not
full item-effect support, a new public release, IL2CPP/ARM qualification, or a
Steam Deck/mobile performance result. The existing 64 MiB combat and 32 MiB
workshop VM caps exclude Unity, managed memory and SQLite. The observed course
peaks in `reports.json` are allocation observations, not speed improvements.

## Reproduction

Build the SDK and run `node scripts/check-live-equipment-evidence.mjs` to verify
accepted file hashes, current sources, package identity and observation invariants.
Run `npm run verify` and `npm run reference:verify` with `TEMP`, `TMP` and `TMPDIR`
set to an owned workspace directory; remove that directory in `finally`.

- `scripts/test-live-equipment-faults.mjs FRESH_REPORT` reproduces the five protocol
  faults in a disposable copy.
- `scripts/probe-live-equipment-native.mjs PUBLISHED_GAMEPLAY_ARCHIVE PYTHON FRESH_REPORT`
  replays the actual Unity command entry through the unchanged shipping DLL.
- `scripts/package-unity-gameplay.mjs POUCH_DELIVERY OUTPUT PYTHON WORKSHOP_CONTENT_DELIVERY FRESH_SDK_ARCHIVE`
  compares every installed SDK runtime file to an isolated compilation of the
  current source. The old Godot delivery supplies only its verified immutable
  workshop assets; its old runtime qualification is not transferred to new code.
- Build storage with `scripts/package-unity-storage.mjs` and the qualified save
  DLL/receipt. Neither native library changes in this checkpoint.
- `scripts/verify-live-equipment-unity.py --editor EDITOR --gameplay GAMEPLAY_DELIVERY --storage STORAGE_DELIVERY --output FRESH_REPORT`
  installs both tarballs, runs the editor, relocates the player and inspects saves.
- `scripts/test-live-equipment-unity-faults.py` takes the same editor/deliveries,
  `--acceptance` pointing to that report and `--output FRESH_REPORT`.

Exact gameplay traces and intended fault assertion lines are public. Full local
Unity logs include machine/licensing diagnostics and are retained locally;
their hashes remain in the reports. Temporary projects, fault packages and
native consumers are removed on completion.
