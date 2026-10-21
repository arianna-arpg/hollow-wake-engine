# Container and relic seat policy (version 0.11)

The optional `@hollow-wake/engine/inventory/containers` entry supplies compiled
container ladders, item eligibility, landing verdicts, unique copy limits,
misfit detection, carried-item lookup and raw relic amplification. The isolated
Hollow Wake game delegates four existing helper modules to this entry. Its
World still commits ownership transfers, selects active containers, supplies
account features and interprets grants, gauges, procs and summons.

```ts
import { ContainerLayout, ContainerPolicy, SeatRules, SeatGeometry }
  from '@hollow-wake/engine/inventory/containers';

const layout = new ContainerLayout(definition.ladder);
const board = layout.board(authorizedFeatures); // null without the first unlock
const policy = new ContainerPolicy<Item>({
  footprint: item => itemBases[item.baseId],
  base: item => itemBases[item.baseId],
  level: item => requiredLevel(item),
  unique: item => item.uniqueId ? uniques[item.uniqueId] : undefined,
});
const rules = new SeatRules(containerPack.rules);
const geometry = new SeatGeometry<Item>(
  item => itemBases[item.baseId], (mods, mode) => rules.power(mods, mode),
);
if (board) {
  const verdict = policy.landing(definition, board, held, item, 'bag', x, y,
    characterLevel, bag, bagBoard);
  // The host authorizes and commits any successful body transfer synchronously.
  const factors = geometry.amplification(board, validSeatedItems, compiledModsOf);
}
```

The separate `@hollow-wake/containers` content package contains the original
container definitions and explicitly projected numeric seat rules. Its compiler
checks identities, acceptance fields, bounded ladder construction and rule caps.
The raw rung prices and quest/ledger gates remain preserved metadata; loading
this package does not implement purchasing or quest rewards. Item content stays
in the separate item package. The offline consumer connects real forged relics
to placement, neighboring power, empowered modifiers and a numeric stat sheet,
then removes that source and verifies the prior state returns.

## Ownership and host contract

`ContainerLayout` owns copied ladder strings and precompiled cell indices. It
does not retain an account, feature set or previous returned board. Each board
owns its boolean mask. `matches` compares geometry and feature inputs without
stringifying them, allowing the game adapter to replace a compiled layout after
an in-place edit. Its weak-key cache retains only the latest layout per live
definition; no cache grows with combinations of account unlocks. The first
rung controls existence, later owned rungs union their cells, and overlapping
frames retain the first rung as the cell's opening hint. Ragged frames and
empty later rungs retain their original behavior.

Public geometry bounds are 1–256 rungs, 1–256 cells per axis and at most 4096
canvas cells. Features are nonempty and unique; the first rung must open a cell.
Coordinates are safe integers. These are explicit SDK boundaries for valid
host state, not a migration policy for arbitrary malformed files. Legacy board
wire decoding keeps missing cells closed and ignores excess mask characters.
`packContainerBoard` requires a mask matching the canvas.

`ContainerPolicy` reads pure synchronous footprint, base, level and unique
definition ports. Arrays, item bodies and identities remain host-owned. Live
ports observe registry changes on the next operation. Placement verdicts carry
the original blocker object; a refusal never moves or drops an item. Bag-to-case
exchanges require the displaced piece to fit the vacated bag cell, while account
storage exchanges leave that destination to the host. Duplicate unique limits
exclude the moving and explicitly replaced object by identity. Misfit detection
keeps the first legal occupant; a repeated UID does not bypass occupancy.
The host remains responsible for access, locks, currency, body identity,
reconciliation destinations, death/tombstones, persistence and network authority.

`SeatGeometry` preserves ordered orthogonal adjacency over open cells. Touching
pieces are distinct by object identity; empty contacts are counted by footprint
edges. Its compatibility observation accepts overlaps with the original last
occupant winning the neighborhood grid. Call `misfits` first when computing
actual active contributions. The separate first-survivor misfit law must not be
substituted for that observation rule. Ports may be sampled once per object per
operation; they must be pure and nonreentrant. Reentrant calls are refused and
failed ports release the operation guard.

`SeatRules` owns its immutable amplifier/cap mapping. Only raw flat amplifier
lines contribute outward, solitude or communion power. Neighbor power is added
once, then own solitude/communion terms; the result is floored at zero.
Amplifier lines are consumed rather than recursively amplified. Ordinary seat
scaling and relic empowerment are separate laws: relic empowerment scales only
positive flat/increased lines on its explicit allowlist. Negative tradeoffs,
feedback links and structural lines remain raw; per-line caps still apply.
Content uses explicit `cap: null` for unbounded lines, preserving original
Infinity without relying on JSON's lossy numeric conversion.

