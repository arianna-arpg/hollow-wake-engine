# Milestone three: inventory ownership and content pipeline

Version 0.3 adds an instance-owned inventory that indexes cells, preserves opaque
item payloads, supports masks, row-major placement, atomic swaps/transfers and
versioned save/restore. The original game retains its native bag implementation
until all bag writes can be routed through one owner. No live-bag cache is added.

The independent exporter observes 3000 transitions on four original boards,
including actual `World.moveBagItem` calls. Each SDK step checks outcomes, positions,
cell lookup and payload preservation, then saves and restores. Separate tests
exercise duplication, full destinations, overlapping swaps, resize rejection,
malformed saves, external mutation and callback/accessor hazards.

The authored catalogue captures 14,434 rows across 20 registries and two explicit
executable-rule markers. It is independently packaged as optional data. Gzip
reduces the lossless accepted reference to 1,065,873 bytes; the installable catalogue
archive is 923,999 bytes. The package contains table hashes, ordered nested payloads
and a separate record of original registry insertion order. SQLite tooling supports indexed inspection and child-row queries and is
checked by a complete row/metadata roundtrip. No SQL dependency enters the runtime.

The SDK runtime is 74,246 bytes of unminified JavaScript, below the existing 96 KiB
gate. Selected executable content remains 22,539 bytes. Those are limited-scope
package measurements, not bounds for the eventual full engine.

Verification adds nine inventory tests and two catalogue tests to the 44 existing
tests (55 total), two deliberately broken inventory variants, and a separate
offline catalogue installation. Full original source hashes and reference exports
remain verified. A machine-readable completion inventory prevents data export
from being counted as implemented mechanics.

On the local i9-10900K / Node 24.9.0, five fresh-process runs compare 108 items on
a 12×12 board. Each measured batch performs 1024 `at` plus 1024 placement queries;
there are 500 batches after 200 warmup batches. Median-of-run-medians falls from
0.5382 ms to 0.0347 ms (about 15.5×). Median-of-run-p95 values are 0.8960 ms and
0.0512 ms. Checksums match across every run. This measures query latency only,
not UI, ownership-copy cost, memory or whole-frame performance on a device.

The database comparison and rationale are in [content-storage.md](content-storage.md).
The evidence supports optional authoring storage and preloaded selected runtime
data. Steam Deck and older mobile measurements remain unverified.

Reproduce:

```sh
npm ci
npm run verify
npm run reference:prepare
npm run reference:install
npm run reference:verify
npm run reference:inventory
npm run catalogue:build
npm run benchmark:inventory
npm run benchmark:catalogue
```

Subsequent work remains substantial: item generation and equipment contribution,
full progression and graph legality, advanced casting/effects/defenses, complete
game delegation, native package experiments and device validation. Track those
requirements in [completion.json](completion.json); this milestone does not close
the full SDK extraction goal.
