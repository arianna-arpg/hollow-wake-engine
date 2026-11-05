# Character continuity measurements

The desktop courses exercise real game entry points with the original game, the packed SDK adapter, and independent identical-build controls. Every timed run checks its outcomes. The measurements use Windows x64, Node 24.9.0, and an Intel Core i9-10900K.

## Reward selection

The final paired median ratios were approximately 0.81 for pending classes and 0.46 for activated classes, relative to the original game. Both improvements repeated in the earlier run. Corresponding identical-build control ratios were approximately 1.09 and 0.95 in the final run.

The extracted query walks the current bundle list directly. It avoids creating an owners array on each query and can return when an active owner is found. A starter-only query usually exits before inspecting bundles.

## Class settlement

Class-settlement timings are inconclusive across repeated courses and identical-build controls. The final mixed workload measured overhead against the original game. A separate balanced comparison against v0.41 showed varying results within a noisy control range.

The revised guard ordering skips already-owned entries before examining earlier awards. Its duplicate-award safety check is covered by the existing contracts and original-game comparisons. The recorded measurements support the reward-selection improvement. Further settlement optimization needs a more stable workload and target-device profiling.

## Reproduction

Prepare the isolated current game, then run the longer continuity course and its control with other CPU-heavy work stopped.

```sh
node scripts/benchmark-character-rules.mjs --location .artifacts/adapter-location.json --continuity
node scripts/benchmark-character-rules.mjs --location .artifacts/adapter-location.json --continuity --control
```

The continuity course measures 10.8 million starter selection calls, 540,000 calls for each other selection state, and 100,000 settlement calls per process. It uses eight balanced pairs for each comparison.

For the separate predecessor course, retain the v0.41 adapter location from its own checkout and pass that file alongside the current location.

```sh
node scripts/benchmark-class-settlement.mjs --previous PREVIOUS_LOCATION --location CURRENT_LOCATION
```

That course uses 65,000 measured calls per account state and eight balanced four-process rotations. The previous SDK appears twice as an identical-build control.

The accompanying JSON retains the first short samples, longer samples, predecessor comparison, helper hashes, and all raw rounds. The first samples exposed excessive noise in very short workloads and prompted the longer course. The general SDK benchmark also passed.

These measurements cover warm desktop queries. Physical Steam Deck and older-mobile measurements, full frame pacing, and allocation-volume profiling are pending.
