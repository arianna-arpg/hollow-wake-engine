# Secret vocation sites

Install `@hollow-wake/engine/progression/vocation-sites` to run secret-site
rules with host-owned terrain, actors and presentation. This entry loads its
placement and discovery rules and the shared save keys. A game that uses only
vocation quests can continue importing `progression/vocations`.

| Function | SDK responsibility | Host responsibility |
| --- | --- | --- |
| `matchesVocationSite` | Evaluate safe ground, level, biome, layout, patron, territory and harbor conditions in source order | Provide live territory ownership and biome patrons |
| `placeVocationSites` | Skip live duplicates, seed the site’s own stream from the run, vocation and zone, roll availability, then draw its position | Supply stable registry order, the source-compatible hash and random stream, projected zone bounds and a spawn callback |
| `spawnVocationSite` | Create the NPC, publish the actor and site in order, then draw and place each authored decoration | Construct actors, resolve clear positions and publish the resulting objects |
| `discoverVocationSites` | Apply the radius boundary, one-time silence, class and durable-account authority, then write the discovery credit | Supply current distance, run and account ledgers, cue presentation and the character notification |

The simulator uses the same stream for the availability roll, normalized X
and Y draws and the decoration draws. Content authors can change the site’s
filter or chance when loading definitions. Calling code supplies a stable
registry order and hash when replay compatibility matters. Host callbacks are
synchronous. A failure after actor or ledger publication leaves the earlier
writes visible.

```js
import {matchesVocationSite, placeVocationSites, discoverVocationSites}
  from '@hollow-wake/engine/progression/vocation-sites';

// Build ports when the host world opens. Resolve physical actors and terrain there.
const qualifies = (zone, filter) => matchesVocationSite(zone, filter, territory);
const placement = {...worldPlacement, qualifies};
placeVocationSites(zone, placement);        // on load or a harbor-opening event
discoverVocationSites(activeSites, discoveryPorts); // during a simulation update
```

The [frozen original survey](../baseline/vocation-sites/README.md) covers all
eight authored secret callings, generated-zone revisits and a harbor opening
while the player is still there. The physical siege input is supplied as
complete. The real game performs its reward, places the Mooring Stone and
preserves the discovery credit on revisit. The [Windows acceptance
record](../evidence/vocation-sites/runtime-windows.json) describes the standalone
archive, game installation and retained inputs.

```text
npm run build
npm run test:vocation-site-package
node scripts/test-vocation-site-overlay.mjs
npm run adapter:prepare
node scripts/test-reference-vocation-sites.mjs --location .artifacts/adapter-location.json
node scripts/test-installed-vocation-site-faults.mjs --location .artifacts/adapter-location.json
```

Placement selects the vocation id and spawn method before generating its X and Y coordinates. The Hollow Wake adapter preserves the World receiver if a callback replaces the method during the position draws. The [original callback-order fixture](../baseline/vocation-sites/spawn-order.json) records that case.
