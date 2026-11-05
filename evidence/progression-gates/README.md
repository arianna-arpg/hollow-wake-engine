# Progression gate reference

This baseline records the original game's account-gate vocabulary before its SDK implementation.

It covers 30 account states and 37 row forms, plus all 88 authored catalogue entries with any-of requirements. The observer compares membership, labels, progress, callback order, empty gates, any/all composition, legacy quest counters and derived level milestones. The 360 composition cases retain the original short-circuit behavior.

The class milestone list preserves borrowed row identities. Sparse derivation arrays and zero or fractional numeric thresholds are recorded explicitly. Nonfinite values use a distinct JSON representation so a numeric edge case cannot silently collapse to a null value.

Two original runs and the v0.42 installed game adapter produce the same observation hash. All 31 deliberate source faults produce the separately recorded incorrect result, followed by restoration of the original result. The SDK gate runtime has yet to be implemented.

Run the original and fault checks after preparing the pinned reference tools.

```sh
npm run reference:prepare
npm run reference:install
node scripts/test-reference-progression-gates.mjs
node scripts/test-progression-gate-source-faults.mjs
```

The reference command also accepts `--game PATH` for a prepared installed game. It checks the game source and installed SDK package for changes around the observation.

The initial observer was refined to record alias ownership as data and to include a fractional-only level stamp. Both changes preceded implementation. Ordinary verification reads the accepted fixture and compares its bytes.
