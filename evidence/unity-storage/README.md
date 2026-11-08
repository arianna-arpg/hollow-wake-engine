# Unity durable storage qualification

Published publicly as
[unity-storage-v0.1.0-preview.1](https://github.com/arianna-arpg/hollow-wake-engine/releases/tag/unity-storage-v0.1.0-preview.1)
from commit `5795e287ca1ebd272783e50e42e3cd7dea0b3d75`.
Both hosted workflows completed successfully. All eight release assets were
downloaded and matched to the qualified local bytes before publication;
[publication.json](publication.json) records their hashes and URLs.

This checkpoint qualifies the optional storage package in Unity 2021.3.6f1,
Windows x64 editor and Mono player. The gameplay package is the unchanged public
0.2.0-preview.1 archive. The storage DLL is the exact Release binary already
qualified by the portable save library's hosted Windows C/C# courses.

The storage package also installs and runs without gameplay. Its optional
workshop assembly and imported sample activate only with the gameplay package.
The shared archive builder reproduces the published gameplay archive byte for
byte and separates package metadata identities.
Before committing, the Python packer's line endings were normalized to the
repository's LF policy. Repacking produced the exact same qualified storage
archive and published gameplay archive. The raw record preserves the original
packer bytes and both source receipts so this build-only change is explicit.

The combined course checks:

- Hidden candidate state until successful save observation, including initial
  profile creation, item IDs above 32 bits and exact RNG continuation.
- Locked and stale writers, oversized payloads, refused commands, no-op writes,
  cancellation outcomes and invalid saved-profile rejection.
- Exact paired records inspected independently through SQLite.
- A real imported sample, a relocated player, a rendered screenshot, another
  player process reopening the saved inventory and exact subsequent forging.
- Pending-save cleanup on Play entry and exit with domain reload disabled,
  assembly reload and application exit. Native gameplay allocations reach zero.
- Rejection of deliberately premature publication and publication after failure.

An additional Play-entry check exposed retained native workshop state when only
the save store closed. The bridge now retires its gameplay state whenever its
storage owner closes. The rejected package and failure are retained as
diagnostic evidence; the repaired package must pass that same check.
The compressed Play-entry baseline preserves the rejected archive's source
text; its unchanged native DLL is identified by hash.

The sample course calls public component methods; it does not simulate mouse or
controller gestures. The process-kill course demonstrates transaction recovery,
not physical power-loss tolerance. The native workshop stays within its existing
32 MiB VM cap; that limit excludes Unity, managed allocations and SQLite.
IL2CPP, other Unity versions/platforms, ARM, Steam Deck and mobile performance
require separate qualification.

Reproduce after building and qualifying the standalone native save library:

~~~text
node scripts/package-unity-storage.mjs --library <build-receipt.json> --qualification <save-contracts.json> --python <python> --output <fresh-delivery>
python -I -B scripts/verify-unity-storage.py --editor <Unity.exe> --package <fresh-delivery> --output <plain-storage.json>
python -I -B scripts/verify-unity-storage.py --editor <Unity.exe> --package <fresh-delivery> --gameplay <published-gameplay-delivery> --screenshot <sample.png> --fault-controls --output <durable-workshop.json>
~~~

All verification projects, editor caches, exported players and saves live in
owned temporary directories and are removed on completion or failure.
