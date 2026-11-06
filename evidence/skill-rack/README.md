# Skill rack acceptance

The original and the installed game produced byte-identical observations for
954 learn-and-return pairs, 39 targeted actions and six character reloads.
The independent package consumer upgraded a learned skill in place, returned
both wrappers and retained the locked support. The original Inventory screen
also accepted a dropped upgrade, refused unlearning into a full pack, and
returned the skill after one cell opened.

| Evidence | What was exercised |
| --- | --- |
| [Installed game](installed.json) | Package identity, original action and save observations, deliberate broken duplicate upgrade |
| [Standalone JavaScript](standalone.json) | Offline installation and the runnable [skill rack example](../../examples/skill-rack.mjs) |
| [Mounted controls](workshop-controls.json) | Actual Hollow Wake inventory DOM events and dispatched World intents in a hidden Electron renderer |
| [Timing samples](benchmark-windows.json) | Same installed World with the SDK and original method bodies, plus a second original-code control |

On the Windows i9-10900K, a learn/remove cycle cost 12.07 μs per SDK action,
and duplicate replacement cost 25.01 μs. A full-bag refusal cost 0.78 μs.
The original medians were 12.26, 24.56 and 0.73 μs. All three variants
produced identical results and allocator advances. The report includes the
preliminary short batches and the longer run with all six execution orders
repeated twice. These are menu actions with the world already loaded.
Physical Steam Deck and mobile timings remain open.

Run the following against one prepared game and the installed desktop
runtime. The UI check adds five hash-verified shell files to that disposable
game for the duration of the test. It cleans up its build, profile and saves.
Both output paths below must be new.

```sh
npm run reference:skill-rack
npm run adapter:skill-rack -- --location PREPARED_RECEIPT
node scripts/test-skill-rack-ui.mjs PREPARED_RECEIPT ELECTRON_EXECUTABLE NEW_UI_REPORT
node scripts/benchmark-skill-rack.mjs --location PREPARED_RECEIPT NEW_TIMING_REPORT
```

## Verification footprint

The attack-sequence, recovery and cooldown fault suites now copy only the
unbundled modules their tests import. Each suite reuses one private fixture,
starts a fresh Node process per fault and cleans up even when a fault
survives. Its receipt retains the full test output in
`logs.base64` as gzipped UTF-8 JSON. Unzip it to recover the per-fault text
and compare each entry with `results[].logSha256`.

The four suites exercised the same 69 named source mutations and hashes as
the prior verified run. The largest scratch fixture held six files. Both
catalogue tests also remove their generated tables or database in teardown.
The success and deliberate-failure checks left their temporary directory
empty. [Verification footprint](test-footprint.json)
