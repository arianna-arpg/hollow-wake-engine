# Prepared shared-account checkpoint

Source: `ee663a3449fbaa29e67ba65b5293f300a97ff837`.

The later [Unity package checkpoint](../unity-shared-account/README.md) adds
retained-feature regression and public installation for this capability.

This is a development checkpoint for the prepared account boundary, typed Unity
owner and fixed-group storage coordinator. It is not a published Unity release
or a qualification of every retained gameplay feature in the new package.

- Full SDK verification passed all 1,660 tests and its package/fault checks.
  `reference:verify` also passed against the pinned original implementation.
- The installed account package and browser build passed 30 contracts and
  rejected 23 injected faults. The browser consumer is 152,880 bytes under the
  unchanged 180 KiB limit.
- Native replay retained all 579 original replies and added 84 prepared-change
  checks. The serial control is the unchanged frozen pre-transaction bundle.
  A longer run completed 5,790 original commands plus the 84 prepared checks,
  peaked at 30,852,635 tracked bytes and released all tracked allocations.
- The typed Unity binding passed 84 operations in the actual 2021.3.6f1 Windows
  x64 Mono editor and relocated player, including handle reuse and disposal.
- The durable coordinator passed complete saved-state comparisons, policy and
  exception rollback, stale unchanged dependencies, competing writers, reopening,
  incomplete initialization and post-commit failure closure. Both observed
  cancellation races committed; this does not claim this course observed the
  cancelled outcome. The underlying worker has separate cancellation evidence.
- Six actual mutated coordinator archives failed their intended Unity
  assertions, including omission of an unchanged dependency and leaving the
  storage worker alive after publication failure.

`reports.json.gz` preserves the original receipts. `native-inputs.json.gz`
contains the exact compiled bundle, content, original course and prepared course.
`observations.json.gz` retains complete Unity replies, saved states and the
specific failing assertion lines. Unity logs containing workstation/licensing
metadata remain local; their original hashes are in the receipts and the
redaction record in `acceptance.json`.

The earlier observer failure and source-file budget failure remain recorded in
`prior-attempts.json.gz`. The native observer originally reset its expected
token between two courses while the replay reused one owner; the corrected
observer carries token lifetime across both. The optional unminified module's
budget changed explicitly from 20 to 21 KiB for the new transaction commands.
Earlier factory source capsules remain available for reproduction.

Run `node scripts/check-prepared-account-evidence.mjs --source-ref ee663a3449fbaa29e67ba65b5293f300a97ff837` after fetching the source
commit above. It checks artifact hashes, source identity, complete SDK receipts,
both serial/candidate bundles, native reply digests, Unity snapshots and faults.
It does not turn recorded observations into a fresh engine run.

At this checkpoint, public installation used gameplay 0.4.1 and storage 0.3.
Its preview.0 archives remain local; the later preview.1 release is independently
qualified against all retained package courses.
Linux Unity, IL2CPP, ARM, Steam Deck and mobile acceptance remain open. Tracked
VM heap is not total process memory, allocation volume or a device-speed result.
