# Content storage and runtime data

Decision: maintain inspectable authored definitions, compile executable capability
packs, and keep mutable player state separate. SQLite is an optional authoring and
query artifact, not a requirement of the combat/inventory runtime. The runtime
still has zero external dependencies.

## Source evidence and precedents

Blizzard's [WoW Classic engineering account](https://worldofwarcraft.blizzard.com/en-gb/news/21881587/dev-watercooler-world-of-warcraft-classic)
describes restoring original data and behavior against a modern codebase. It also
shows a sparse, fixed spell layout evolving into separate spell, effect and aura
records. That supports explicit data schemas, systematic conversion and reference
comparison. It does not establish SQL queries on every combat frame.

[Factorio's optimization account](https://www.factorio.com/blog/post/fff-204)
describes memory access and prefetch experiments whose results depended on hardware.
We use the corresponding engineering discipline: profile realistic workloads and
retain measured evidence before adopting layout or threading changes.

[Unreal's Data Tables](https://dev.epicgames.com/documentation/unreal-engine/data-driven-gameplay-elements-in-unreal-engine)
separate typed records and import workflows from gameplay consumers.
[Unity's immutable blob assets](https://docs.unity3d.com/Packages/com.unity.entities@1.4/manual/blob-assets-concept.html)
illustrate read-only data prepared for efficient runtime access. These examples
inform the boundary; they are not dependencies, copied code, or evidence that our
TypeScript runtime already imports into either engine.

[SQLite's documented use cases](https://sqlite.org/whentouse.html) include embedded
local storage and application file formats. It is suitable for an optional catalogue
tool. Node's built-in `node:sqlite` is used only in development tools and tests;
the measured Node 24.9.0 runtime reports this API as experimental.

## Actual export

The frozen game boots its real registrations and exports 20 named registries,
14,434 rows: stats 6153, attributes 10, statuses 152, classes 39, skills 954,
supports 457, passives 2489, passive choices 29, realms 3, vocations 31, item
bases 79, affixes 3929, uniques 59, vestiges 14, epitaphs 10, containers 1,
equipment slots 11, item rarities 4, defense kinds 6 and rule groups 4.

The gzip baseline is a lossless storage encoding of the original JSON observation.
Normal verification independently re-exports and compares decoded values. All
14,827 undefined object properties are explicitly listed as omissions, not silently
lost. Two progression functions are represented by `$sourceRule` markers and
their exact observed source text; neither is evaluated or declared portable.
Other nonportable values and cycles fail export. Array order is preserved.

`npm run catalogue:build` builds `.artifacts/catalogue-package`, a separate
`@hollow-wake/catalogue` package with individually loadable table files and hashes.
It is **authored data**, not executable `ContentPack` data. Full skill trees and
effects are retained without claiming their runtime implementation. The SDK's
selected executable content remains about 22 KiB and never auto-loads this catalogue.

The optional SQLite projection uses stable `(table_name,id)` keys, row ordinals,
JSON payloads and indexed child tables for skill effects/nodes, vocation nodes and
affix tiers. Foreign keys protect those parent/child rows. The full payload remains
the lossless source representation, so this prototype deliberately duplicates
indexed child data. It is not a fully normalized runtime schema or a validator for
every gameplay reference. Tests roundtrip every row, indexed child and metadata
record and run SQLite integrity checks. Capability-specific typed compilers and
semantic reference validation follow as the mechanics are extracted.

## Measured selection

Five fresh processes per candidate, desktop i9-10900K / Node 24.9.0, warm OS file
cache. The task reads 954 full skill definitions, then performs 20,000 deterministic
lookups after warmup. Both return matching data checksums. The JSON candidate loads
the skill table once and retains its parsed objects; SQLite prepares indexed reads
and parses each requested record. No claim of cold-storage speed is made.

| Median across five runs | JSON + Map | SQLite point reads |
| --- | ---: | ---: |
| Initial load/open | 13.63 ms | 1.14 ms |
| Median batch of 200 reads | 0.0243 ms | 27.55 ms |
| p95 batch of 200 reads | 0.1196 ms | 32.72 ms |
| Retained JS heap delta | 3,405,920 B | 76,376 B |
| RSS delta | 8,167,424 B | 6,103,040 B |

SQLite native memory is excluded from JS heap; RSS is reported but is a noisy
process-level observation. These workloads have different residency strategies.
They support loading selected data for repeated runtime reads and keeping SQLite
for tooling/on-demand access. They do not prove one universal storage winner.
Raw per-run evidence is recorded separately; target-device work remains pending.
