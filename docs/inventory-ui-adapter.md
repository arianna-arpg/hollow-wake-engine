# Inventory cancellation acceptance repair

The isolated Hollow Wake adapter disarms the local player's sell/break mode
before closing its NPC station. Inventory and the station stay open on that first
Escape or controller Cancel. Another Escape closes the NPC group while retaining
the player pages; a later Escape follows the configured player-panel policy.
Guest cancellation already used this order. Higher-priority minigame, forge trace,
pause, couch-join and dialogue handling remain ahead of inventory disarming.

This is an explicit repair of a captured game defect, not a change to numeric SDK
rules. The original working checkout, frozen source capsule and accepted original
fixtures remain unchanged. Earlier failing reports remain in milestone-five
evidence. The UI is still game-owned; this does not extract Inventory presentation
into the portable runtime.

## Evidence behind the decision

The earlier course failed with original and SDK item generation at
`Escape disarms before step closes panels`. Instrumenting the real route showed
`closeNpcFront` consuming the press, closing the vendor and clearing its armed
mode before `cancelSalvageMode` could run. The original Inventory contract requires
disarming before panel dismissal.

That course also had a stale assertion: after disarming, the next Escape was
expected to close both vendor and Inventory. The newer independent NPC/player
contract and `dialogue-services-ui.cjs` require closing an NPC to preserve the
player page under every Escape setting. The repair retains every disarm assertion,
adds an NPC-only close check for each setting, and replaces the stale assertion
with separate NPC and player close checks. It does not suppress the product defect.

The revised course passes 68 checks, page navigation passes 81, and the unchanged
NPC reentry/close course passes 24 visit cases plus six shop cases. The original
launcher game-smoke assertions also pass against an isolated copied install.
A control build restores **only** the original Escape ordering: the revised course
fails at the original disarming assertion again. The two build manifests have
identical game source hashes; the control transform records its own source hash
and must confirm it actually ran.

## Reproduce safely

`adapters/hollow-wake/integrate-inventory-ui.mjs` checks every input before applying
the two-file repair. It accepts the captured overlay and the reviewed managed
checkout variant predating the `bountyPassages` import. It preserves that difference
instead of copying unrelated unfinished content into the adapter. Other changes
and repeated application are refused before writes.

`npm run adapter:prepare` includes this repair in a new reconstructed adapter.
`npm run adapter:ui-source` verifies both variants, all-input preflight, preservation
of unrelated edits and refusal to reapply. These source checks run in CI; renderer
acceptance uses a full game checkout and Electron locally:

```sh
node scripts/build-game-item-ui.mjs --game GAME --output NEW_BUILD
node scripts/test-game-item-ui.mjs --game GAME --dist NEW_BUILD --electron ELECTRON --services
node scripts/test-game-boot.mjs --game GAME --dist NEW_BUILD --electron ELECTRON
```

For the negative control, build a different new directory with `--original-escape`
and run the UI command with `--inventory-only`. It must fail with the specific
original disarming assertion. `--baseline-ui` inspects an untouched original
harness; it does not make the repaired adapter's checks optional. Unknown harness
changes are rejected.

`test-game-boot` copies the unmodified launcher, committed defaults and built game
into a new directory. Its bootstrap only sets an isolated profile and disables
hardware acceleration for the hidden course. It invokes the original
`electron . --smoke-test=game` mode, including its error-watcher self-test. It never
uses real saves, local launcher settings or an existing game build directory.

These checks cover the exercised desktop UI paths and package delegation. A full
dependency/update installation, native engine plugins, device performance and the
remaining gameplay extraction are still pending.
