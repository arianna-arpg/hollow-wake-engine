# Progression gate acceptance and measurements

The v0.43 local release checks passed with 1,433 SDK tests, 31 installed gate faults, nine gate-installation controls and the earlier 25 continuity and 21 character faults. Desktop boot, character selection, Vault saving and Continue matched their accepted observations. All 339 previous compiled SDK outputs were retained byte-for-byte. The isolated game changed one source file.

The final archive was installed and checked again after documentation edits. Its runtime and content bytes match the preceding accepted build. The repeated UI check used a fresh output folder after the earlier output's preservation guard rejected reuse. Both accepted builds are retained.

The standard scoped benchmark passed with matching checksums. Its original and SDK paths have different surrounding capabilities, as recorded in that benchmark's scope. The table below uses the original and installed game gate entry points for the same group-query workload.

## Gate timings

Windows x64, Node 24.9.0, Intel Core i9-10900K. Eight fresh-process pairs alternate execution order. A separate eight-pair control runs the installed implementation in both positions. Each measured process performs 45,056 group queries per account profile after warmup. Each query evaluates membership, row progress and labels across that group's authored rows.

| Account profile | Original median µs/group | SDK median µs/group | Median paired SDK/original ratio | Identical-build ratio |
| --- | ---: | ---: | ---: | ---: |
| Empty | 1.927 | 0.807 | 0.435 | 0.883 |
| Partial progress | 3.394 | 2.694 | 0.767 | 1.012 |
| Partial progress with 512 additional ledger keys | 15.916 | 15.269 | 0.978 | 1.001 |
| Completed requirements | 0.439 | 0.448 | 0.996 | 0.984 |

The shortest control showed material variation between equivalent implementations. The lower empty-account and partial-progress timings are descriptive results from this run. The larger-ledger and completed profiles were close in the paired comparisons. Prefix and milestone scans remain sensitive to ledger size.

The compact timing evidence retains every measured duration, shared expected query results, execution order and original receipt digests. Timing includes query work and result consumption. Rendering, complete frames, disk I/O and physical devices require their own measurements. Allocation volume was outside this timing course.

## Package and native scope

The optional gate and content JavaScript files total 11,604 bytes unminified, within their separate 12 KiB budget. Their standalone browser bundles measure 2,527 and 3,922 bytes. The authored gate archive is 5,777 bytes compressed and contains 88 groups.

The wider native replay completed 330 requests through each C, C++ and .NET consumer, with 379,857 exact numeric comparisons and two deliberately altered courses detected. Tracked live memory returned to zero after disposal. The complete installed-game diagnostic peaked at 148,324,466 tracked bytes, compared with 93,477,029 for its original-game counterpart. This full-game replay includes its content, bridge and observation workload. Device memory and whole-frame optimization remain open work.

The original game's 4,149-file preservation check passed. Hosted runtime confirmation and the repeated Linux benchmark-cleanup checks are recorded separately after publication.

## Reproduction

Prepare the current isolated adapter, then run the paired and identical-build courses while other CPU-heavy work is stopped.

```sh
npm run build
npm run adapter:prepare
node scripts/benchmark-character-rules.mjs --location .artifacts/adapter-location.json --gates
node scripts/benchmark-character-rules.mjs --location .artifacts/adapter-location.json --gates --control
npm run benchmark
```
