# Boundary contract — milestone one

Status: implemented alpha contract `resolved-spell-hit/v1`. Broader boundaries below
are an extraction plan, not claims of existing functionality.

## Authority and ownership

| Responsibility | Owner | Current state |
| --- | --- | --- |
| Stat definitions, attribute grants, item/passive/skill/support definitions | Immutable content pack | Selected content implemented; full source preserved |
| Modifier ordering, scope, gauges, links, trades, clamps and derived queries | `StatSheet`, per character | Extracted, instance-owned, reference-tested |
| Character attribute fold, item contributions, connected passive point spend/refund | `Character` | Selected level-one build path implemented |
| Numeric skill levels, tag-gated supports and one-rank tree selections | `ConfiguredSkill` | Implemented for the exposed arithmetic content |
| Outgoing damage ranges, conversion, extra damage, lucky/unlucky and critical rolls | `Engine` | Implemented for pre-resolved spell contacts |
| Armor, capped resistances, penetration, damage taken and crit avoidance | `Target` | Plain defender implemented; other defensive layers rejected |
| Random stream and continuation state | Each `Engine` | Serializable Mulberry32 state; no ambient RNG |
| Inventory grids, affix rolls, item ownership transfer, containers | Future inventory/content modules | Current item is a pinned specimen with compiled source modifiers |
| Complete passive/skill graph economies, vocations, unlocks, account progression | Future character-policy modules | Source captured; not migrated |
| Casting commitment, resource payment, cooldown ticking, cancellation, delayed actions | Future simulation module | Read-only cost/cooldown queries exist; lifecycle pending |
| Projectile travel, contact collection, spatial queries and 2D/3D conventions | Host adapter plus future delivery module | Host supplies a resolved contact today |
| Status application/ticking, procs, summons, guard/pool defenses and death lifecycle | Future combat modules | Pending; never silently emulated by this slice |
| Rendering, sound, input, storage, UI, world streaming, networking | Host and optional adapters | Outside the core runtime |

Hollow Wake retains authority in the live game until a corresponding adapter is
integrated and verified. It is not patched to consume this package yet.

## Public operations

`new Content(pack)` validates and owns a frozen copy. Immutable content may be
shared by several engines. `new Engine(content, seed)` creates private random state,
scratch storage and caches.

`engine.character(build)` constructs a build from a registered class.
`equip`, `unequip`, `allocate` and `refund` validate before replacing derived state.
The class start is owned without spending a supplied passive point. Hosts supply
authorized point budgets; account earning rules are not extracted yet.
The sample's item id identifies one specimen, so it cannot occupy two slots.
General inventory item-instance identity is a subsequent contract.

`engine.skill(selection)` validates level, sockets, attribute-independent tag
compatibility, selected node prerequisites/exclusions and supplied point budget.
`character.validateSkill` checks attribute requirements against the built character.
Content changes require a new content object; loadout changes create a new skill.
Compiled modifiers and contexts are immutable. The exposed Ruin Studies selection
represents one rank; the rest of its source tree is preserved but not supported.

`engine.preview` returns pre-defense, noncritical typed ranges plus critical chance
and multiplier. `engine.costs` returns mana/life cost and the original cooldown
stamp value. Cooldown stamping is not elapsed cooldown simulation.
These operations consume no randomness.

`engine.resolveHit(character, skill, target)` consumes one already validated spell
contact and returns outgoing typed damage, critical outcome, roll fraction,
mitigated damage, remaining target life and random draw count. It does not debit
casting resources or advance time. Its name deliberately does not imply a full cast.
There is no retained event queue; the caller owns the receipt. Invalid/dead targets
are rejected before RNG consumption.

The sample preserves Ruin's damage contribution. Its Guardian Bond feeding,
projectile flight and unexposed tree branches are pending. Passing the raw
authored skill directly as this compiled skill schema fails on unsupported fields.

## Numerical and ordering semantics

- Numbers use JavaScript binary64. Cross-runtime numerical equivalence has not
  been established. Fixture comparisons allow relative/absolute error of `1e-12`;
  discrete results, modifier lists and random draw counts must match.
- Named source insertion order is significant. Flat additions precede additive
  increases, then multiplicative `more` terms; the last applicable override wins.
  Skill-local modifiers follow source modifiers.
- Stat links and trades read the source before link/trade grants and before forgo.
  Trade dial stats cannot also be trade endpoints; forgo dials are unique.
- Damage conversions follow the authored damage-type order and retain the game's
  sequential conversion behavior. Extra damage reads one post-conversion total.
- Lucky/unlucky and critical rolls preserve original draw ordering, including the
  plain defender's zero-chance block sample. Preview never advances that stream.
- Resistance penetration follows the resistance caps. Armor retains the original
  hyperbolic rule. Current life retains original overkill arithmetic; the full
  death lifecycle is not implemented.
- Costs round upward after scaling and conversion. Attribute percentage grants
  round through the original attribute fold.
- Conditions and gauges are supplied explicitly. Their full gameplay sampling
  belongs to later extraction; the engine does not pretend to infer world state.

## Persistence, errors and compatibility

Character build snapshots include selected equipment/passives and supplied
conditions/gauges. Skill selections, target state and random continuation state
are separately serializable. Together they reproduce the implemented contact path.
They are not a complete game save or an in-flight cast snapshot.
Ad hoc low-level `StatSheet.setSource` calls are not character-build persistence;
future buffs and other runtime sources need their own explicit state contracts.

Schema and capability ids are explicit. The package is pre-stable; compatibility
changes require a documented decision and fixture updates reviewed separately.
Unknown ids, unsupported content fields/mechanics, invalid budgets, missing
prerequisites and nonfinite input fail with errors. Rejected build changes retain
the previous build. No fallback silently converts an unsupported mechanic into damage.

Stat modifiers are copied on ingress and getters return copies. Cache keys encode
context structure without delimiter collisions. Stat value caches are bounded to
256 entries by default and can be configured per sheet, including disabled.
Attack plans are rebuilt on sheet revision changes and held through weak references.
The engine runs synchronously without callbacks while using its scratch arrays.

## Portability decision

Keep the first kernel in TypeScript/ES modules to compare against the original
implementation with minimal language-induced uncertainty. Production compilation
uses the ECMAScript library only: no DOM or Node type libraries.

The data and snapshot contracts are portable specifications; this JavaScript
implementation still needs a JavaScript host. Unity, Godot, native mobile and
WebAssembly compatibility are unproven. A later native-host experiment must compare
embedding versus a native kernel by build complexity, call overhead, memory,
debuggability, deterministic behavior and available distribution targets.
No cross-language ABI or engine integration is claimed by the Node consumer test.
