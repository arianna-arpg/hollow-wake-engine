# Verification and reproduction

## Normal package checks

```sh
npm ci
npm run verify
npm run example
```

Verification builds the strict, host-independent TypeScript package, runs behavior
tests, checks production imports and host-API use, tests deliberate faults in
temporary copies, packs the package, and installs it into an isolated temporary
consumer. The consumer disables browser globals, network calls and `Math.random`.

The package archive includes runtime output, selected content, license and
documentation. It excludes baseline evidence, the original game and development
dependencies. Current gates cap unminified runtime JS at 96 KiB and selected
content JSON at 64 KiB. These are first-slice bounds, not promises about a full engine.

## Reconstructing the original

```sh
npm run reference:prepare -- /path/to/arpg-game-world
cd .reference
npm ci --ignore-scripts
cd ..
npm run reference:verify
```

Without a source checkout argument, preparation verifies and unpacks the tracked
`baseline/source.tar.gz`, applies the tracked byte overlays, and verifies every
source hash. This capsule is necessary because the captured local commit was not
available from upstream when checked. Reconstruction requires no network or
original checkout. Development dependency installation still requires an npm
cache or network. Existing `.reference` files are verified before reuse.
The original source checkout is only read.

Reference verification copies the independent exporter into the reference's
`balance` directory, runs it using the reference's `tsx` development tool,
and compares generated results with accepted JSON. Expected calculations come
from the original game; the exporter never imports this SDK.

`--export-only` writes unaccepted results under `.artifacts/reference` for review.
`--initial-capture` refuses to overwrite existing accepted fixtures.
Normal CI and tests never regenerate accepted expected values.

To rerun the game baseline itself, execute `npm run check` and
`npm run sim -- run --suite smoke` inside `.reference`. The original game's full
browser boot and Inventory UI have not been migrated or claimed by this milestone.

## Evidence files

| File | Meaning |
| --- | --- |
| `baseline/source-lock.json` | Commit, overlay and exact source hashes |
| `baseline/dependency-inventory.json` | Static import evidence and boundary paths |
| `baseline/authored-selection.json` | Full raw selected content, including fields outside current capability |
| `baseline/stat-catalogue.json` | Full original exported stat registry |
| `baseline/first-path.json` | Original build, preview/cost and ordinary contact observations |
| `baseline/arithmetic-contacts.json` | Original mixed numeric/contact observations |
| `baseline/stat-transitions.json` | Original source/condition/gauge transition observations |
| `evidence/` | Recorded milestone receipts and performance samples |

`scripts/analyze-reference.mjs` can regenerate the dependency inventory from the
hash-verified reference. Static reachability is not a list of everything to extract:
runtime callbacks, mutations and initialization order require behavioral tracing.

Negative controls alter the damage multiplier formula and omit cache invalidation
in temporary built copies. The same behavioral tests must reject both with
assertion failures. Syntax/import failures do not count as successful detection.

## Cross-runtime numerical policy

The current contract uses binary64 arithmetic, relative/absolute comparison
tolerance `1e-12`, and exact discrete results and random consumption. This is not a
claim of cross-platform lockstep determinism. Native bridges must run the same
fixtures and report differences before adopting a different numerical policy.
