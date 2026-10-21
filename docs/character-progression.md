# Character progression

Version 0.15 adds the optional `@hollow-wake/engine/character/progression` entry.
It executes XP awards, level thresholds, earned passive points, level stat growth
and ordered account/class milestone stamping. It connects to the existing passive
spending and grant APIs without importing the game or the complete catalogue.

## Content and state

`CharacterProgression` validates, copies and freezes a `character-progression/v1`
pack. Each pack contains numeric growth/curve tuning, ordered global milestone
keys and per-class milestone keys. Lookup maps belong to the policy instance.
Hosts own mutable XP, current threshold, points, hero level and milestone ledger.
The content may be shared; character state must not be shared accidentally.

```js
import { CharacterProgression, ProgressionHost }
  from '@hollow-wake/engine/character/progression';

const rules = new CharacterProgression(progressionPack);
const host = new ProgressionHost({
  state: seat => seat.progression,
  hero: seat => seat.hero,
  classId: seat => seat.classId,
  eligible: seat => !seat.hero.dead && !seat.mercenary,
  rules: () => rules,
  blessing: () => 0,
  experienceMultiplier: () => 1,
  markDirty: seat => game.markDirty(seat),
  recalculate: seat => game.recalculate(seat),
  fillResources: hero => game.fillResources(hero),
  announce: seat => game.announceLevel(seat),
  local: seat => seat === game.localSeat,
  resyncMercenary: () => game.resyncMercenary(),
  accountOwned: seat => game.ownsAccountProgress(seat),
  ledger: () => game.accountLedger,
});
host.grantAll(game.seats, 45);
```

The example's `game` methods are host ports, not methods supplied by the SDK.
The independent packaged consumer provides a complete executable example in
`scripts/test-progression-package.mjs`: all 39 classes earn XP, spend the earned
point through `PassiveBuild`, apply `PassiveGrants`, rebuild stats and refund.

`npm run progression:build` produces the separate `@hollow-wake/progression`
content package. Its compiler checks the two original progression function source
markers, explicitly translates the known numeric curve, and verifies 4,096 original
curve levels plus all class growth observations. It never evaluates source text.
The authored catalogue retains those markers as provenance. SQL and the full
catalogue are absent from the progression runtime.

## Preserved ordering

Seats are processed in host iteration order. Ineligible controlled bodies and
mercenaries receive nothing. For each eligible seat, blessing rounding precedes
the relic multiplier; finite fractional and negative awards retain their original
meaning. The initial threshold is the host's current threshold. Each earned level
subtracts that threshold, increments the hero level, computes the next threshold,
credits points, rebuilds the character, fills resources unless the hero is downed,
announces the level, then resynchronizes the local mercenary. Recalculation's
updated downed state controls filling. Dirty marking precedes the level loop.
Account milestones are stamped after that seat's levels, including zero-XP grants.
Existing nonzero counters and original key insertion order are preserved.

Possession uses the original hero for levels/resources and the controlled body
for eligibility and announcement position. Couch/account ownership and remote-seat
exclusion remain explicit host decisions. Level 100 is not a hard cap in the
captured implementation; level 101 remains reachable.

## Validated boundaries

- Levels and XP thresholds are positive safe integers. Point budgets are
  nonnegative safe integers. Pure curve/point queries reject zero, negative or
  fractional levels; these are outside the inspected game's supported call path.
- Awards and accumulated XP must be finite. Blessings/multipliers are finite and
  nonnegative. The implementation preflights arithmetic and level-up count before
  the current seat's first write.
- The default work limit is 4,096 level-ups per grant, configurable from 1 to
  65,536. It bounds one operation, not a character's maximum level. Split legitimate
  larger work into host-controlled grants. Invalid/oversized operations are refused.
- Ports must be pure reads or nonthrowing completion effects. They must not reenter,
  replace tuning, or change XP/level/point fields during an award. Recalculation may
  change vital pools and downed state. The ledger must contain finite counters and
  permit writes. Errors from violating these trusted-host obligations can occur
  after writes; this API does not promise callback rollback or durable transactions.
- A party award is a sequence of seat commits. A later seat's invalid state does
  not roll back earlier seats. Persistence and authorization remain host-owned.

The Hollow Wake adapter lazily binds one reusable host per World. It caches the
immutable policy by class and compares numeric tuning and milestone values before
reuse, including edits within existing arrays. Changing either executable source
function at runtime is rejected with a request to recompile the explicit policy.
Unknown classes, duplicate class definitions and malformed milestone lists fail
validation. Ledger keys use own properties, including prototype-like strings.

## Verification and measurements

Two independent original-game captures agree: 4,096 curve levels, 46 Worlds,
744 XP transitions across all 39 classes and seven party/ownership scenarios.
Seven additional phases change live tuning and milestone arrays after cache creation.
Tests compare before/after state and intermediate callback ordering. Actual installed
game execution must reproduce the full traces; deliberately removing its point
credit must fail. The pure runtime also rejects deliberate missing-point and
downed-autoheal faults. Earlier accepted fixtures are unchanged.

The renderer course earns all of its route points through `World.grantXp`, then
uses actual attribute-choice, Font refund and reselection controls. It checks exact
point costs and actor stat changes. Broader Inventory, Oracle storage, passive
editor and boot courses remain separate acceptance evidence.

The progression benchmark includes real `World.grantXp` completion work for four
eligible seats, one downed, plus one mercenary and one dead seat. Five warmups and
25 rotating samples compare original, v0.14.1 and v0.15.0 on Windows, Node 24.9.0,
i9-10900K. State reset/comparison are outside timing; every resulting state agrees.

| Median ms per batch | Original | v0.14.1 | v0.15.0 |
| --- | ---: | ---: | ---: |
| 1,000 small XP awards, no level-ups | 6.596 | 6.660 | 2.917 |
| 60 awards causing 240 total level-ups/rebuilds | 6.278 | 7.585 | 7.679 |

Small awards improve about 56% versus v0.14.1; the level-up batch is about 1.2%
slower and remains about 22% above the original. No claim about statistical
significance of that small difference is made. The policy cache avoids repeated
milestone construction; character rebuilding remains the larger remaining cost.
This is not allocation, whole-frame, Steam Deck or older-mobile evidence.

The new optional module adds an explicit 12 KiB unminified-JS allowance, raising
the combined package bound from 240 to 252 KiB. Existing individual module limits
stay unchanged. The measured module is 8,443 bytes and total runtime 246,898 bytes.
Its separate content package is bounded at 128 KiB. These are distribution bounds,
not live-memory budgets. Native lifecycle experiments do not implement this module;
Unity, Godot, Unreal and ARM/device acceptance remain pending.
