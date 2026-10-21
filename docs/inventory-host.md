# Live inventory host (version 0.9)

`@hollow-wake/engine/inventory/host` exposes the existing game's placement rules
over host-owned item arrays. The Hollow Wake adapter delegates cell lookup,
overlap, placement, swap eligibility, first-fit and removal through this entry.
The same helpers serve the bag, masked containers and storage transfers.
Container eligibility, stash paging/recovery, account ownership, equipment and
relic power policy remain in the game; geometry delegation does not extract them.

## Ownership and API

```ts
import { InventoryHost } from '@hollow-wake/engine/inventory/host';

const inventory = new InventoryHost<Item>(item => footprints[item.baseId]);
const board = { w: 12, h: 12 };
const cell = inventory.firstFit(items, incomingItem, board);
if (cell) inventory.place(items, incomingItem, cell.x, cell.y, board);
```

The host supplies trusted live records with a string or numeric `uid`, optional
integer `x`/`y`, and a pure footprint reader. Every operation receives its array
and board explicitly. An optional pure `board.open(x, y)` supplies a live mask.
Calls are synchronous and serialized; callbacks must neither mutate nor reenter
the host. Command coordinates must be safe integers; dimensions are positive
integers, at most 256 per axis and 4096 cells. This API is not a network-command
validator or save migration layer. Use the separate strict `Inventory` API when
the SDK should own, validate and copy payloads and save data.

Arrays, payloads, object identity, insertion order and temporary missing positions
remain host-owned. A record missing either coordinate is unplaced. Existing
off-board footprints are clipped when building first-fit occupancy. A repeated
UID is skipped as the moving identity, and placement does not append another
record with that UID: these are retained original rules, not global uniqueness
enforcement. `itemAt`, `overlapping`, `swapBlocker` and `remove` return original
objects. `remove` clears the removed object's coordinates. `place`/`autoPlace`
write coordinates and append only after all eligibility reads succeed.
`swapBlocker` only reports the valid blocker; the host performs its atomic action.

The adapter keeps the game's existing bag-dimension/expansion source in the game.
The SDK has no global board callback, retained bag or registry. External array
replacement, item movement, footprint edits and mask edits are observed on the
next call. A persistent cached grid would be unsafe while crafting, save loading,
rollback and storage code retain direct write access to those records.

## Measured implementation

Single-cell and collision queries use early-exit scans. First-fit constructs one
fresh occupancy bitmap per operation, then scans candidates in original row-major
order. The instance reuses its buffer, grows it only when needed and retains at
most 4096 bytes of occupancy storage. `scratchBytes` reports that buffer alone;
it excludes JS object/VM overhead. An empty unmasked bag skips bitmap allocation.
No item payload is copied or retained. This is not a total-allocation claim.

The recorded desktop comparison uses actual original and installed adapter
helpers, 25 alternating samples of 256 operations after six warmup samples, with
matching checksums and unchanged input bags. First-fit repeatedly tests five real
footprints; hover combines actual cell lookup and placement checks. These are
warm helper batches on an i9-10900K with Node 24.9, not rendered frame times.

| Board | First-fit original → adapter (ms/256) | Hover original → adapter (ms/256) |
| --- | --- | --- |
| Empty 12×12 | 0.0344 → 0.0304 | 0.0481 → 0.0509 |
| 72 items | 33.5765 → 0.7050 | 0.7541 → 0.6925 |
| 143 items | 121.0656 → 1.3130 | 1.2573 → 0.8985 |
| 144 items | 121.0687 → 1.3184 | 1.2689 → 0.8787 |
| Authored trace board 0 | 12.1894 → 0.4501 | 0.4971 → 0.3480 |
| Authored trace board 1 | 0.1842 → 0.1862 | 0.0526 → 0.0641 |
| Authored trace board 2 | 0.3136 → 0.1993 | 0.0565 → 0.0647 |
| Authored trace board 3 | 0.0392 → 0.0293 | 0.0263 → 0.0255 |

Crowded first-fit improved about 48–92× in these workloads. Small hover cases
include regressions; neither a universal speedup nor Steam Deck/mobile performance
is established. Device measurements, allocation profiling and whole-frame work
remain required. The optional entry adds 7307 unminified runtime bytes; total
runtime is 169046 bytes, within the unchanged 192 KiB combined package gate.

## Evidence and reproduction

The independent original observer records 1400 query/action cases, three live
footprint revisions and 19 complete World transitions. These include masked
placement, exchanges, external array edits, personal/account storage, active
relic effects, save/reload, full-bag refusal and guest refusal. The original M3
3000-transition sequence also runs through this live host with identity checks.
Two runtime mutants and an installed-package occupancy fault must produce actual
behavior mismatches. Import or syntax errors do not count as detected faults.

The first proposed World capture accidentally omitted the item-forging RNG port.
A second original execution exposed a socket difference. That candidate and its
game receipt were revoked. Only the observer was corrected to pass a seeded RNG;
two independent original runs then agreed byte-for-byte. The rejected capture,
hashes and decision remain under `baseline/milestone-eleven/`. Normal verification
compares the accepted fixture and never regenerates it.

```sh
npm run verify
npm run reference:inventory-host
npm run adapter:inventory-source
npm run adapter:prepare
npm run adapter:inventory-host
npm run benchmark:inventory-host
```

Run installed-package fault checks sequentially with other consumers of that
installation. Source overlays refuse unknown source hashes and repeated edits,
including on CRLF checkouts. Renderer checks use the packed package in a complete
isolated build: the new mounted preview/painting and World-intent course supplements
the existing Inventory courses. It is application integration evidence, not a
claim that the new course simulates native pointer gestures. Profiles and saves
remain isolated. The original checkout and unfinished overlays are read-only.

Receipts live in `evidence/milestone-eleven/`. The managed game branch is a local
integration artifact; SDK publication does not modify or publish the original game.
