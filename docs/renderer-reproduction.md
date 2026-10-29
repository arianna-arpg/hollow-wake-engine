# Reproduce the isolated game renderer

The source capsule deliberately excludes media and entry pages. Previously,
renderer checks borrowed five files from a retained local game copy. The hashed
`baseline/renderer-shell.json.gz` now supplies those exact entry pages, favicon,
launcher configuration and Vite configuration. It is test material and is excluded
from the SDK package. No new runtime dependency or game release is introduced.

Start in a fresh SDK checkout with its locked dependencies installed:

```sh
npm ci
npm run build
npm run reference:prepare
npm run adapter:prepare
npm run adapter:renderer-prepare
node scripts/build-game-item-ui.mjs --game .artifacts/game-renderer --output .artifacts/game-renderer-dist
```

The renderer preparation step copies the prepared adapter into a new folder and
adds the verified shell. It borrows the adapter's installed dependencies, hashes
the full installed SDK and copied files, and leaves its inputs unchanged. Output
must not already exist or resolve inside the supplied game, including through
a directory link. Source links other than the dependency directory are rejected.
For a named adapter or another fresh output, pass `--location <adapter-location.json>`
and `--output <new-folder>` after `npm run adapter:renderer-prepare --`.

Supply an Electron executable explicitly for the hidden renderer tests. The
recorded refund-bank captures used Electron 43.0.0 on Windows with software
rendering and a 1280 × 800 content viewport:

```sh
npm run adapter:ready-bank-ui -- --game .artifacts/game-renderer --dist .artifacts/game-renderer-dist --electron <electron-executable>
npm run adapter:ready-bank-ui-controls -- --game .artifacts/game-renderer --dist .artifacts/game-renderer-dist --electron <electron-executable>
```

The second command builds five disposable faulty copies and requires their
failures at specific display stages. It preserves the supplied project, package
and bundle, and restores the successful comparison pointer. Existing renderer
commands can use the same full game and bundle with their own accepted fixtures.

The 23 refund-bank stages compare ordered state, operation and Canvas paint
observations against two independent executions of the original Assault methods.
The original renderer, Assault source and tree data were unchanged in that
predecessor adapter. Other previously accepted SDK integrations were present;
these were not captures of a pristine whole game.

Real World frames publish the HUD, including pause/resume, policy retirement and
host removal. Refund and command occurrences and recipients are controlled;
this does not establish physical input, recipient selection, complete Assault
delivery, pixel equivalence, another display scale or device performance.
See [the evidence](../evidence/ready-cooldown-bank/renderer.json).
