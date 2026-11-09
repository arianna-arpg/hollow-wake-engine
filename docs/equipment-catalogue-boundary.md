# Worn-equipment catalogue derivation

The original-game course records the broader equipment behavior before expanding
the public Unity adapter. It does not change the published packages or admit new
items. The current live adapter still exposes the capability documented in the
[shared-equipment guide](unity-shared-equipment.md).

## Raw material and coverage

`reference/export-equipment-catalogue.ts` runs inside the immutable original
source from `baseline/source-lock.json`. It uses original forging, modifier
compilation, `World.recalcSeat`, skill compilation, previews and resource rules.
Every case starts a fresh original world. It captures a running Ruin cast before
the item is worn, after recalculation, and after removal. No SDK implementation
produces the expected observations.

Two fresh processes produced identical JSON for 18,773 cases:

| Authored input | Cases |
| --- | ---: |
| All 68 wearable bases, ordinary and highest authored base tier | 136 |
| Every affix family eligible for an enabled worn slot | 3,876 |
| Every unique with a wearable base | 41 |
| Serialized unique-choice inputs | 14,633 |
| Each of 14 vestiges in six socket-capable worn categories | 84 |
| Epitaph sequences fitting current enabled categories and socket caps | 3 |

The manifest retains 78 exclusions with identities and reasons: 53 affix
families without an eligible wearable base, 18 container-only uniques and seven
epitaph/category pairs without an enabled base of sufficient socket capacity.
These definitions remain in authored content. They are not silently removed or
declared implemented by this course.

The course observes raw item inputs, exact compiled modifier order, attributes,
ordered stat sources, affected stat values, Ruin cost/preview/cooldown, current
resources, cast identity and progress, learned and granted skill state, worn
support verdicts, and item bodies after derivation. JSON omits optional undefined
properties; descriptor/getter semantics are not covered here.

This is static build derivation. Setting a worn slot directly does not establish
equip authorization, item acquisition, drop odds, legal player level, every roll
or affix tier, multiple-item interactions, condition/gauge transitions, granted
ability execution, or full combat behavior. Most unique-choice cases retain a
Ruin seat rather than executing the granted support's complete effect family.
The immutable source is the accepted historical game snapshot, not today's
changing game checkout.

## Findings that constrain the next extraction

The existing item compiler matches all 18,773 original JSON modifier arrays.
The current numeric character primitive constructs 271 of those cases with exact
attributes, observed stats and Ruin arithmetic. It explicitly refuses the other
18,502 cases. A successful numeric comparison is not broader combat admission.

Original derivation produces worn-support rows in 18,285 cases and changes the
learned skill's derived state in 2,257. Five cases create granted skills and
write their saved investment into the item. The 14,633 unique-choice inputs also
include 48 original exclusivity fallbacks: requesting a choice already consumed
by an earlier group does not force that choice to become active. The audit
records both requested and resolved identities. It does not claim all choice
combinations or every independently active option.

These observations require the next implementation to preserve more than a stat
sheet:

1. Compile item contributions at a build/action boundary and preserve authored
   slot order. Reuse that result during ordinary combat.
2. Derive granted skills, class skill bonuses and worn supports through explicit
   policies. Preserve support fit, duplicates, dormant rows, the enabling-support
   fixed point, and the UI's actual verdicts.
3. Keep skill identity, granting-item ownership and saved investment together.
   Prepare item mutations in the same private inventory proposal that will be
   persisted. An actor-only projection cannot safely discard those writes.
4. Publish against current resources, cast/effect clocks and RNG. Preserve the
   existing complete-save acknowledgement boundary and failure recovery.
5. Add temporal original-game courses for replacing a granting item, learned
   takeover, aura/summon retirement, callback failures and interacting supports
   before replacing those lifecycle decisions.

The next runtime work is this skill-derivation boundary. Raising the current
allow-list or loading additional rows into a database would not implement it.

## Architecture references

Epic distinguishes immutable effect definitions, per-application effect specs,
attribute modifiers and execution/lifecycle behavior in its
[Gameplay Effects documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-effects-for-the-gameplay-ability-system-in-unreal-engine).
Unity's [baking systems documentation](https://docs.unity.cn/Packages/com.unity.entities@6.4/manual/baking-baking-systems-overview.html)
separates authoring conversion from runtime data and requires explicit cleanup of
derived state when inputs disappear. These support the separation used here;
they do not prove this SDK's correctness or compatibility with either engine.

For this SDK, authored content and durable saves can use indexed storage while
combat consumes owned, validated runtime state. No database query is introduced
per tick. Steam Deck/mobile optimization still requires representative whole
workloads, allocation/frame measurements and physical-device evidence.

## Reproduction

After `npm ci`, `npm run build`, `npm run reference:prepare` and
`npm run reference:install`, run:

```text
node scripts/reference-equipment-catalogue.mjs
node scripts/audit-equipment-catalogue.mjs
node scripts/test-equipment-catalogue-observer.mjs
```

Normal verification cannot regenerate the accepted observations. Initial capture
refuses an existing evidence directory; diagnostic captures are explicitly
incomplete and cannot become accepted output. Temporary exporters and raw JSON
are removed on both success and failure.

Six deliberate omissions at real original-game derivation ports are detected:
gear sources, current resource clamping, worn supports, class skill bonuses,
granted-skill ownership and cast identity. Each has a fresh unchanged control
matching its full frozen case, followed by a specific changed observation or the
intended cast-identity assertion. This is sensitivity evidence for these ports,
not exhaustive source mutation coverage.

See [recorded evidence](../evidence/equipment-catalogue/README.md). No production
runtime, existing baseline, native archive or hardware qualification changes in
this checkpoint.
