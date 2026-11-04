# Vocation progression

The original game creates 92 quest steps from 31 vocation definitions. The
quartermaster checks each offer against the current character, the run ledger
and the local account. A completed chain can open the vocation’s passive root.
The [acceptance record](../baseline/vocation-progression/acceptance.json)
identifies the captured engine files, observations and faults by hash.

## Who owns each decision

- The host supplies authored definitions in registry order, current progression
  policy and live ledgers. Generated steps share their original zone reference.
  A secret vocation’s offer and turn-in share the same list of givers.
- Odyssey progression, available vocation slots, class, prior run steps, secret
  discovery and account unlocks all affect the offer. Account step credit
  alone cannot satisfy a previous step. Expanding the live character cap
  can open another choice while a repeated grant remains closed.
- The recipient’s character gains the vocation and passive root. Run unlock
  credit increases by one. When the local mode permits account progression,
  durable unlock credit is set to one. A sealed Undying local character still
  receives run credit. For a second seat, the recipient controls character
  changes while the local mode controls account writes.
- Recalculation, dirty notifications and the two announcements happen in
  source order. Synchronous reentry sees the first grant. If a callback throws,
  the earlier character and ledger writes remain visible.

## Reproduce the boundary

After installing the SDK development tools, prepare the source capsule and
reference tooling. Run the following commands in the SDK checkout.

```text
npm run reference:prepare
npm run reference:install
npm run build
node scripts/test-reference-vocations.mjs
node scripts/test-vocation-source-faults.mjs
```

Use `node scripts/test-reference-vocations.mjs --location .artifacts/adapter-location.json`
to run the same observers against an isolated installation. Each result must
match the pre-extraction bytes. The survey evaluates 256 labelled states for
each of the 92 steps and observes 14 grant scenarios. A second fixture follows
the real three-step Warbringer chain in mortal and sealed runs. It exercises
a stale menu choice, quest acceptance, turn-in, repeat refusal and the final
unlock. The fixture supplies the completed field objective. Physical discovery
sites, field combat and the general quest reward engine have separate boundaries.

The sixteen source fault controls change individual gates, identity, durable
credit, root selection or callback order. They must change the expected
observation for the intended reason. The stored game fixtures are the
authority for both the standalone package and the game adapter.

## Install and call the optional module

Build and pack this checkout with `npm run build` and `npm pack`. Install the resulting `.tgz` in the host application. The vocation entry point accepts typed host objects and has no production dependency. Only applications using it load these rules.

```js
import {createVocationQuests, grantVocation} from '@hollow-wake/engine/progression/vocations';

// Build once from the host’s ordered definitions and live configuration.
const steps = createVocationQuests(definitions, config, account => account.odyssey_stage_1 >= 1);
const canOffer = steps[0].gate({classId, vocations, runLedger, accountLedger});

// After the host validates a final turn-in, use the recipient’s seat.
const granted = grantVocation(vocationId, seat, ports);
```

Use the SDK’s separate catalogue archive for the original authored definitions. Read `tables/vocations.json` and reconstruct insertion order from `registry-order.json`. Keep the compiled steps in memory. The Hollow Wake adapter delegates its actual quest generator and grant method to these entry points. The host continues to own generic level and ledger requirements, persistent storage, geometry, recalculation and presentation.

`npm run test:vocation-package` installs both archives into a separate project, checks type declarations and tests all 31 definitions and 92 steps against the frozen game.

The public branch’s **Verify vocation progression** workflow also offers the two tested tarballs together. Download `hollow-wake-sdk-and-catalogue` from a successful run, extract it and compare the tarball SHA-256 values with `archive-index.json`. Install the two local archives with your host’s package manager. Workflow downloads have a 14-day lifetime.

## Verify the visible path

Build a renderer from a prepared game. Run the same smoke check against a preceding installation and the new one.

```text
node scripts/test-vocation-ui.mjs --game <renderer-game> --dist <renderer-dist> --electron <electron-executable>
node scripts/test-vocation-ui.mjs --game <new-renderer-game> --dist <new-renderer-dist> --electron <electron-executable> --compare <first-report>/observations.json
```

The check clicks the quartermaster’s **Undertake** button, verifies that the chosen quest is active and uses the Inventory passive-tree button to inspect Warbringer’s root before and after a real grant. The grant is invoked directly in this UI check. The separate chain fixture exercises all three turn-ins through the game’s reward path.

[Windows installation and UI results](../evidence/vocation-progression/runtime-windows.json) include the standalone and installed package checksums.