The exported leaf functions also accept pure `SeatModePort` and `RelicCapPort`
reads. The live game uses these to read just the relevant stat instead of
rescanning its entire editable registry for each item. An absent cap is
`undefined`; the live port uses `Infinity` for an unbounded known cap. Invalid
negative/nonfinite caps and nonfinite factors/results are refused. Lookup keys
are data, not inherited object properties. `amplify` preserves the original
array when unchanged and retains unchanged line identities; it does not promise
a deep clone. `empower` owns its output array but similarly retains raw lines.

## Evidence and measurements

The primary fixture is independently emitted twice by the frozen original:
81 ladders, 1006 feature combinations, 2000 landing queries, 600 neighborhoods,
2816 cap/power cases and 12 complete World transitions. A separate additive
fixture records 16 live edits/restorations of frames, footprints, amplifier modes,
caps, baseline values and unique copy limits. It does not replace the primary
trace. Normal verification compares accepted observations without regenerating
them. The JSON comparison boundary normalizes signed zero; an independent
arithmetic assertion also verifies `-0` before serialization.

Independent cases pin the first unlock, owned masks, simultaneous exchanges,
identity preservation, unique replacement, nonrecursive neighboring crowns,
modifier ownership and failed/reentrant ports. Deliberately bypassing the first
unlock and doubling neighboring power must fail behavioral tests. The installed
game check compares both original fixtures and deliberately breaks its installed
layout to prove the delegation is exercised.

The benchmark compares original helpers, the retained version 0.10 adapter with
original container code, and this adapter. It rotates implementation order over
15 samples after three warmup batches and checks matching numeric results and
unchanged item bodies. It includes editable-content freshness work. Its character
row calls actual headless `recalcPlayer`; it is not a rendered frame benchmark.
The initial implementation and subsequent live-port optimization are retained
separately so prior gains or changed baselines cannot be attributed to this step.
Final workload medians are recorded with the milestone evidence.

Desktop i9-10900K / Windows x64 / Node 24.9.0, milliseconds per batch:

| Workload | Operations | Original | v0.10 adapter | v0.11 adapter |
| --- | ---: | ---: | ---: | ---: |
| First-rung board | 128 | 0.1116 | 0.1151 | 0.0467 |
| Full-case board | 128 | 0.1594 | 0.1632 | 0.0465 |
| Empty misfit check | 64 | 0.0049 | 0.0064 | 0.0266 |
| 25 pieces, misfits | 64 | 0.7669 | 0.7625 | 0.1604 |
| 25 pieces, neighborhood | 32 | 0.4438 | 0.4376 | 0.3319 |
| 25 pieces, amplification | 32 | 0.5624 | 0.5721 | 0.5138 |
| 144 pieces, misfits | 64 | 23.8071 | 22.3538 | 0.7403 |
| 144 pieces, neighborhood | 32 | 1.5662 | 1.5494 | 1.3482 |
| 144 pieces, amplification | 32 | 2.8577 | 2.8761 | 2.6441 |
| 1 line, empowerment | 256 | 0.0798 | 0.0855 | 0.0786 |
| 8 lines, empowerment | 256 | 0.1725 | 0.1431 | 0.1811 |
| 32 lines, empowerment | 256 | 0.5278 | 0.4106 | 0.4535 |
| Three-relic character rebuild | 4 | 0.4019 | 0.8140 | 0.7535 |

Rows with different operation counts are not directly comparable. The large
144-piece case is a stress board; the authored Reliquary has 25 canvas cells.
These are within-run comparisons, not guarantees across machines or sessions.

The first measured implementation improved dense misfit detection and ladder
folds but repeatedly scanned the entire cap registry for each empowerment call.
Direct live ports remove that avoidable work while preserving observed edits.
Empty validation-heavy operations and other measured regressions remain part of
the acceptance record. Earlier character-rebuild overhead versus the original
game also remains separate optimization work. No Steam Deck, mobile, GC, total
allocation or whole-frame performance claim is made.

Retained occupancy is at most 4096 bytes per policy and 16384 bytes per geometry
instance. Compiled ladder indices have an inspectable `indexedBytes` count;
that excludes their objects, strings and arrays. Returned neighborhoods, maps,
boards and modifier arrays still allocate. The optional modules have a 32 KiB
unminified JavaScript bound, expanding the combined runtime allowance from
192 KiB to 224 KiB for this capability. Existing core/module bounds remain.
The separate content package is bounded to 64 KiB unpacked. None of these file
size gates is a live-memory budget.

```sh
npm run verify
npm run reference:containers
npm run adapter:container-source
npm run adapter:prepare
npm run adapter:containers
npm run benchmark:containers -- --previous-adapter /path/to/retained-v0.10-game
```

Installed-package fault checks must run sequentially with other consumers of that
installation. The full SDK still has zero external runtime dependencies. These
contracts advance the engine-neutral rule boundary; full Unity, Godot and Unreal
packages, account progression and later combat systems remain unfinished.
