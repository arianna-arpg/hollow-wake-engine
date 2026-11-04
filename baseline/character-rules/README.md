# Character rules reference

The three compressed observations came from the pinned Hollow Wake game before each corresponding SDK implementation. Each observer calls the game's production entry points. The fixture digests, source methods, and twenty separately reproduced wrong outcomes are in [acceptance.json](./acceptance.json).

| Fixture | Player behavior observed |
| --- | --- |
| Identity | Creation, serialization, rebuilding, and resumption for all 39 classes. The account checks cover 160 discovery and selection states, including a retired ID. Four save variations exercise missing values, custom and empty openings, trimmed names, and a retired class. |
| Kits | 636 combinations of owned tiers, remembered choices, explicit requests, and invalid choices. Each of the 39 classes starts a real character with a chosen opening, serializes it, rebuilds it, and adds an ally with an independent opening. |
| Claims | Six claim scenarios for each of the 36 earned classes. Settlement in both catalogue orders grants all 36. A second settlement grants none. Checks include local and merged ledger reads, investment removal, support and skill grants, pending state and Vault activation. |

After `npm ci`, `npm run reference:prepare`, and `npm run reference:install`, run:

```sh
node scripts/test-reference-character-rules.mjs
node scripts/test-character-rule-source-faults.mjs
```

To test a game that already has the SDK installed, pass its directory to `test-reference-character-rules.mjs --game`. It compares all three outputs byte for byte. The fault suite modifies only a fresh copy and checks that restoring each source returns the original behavior.

The simulation supplies qualifying deeds and purchased mastery tiers directly. The separate desktop observation follows the Begin button into Mu, dwells at the awake vessel, swaps Cleave for Carve, wakes the named Warrior, claims Ranger in the Vault, restarts, and clicks Continue. It verifies the saved opening, live bar and durable identity. It supplies the completed prologue, prior death, mastery ownership, deed count, and proximity to the vessel. Comprehensive save migrations, simulation of the qualifying deeds, and target-device timing remain separate.

On Windows, `node scripts/test-reference-character-screen.mjs --electron ELECTRON` rebuilds the original game directly from the retained repository capsules and compares the player interaction to `screen.json`. To check an already built game, supply its project, output directory, and matching Electron executable.

```sh
node scripts/test-character-rules-ui.mjs --game GAME --dist DIST --electron ELECTRON
```
