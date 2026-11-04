# Secret vocation sites

The pinned game has eight secret vocations. This fixture captures how a zone
qualifies, which shrines appear, where their NPCs and decorations stand, and
when a nearby character receives the calling. The original World generated the
compressed observations before SDK site implementation began. The public
observer normalizes the last line ending of the capture script. Both script
hashes and the expected observation hash are in [acceptance.json](acceptance.json).

The tests use 160 authored filter decisions and 5,760 controlled combinations
of safe ground, level, biome, layout, harbor state and live territory ownership.
Across 80 generated or static zone-and-seed inputs, 46 produce at least one
shrine. Four qualifying generated zones go through the real load and revisit
path. Each of two harbor courses starts with a besieged hold, supplies the
completed siege boundary and lets World pay the defense, place the Mooring
Stone, discover its calling and revisit the zone.

The generated zones use selected biome and level inputs so each run can exercise
the same paths. Seven independent faults change safe-ground admission, the
level threshold, territory ownership, the proximity boundary, repeated silence,
the random seed identity or a decoration angle. Each fault must change its
designated observations. A restored control must then reproduce the original
bytes again.

With the SDK and pinned reference tooling installed, run the original survey,
its source faults and the comparison against an isolated game adapter.

```text
npm run reference:prepare
npm run reference:install
node scripts/test-reference-vocation-sites.mjs
node scripts/test-vocation-site-source-faults.mjs
npm run adapter:prepare
node scripts/test-reference-vocation-sites.mjs --location .artifacts/adapter-location.json
```
