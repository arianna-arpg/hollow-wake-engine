# November 17 Inventory revision

This release extends the [combat parity baseline](prototype-parity.md) through
prototype commit `d7a381b1287367faa64e0897e2435a5adf91767e`. The November 16 and
October source capsules and accepted recordings remain unchanged. This is an
explicit revision, not a live connection to the prototype or another coding chat.
Later prototype changes need a new intake and verification pass.

The four late commits changed 123 captured files. The audit compares the complete
exported catalogue, registry order, executable catalogue rules and runtime data.
It found 4,273 catalogue leaves and 5,464 runtime leaves changed. These counts
overlap: runtime registries and progression repeat some catalogue definitions.
All changed leaves are presentation fields except the explicitly reviewed removal
of the `buff` tag override from Decoy's **Quiet Departure** node. Its remaining
buff payload, duration, modifiers and tree links are unchanged. The revised tag
and all 457 support-fit results have an independent original-game recording.

The source review also covers changes that are not catalogue leaves: compact/full
stat tooltip selection, proc and combo reference formatting, the optional combo
`detail` field, generated description helpers, and the UI's new detail bindings.
World/menu/vendor presentation and optional unlock text remain in the source
evidence, outside the required combat/Inventory package. The quest campaign and
save architecture are not imported by this revision.

The updated skill, support, passive, class, Vocation, container and unique-item
content is compiled into the applicable packs. A separate inspection module
supplies compact/full cards, skill-tree nodes, stat details and proc/combo
references. Item descriptions, modifier comparisons, historical choice rolls and
trigger references are checked against 26,407 original-game cases. Inspection
does not predict live damage or authorize spending, socketing or equipment edits.

## Using the inspection module

Load `@hollow-wake/character-builds/builds.json` and
`@hollow-wake/characters/inspection.json` from the same distribution, then:

```js
import {createInventoryInspector} from '@hollow-wake/characters/inspection';

const inspect = createInventoryInspector(builds, inspection);
const card = inspect.card('skills', 'summon_skeleton_mage', 'full');
const node = inspect.treeNode('summon_skeleton_mage', 'grave_academy', 'full');
const stat = inspect.stat('minionDamage', 'full');
const item = inspect.item(inventoryItem);
```

The host chooses display mode and renders returned strings as text. It owns
layout, icons, input and accessibility. Results are detached; changing a card
does not alter subsequent inspection or combat. Unknown IDs return `null`;
unknown categories, invalid modes and mismatched packs are rejected. Proc/combo
references preserve authored order, positive flat modifiers, deduplication and
the original six-entry limit. Full references are authored base effects, not a
promise of final damage after defenses, proc power or live context.

The inspection module and its bounded text payload load only when requested.
Neither the normal character entry nor combat imports them. There is no browser,
filesystem, database, quest or persistence dependency in that module. Existing
item instances and investments retain their IDs; text refreshes do not rewrite
player inventories. The matching kit and item content IDs change deliberately,
so hosts must install the five archives together and explicitly admit old data.
The browser code has a 48 KiB ceiling; its separately loaded compact JSON has a
3.25 MiB ceiling. These are package bounds, not estimates of process memory.

## Reproduction and qualification

`baseline/prototype-revision` holds a hashed source delta against November 16,
independent content/inspection recordings, a complete file classification and
the item observer's acceptance record. Captures refuse to replace accepted data.
Reproduction uses four fresh original processes for content/inspection and two
for items. Temporary source copies reuse locked tools and are removed on failure
as well as success. The prototype checkout is not used as a mutable test fixture.
Published source records use the immutable prototype revision and relative source
names. The installed check builds the five package archives from two different
temporary source locations and requires identical bytes.

Run `npm run reference:revision` to reproduce those observations and
`npm run verify:revision` to replay the installed distribution with the optional
extension files physically removed. The latter retains the 58 November combat
courses, 52,533 comparisons, character commands and Node adapter comparisons,
then checks current inspection, items, Decoy support compatibility, isolation and
deliberate faults. Windows/Linux and Node 22/24 run this course in CI; the release
archive carries the same revision verification.

This is parity evidence, not proof that every authored description perfectly
explains every possible build interaction. Steam Deck/mobile hardware, rendered
frame rates and thermal behavior remain unqualified. All 151 local SDK gate
commands pass, including 2,635 unit tests. The final installed course also
confirms identical package bytes across source locations, a 37,844-byte inspection
browser closure and no eager inspection imports. Original-reference and clean
archive/platform verification remain separate publication gates.

## Desktop measurements

The separate receipts in `evidence/prototype-revision/measurements.json` and its
compressed raw companion qualify workload
`e8ff8241278b39ad73f2c0ca1eaec29d555c5c9a4692fc8afe6915048c6cfe2c`.
Release assembly rejects any other executable. Seven fresh Node 24.9.0 processes
ran on an Intel Core i9-10900K under Windows with the compile cache disabled.
SDK verification was stopped; other desktop applications were not controlled.
Memory and allocation probes ran separately from timing.

Values are medians of seven per-process statistics, not pooled percentiles.
Combat rows time a simulation step plus host frame construction. Other rows time
their named workload; build edits combine equipment, support and passive previews
and publications. They are not single stat-query timings. Setup, warmup,
rendering and wire encoding/transport are excluded from operation timings.

| Workload | Samples per process | Median ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: | ---: |
| Mixed, 32 initial actors | 600 | 0.717 | 2.627 | 4.267 |
| Mixed, 128 initial actors | 600 | 2.688 | 9.937 | 15.039 |
| Summons/procs, 32 initial actors | 600 | 1.365 | 2.806 | 6.602 |
| Build/combat, 32 initial actors | 600 | 0.848 | 2.712 | 4.467 |
| Character creation | 30 | 2.216 | 2.741 | 5.020 |
| Inventory with 24 extra items | 30 | 6.268 | 9.234 | 9.702 |
| Combined build edits | 30 | 55.678 | 64.731 | 66.127 |
| Session creation/release | 30 | 18.889 | 26.401 | 28.190 |

Cold content import had a 1,391.3 ms median (1,361.0–1,409.9 ms range).
The separate 1,000-cycle lifetime probe retained 538,224 additional heap bytes
after collection, below its 4 MiB guard. Its process peak RSS was 553.9 MiB;
this includes the runtime and shared content, and is not steady per-session
memory. Allocation sampling also includes setup and warmup, unlike timing.

These are a new baseline, not an optimization comparison or evidence of older
mobile readiness. Content loading, build-edit cost, allocation volume and process
memory remain concrete priorities for the subsequent performance work.
