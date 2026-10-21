# Paged storage policy (version 0.10)

`@hollow-wake/engine/inventory/stash` supplies page costs, first-fit addresses,
cross-page exchange plans, overflow inspection and lossless layout repair.
The Hollow Wake adapter delegates the original `engine/stash.ts` helper surface,
shared by account relic storage, personal Immortal lockers, UI previews and save
loading. Item bodies, account authorization, currency payment, page ownership,
death/tombstone rules and disk writes remain host-owned.

```ts
import { StashPolicy } from '@hollow-wake/engine/inventory/stash';

const storage = new StashPolicy<Item>(item => footprints[item.baseId]);
const definition = {
  id: 'locker', board: { w: 6, h: 4 },
  initialPages: 1, maxPages: 8, pageCostBase: 40,
  accepts: (item: Item) => !item.questId,
};
const layout = storage.restore(definition, entries, savedLayout);
const plan = storage.plan(definition, entries, layout, incomingEntry);
if (plan) {
  // The host now commits body ownership and this address plan together.
}
```

## Ownership and decisions

Each entry has a nonempty unique storage `key` and a host-owned `item` with a
string or numeric `uid`. Storage keys and session item IDs are separate concepts.
The footprint port reads item content, not its bag coordinates. The definition's
acceptance and optional board-mask ports are pure synchronous reads. Operations
are serialized and port reentrancy is rejected. No registry, item array, content
definition or previous layout is cached in the policy instance.

Pages are bounded to 256, with 1–4096 cells per board and at most 256 cells per
axis. Page costs must be finite, nonnegative and stay within the safe numeric
range through the definition's maximum. These are explicit SDK boundary rails;
the game's definitions use one to eight pages. Live planning expects an already
restored layout. `restore` accepts legacy missing fields, clamps page count and
partial investment, retains legal saved cells first, then repairs remaining
accepted pieces in entry/page/row-major order. Rejected or unfitted bodies stay
in the caller's collection as recovery entries. The policy never discards them.

A new deposit is refused while recovery entries exist, even if a visible cell
is vacant. Existing entries may still be rearranged or recovered. An exact move
can exchange one blocker into the mover's old address, including across pages,
only when both final footprints fit. A `vacate` key supports exchanging worn
equipment into a storage address; it does not permit an additional blocker swap.
Refusals return `undefined` and leave all input arrays, bodies and addresses intact.

Successful plans own their address objects, including untouched addresses. This
deliberately strengthens the original helper's shallow aliasing: editing a plan's
coordinates cannot mutate the prior layout. Unchanged state/address extension
fields are retained shallowly; this is not a deep-copy contract for arbitrary
extensions. Repair outputs the defined address fields, as the original did.
Opaque keys such as `__proto__` are handled as own data properties rather than
object setters or inherited properties. Duplicate storage keys fail explicitly;
repeated session UIDs retain the original placement identity rules and have
separate reference coverage. These boundary decisions do not rewrite valid game
content or accepted game transactions.

`page` explicitly returns the original shallow item view with storage coordinates;
nested payload references remain host-owned. `overflow` returns original entries.
Neither view is used by the optimized planner. Authorization, moving bodies,
debiting currency and persistence must be committed by the host after a valid
plan, synchronously without intervening state changes. Plans are not distributed
transactions, authentication or complete game saves.

## Implementation and measurements

Internal geometry uses compact placement records containing UID, footprint and
coordinates. Repair maintains operation-local page views rather than repeatedly
copying and scanning all payloads for each accepted item. First-fit uses the
existing bounded inventory buffer; retained occupancy is at most 4096 bytes per
policy instance. Temporary page views and returned address plans still allocate.
No total-allocation or whole-frame claim is made.

The three-way desktop benchmark compares actual original game helpers, the M11
inventory adapter with original storage policy, and the new storage adapter.
It uses three warmup batches and 15 rotating-order samples per workload, with
matching checksums and unchanged inputs. Repair rows are four operations per
sample; fit and exchange rows are 32. These batch medians must not be compared
as if they were one operation each. Machine: i9-10900K, Windows x64, Node 24.9.

| Workload | Operations | Original (ms) | M11 (ms) | M12 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Empty repair | 4 | 0.0019 | 0.0018 | 0.0102 |
| 24 items, legal layout | 4 | 0.3315 | 0.3460 | 0.1523 |
| 24 items, recovery | 4 | 1.3278 | 0.7493 | 0.2519 |
| 24 items, full first-fit | 32 | 0.4544 | 0.1134 | 0.1068 |
| 24 items, exchange | 32 | 0.6323 | 0.6508 | 0.6047 |
| 192 items, legal layout | 4 | 8.0608 | 8.4368 | 0.4248 |
| 192 items, recovery | 4 | 68.3561 | 32.6815 | 1.7597 |
| 192 items, full first-fit | 32 | 4.4714 | 1.6521 | 1.3255 |
| 192 items, exchange | 32 | 3.4789 | 3.3381 | 3.7961 |
| 200 items, legal plus overflow | 4 | 37.5458 | 33.8542 | 0.6068 |
| 200 items, recovery | 4 | 116.1950 | 78.4290 | 1.7272 |

Large repairs improve substantially; empty repair and the larger exchange case
retain overhead from validation and independent address plans. The first measured
implementation and the final samples are both retained. Baseline timings vary
between processes, so comparisons use candidates measured within the same run.
These receipts do not establish Steam Deck/mobile speed, cold disk performance,
GC budgets, frame rate or universal superiority of one data layout.

## Reproduction and limits

The original independently emits 400 repair cases, 3000 stateful storage commands
and a separate 18-case legacy/repeated-UID fixture. The first main captures agreed
byte-for-byte; adding the legacy fixture did not replace the accepted main trace.
Normal checks only compare accepted evidence. Independent SDK tests cover recovery
capacity, simultaneous exchanges, refusal isolation, owned addresses, opaque keys,
invalid contracts and failing/reentrant ports. Two behavioral mutants and an
installed planner fault must be detected through actual behavior differences.

```sh
npm run verify
npm run reference:stash
npm run adapter:stash-source
npm run adapter:prepare
npm run adapter:stash
npm run benchmark:stash -- --inventory-adapter /path/to/retained-m11-game
```

The benchmark requires a separately retained M11 installation so prior gains are
not misattributed to this change. Installed-package fault checks must run
sequentially with any consumer or renderer build using that installation.
The Oracle UI course exercises page purchase, grid gestures, equipment exchange,
private storage, real app reload and death persistence. Its frozen navigation
predates the current separate player and NPC books: it names the removed
`.dialogue-close` class, toggles a remembered page as if opening it, and assumes
an Oracle tab exists even when it is the only service. The unmodified course
fails at the first close click on both M11 and M12. Intermediate navigation-only
revisions also exposed the Oracle surface covering the intended exchange cell.

The explicit `oracle-navigation/v1` test revision uses the current close control,
requests the Reliquary in show mode, closes Oracle before that exchange and
reopens it afterward. Added assertions check the relevant panels are visible
and closing NPC services preserves player Inventory. Both M11 and M12 pass all
five completed acceptance groups with this revision. All original gameplay,
pointer-drag and persistence assertions and source hash checks remain intact.
`--baseline-storage-ui` retains the failing original course. Profiles and saves
are isolated; no game UI code or frozen harness is modified. The decision and
failed controls are retained with the milestone evidence.

Container acceptance/ladder policy, seat amplification, account ownership and
earning are still separate extraction work. Successful integration here does not
complete that family or establish a Unity, Godot or Unreal package. The runtime
keeps zero external dependencies, and SQLite remains optional content tooling.
