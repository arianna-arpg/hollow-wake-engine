# Release compatibility and limits

The parity candidate is `combat-inventory-v0.2.0-preview.1`, pinned to the
November 16 prototype revision. The published October preview remains preserved. Exact artifact identities and
platform results accompany each verified release. The November desktop baseline
measures the new executable; previous performance measurements are historical.
The portable runner does not certify a device or every content combination. See [prototype parity](prototype-parity.md).

| Surface | Qualification boundary |
| --- | --- |
| Node 22 / 24, Windows and Linux | Release consumers install the five local archives and replay combat/build/adapter courses. Exact runtime versions and platform results are in release verification. |
| Godot 4.7.2 desktop | Node authority with Godot client, editor and exported-player interaction checks. The reference contains a playable scene; it requires a separately installed Godot runtime/editor. |
| Browser JavaScript | ES2022/module-worker performance runner and existing browser composition checks. The Node TCP host is not a browser transport. |
| Steam Deck | Portable Node/Linux and browser measurement procedures supplied. No physical-device, thermal, battery or rendered-FPS qualification yet. |
| Older phones/tablets | Browser measurement route requires ES2022, module workers and structuredClone. Native mobile Node deployment and full game memory budgets are unqualified. |
| Unity / Unreal | Earlier previews remain preserved with their own evidence. This release does not qualify the full combat/Inventory composition as a native package in either engine. |
| Existing Hollow Wake 3D project | Compatible reference direction and explicit Ground/delivery seams. Actual project adoption and its content-capture reconciliation remain a project-controlled step. |

The supported package set is:

| Archive/package | Version |
| --- | --- |
| `@hollow-wake/engine` | `0.64.0-candidate.0` |
| `@hollow-wake/character-builds` | `0.3.0-candidate.0` |
| `@hollow-wake/characters` | `0.2.0-candidate.0` |
| `@hollow-wake/combat` | `0.4.0-candidate.0` |
| `@hollow-wake/node-godot` | `0.3.0-candidate.0` |

Use release checksums as well as versions. Historical local candidate archives
can share a version while carrying different documentation or provenance.
No npm registry publication or licensing change accompanies this release.

Quests, account orchestration, persistence, campaigns, world generation and
general AI remain optional or host-owned. SDK combat signals are required rule
outputs; a general persistent event framework is not required.

The previous release's accepted desktop envelope contains eight named workloads, not every build.
The 128-actor course is a stress tier. Individual Vocation/Reliquary/awakening edit
timings and 64/256-item Inventory cases remain outside that timing qualification,
although their required correctness contracts retain their original comparisons.
