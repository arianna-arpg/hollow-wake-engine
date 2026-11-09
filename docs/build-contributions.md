# Character build contributions

`@hollow-wake/engine/character/build-contributions` exports `BuildContributions`.
It extracts the ordered contribution phase of `World.recalcSeat`: passive and
chosen attribute grants, conduits, worn items, active container boards, relic
empowerment, one final attribute percentage/rounding phase, and attributable
stat-source publication. Its result feeds `EquipmentSkills` directly.

This is rebuild work when a build changes. It performs no frame scheduling,
storage, SQL, random draws, registry installation or actor lookup. The original
game adapter resolves the hero and account authority first and retains the
subsequent skill, level, resource-clamp, guard and companion phases.

## Composition

Supply immutable content through `PassiveGrants`, the existing item compiler,
`ContainerPolicy`, `SeatGeometry` and `SeatRules`. The explicit ports select
current content and owned boards. For example:

```ts
const contributions = new BuildContributions({
  beginPassives: m => grants.begin(m.baseAttrs, m.allocated, m.choices, 'skip'),
  equipSlots: () => slots,
  containers: () => definitions,
  compileItem,
  board: def => ownedBoard(def.id),
  misfits: (board, items) => containerPolicy.misfits(board, items),
  amplification: (board, items, mods) => geometry.amplification(board, items, mods),
  amplify: (mods, factor) => seatRules.amplify(mods, factor),
  empower: (mods, power, factor) => seatRules.empower(mods, power, factor),
});
const result = contributions.rebuild(build, {
  relicEffectsSuppressed,
  conduits: value => { candidate.wornConduits = value; },
  attributes: (value, mods) => {
    candidate.attributes = value;
    candidate.sheet.setSource('attributes', mods);
  },
  sheet: candidate.sheet,
});
// Use result.passiveMods, gearSheetMods, containerSheetMods,
// containerPieceMods and passiveBuild.grafts in the candidate's skill frame.
```

The example uses the original rebuild's tolerance of retired passive IDs. A
strict new-build admission layer can instead choose `reject`. The module does
not authorize passive allocation, item custody, container ownership or account
power. Those inputs must come from the owning character/account transaction.

## Order and ownership

Conduits publish before item compilation. All flat and increased attribute
lines then feed the same passive accumulator, in declared equipment order,
followed by declared container order and surviving piece order. Class innate
modifiers remain their own sheet source, matching the original. Attribute
publication precedes class, passive, equipment and container sheet sources.
Absent sources are removed. Unrelated live sources are untouched.

A container contributes only when active, nonempty and owned. Reliquary power
also requires the account's enable flag and an unsuppressed hero. Misfits are
excluded before compilation and neighbourhood evaluation. Each surviving
piece compiles once per board; its raw lines serve both neighbourhood and
scaling. Amplifiers are consumed once. Grant-host discovery receives the exact
item identities and full scaled lines, while the sheet receives only nonattribute
lines. Repeated rebuilds always start from raw items, never previously scaled
output. A zero factor is distinct from a missing factor.

Inputs, content ports and sinks are synchronous, borrowed, single-writer data.
The runtime retains no item graph between rebuilds. Exceptions retain completed
publications, as in the original game. Atomic preparation therefore requires a
private candidate and private sinks; discard the candidate on failure. This
module alone is not a transaction and must not publish a prepared bar into a
live actor.

## Original comparison and acceptance

`reference:build-contributions` checks 91 frozen observations from two fresh
original-game processes: all 39 classes before/after growth and 13 combined
passive, choice, gear and reliquary transitions. The authored percentage choice,
conduit, grants and relic neighbourhoods are real content. Graft selection's
separate existing course remains authoritative; the new course does not invent
authored grafts where the pinned content has none.

`test:build-contributions-package` checks an offline installed archive, browser
bundle with hostile host globals, public types, ten independent contracts,
ten deliberate implementation faults and guarded source integration. It runs
the frozen 91-observation rebuild and 47-observation live casting course through
the installed passive, contribution and equipment adapters. Three installed
faults must change the original-game comparison, followed by a restored control.
Before each observed rebuild, a private candidate recalculates the complete
contribution sources from copied authored inputs. Its sources, attributes,
conduits and grant-host rows must match the live rebuild while leaving the live
inputs, sheet, clock and cast untouched. This qualifies contribution preparation;
it does not yet prepare or publish the entire private skill/actor graph.
`--catalogue` additionally checks the 18,773 frozen worn-equipment observations.
Normal checks cannot regenerate accepted results.

The package caps this optional orchestration module at 6 KiB unminified and the
combined contribution/passive/container browser entry at 40 KiB. These are
code-size limits, not CPU, allocation or physical-device measurements. Compiled
immutable content remains the runtime boundary described in
[content storage](content-storage.md); optional authoring databases do not enter
this calculation.

## Remaining integration

The workshop's durable character context still needs explicit class/base
attributes, passive choices/grafts and container ownership. It must feed this
rebuild from admitted candidate data and preserve same-owner skill investment
through `EquipmentSkillDraft`, then normalize grants using
`WorkshopBuildPreparation`. No stale live stat sheet may substitute for that
context. Granted bar admission, shared preference authority and acknowledgement
time live reconciliation remain separate work. This extraction does not expand
the existing Unity/Godot package's admitted equipment or qualify hardware.
