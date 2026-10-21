# Boundary contract

Implemented alpha contracts: `resolved-spell-hit/v1`, `ordinary-cast/v1` and
strongest-wins timed damage using `hollow-wake-frame/v1`.
See [casting-contract.md](casting-contract.md) for time, resource and adapter ownership.

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
| Inventory grids and synchronous ownership transfer | `Inventory`, per board | Indexed grids, masks, atomic moves/swaps/transfers and versioned snapshots; see inventory contract |
| Live host-owned inventory geometry | Optional `InventoryHost` | Bag/container/storage helper delegation with original identities, fresh per-operation occupancy and explicit board/footprint ports; see inventory host contract |
| Storage addresses, repair, recovery limits and exchange plans | Optional `StashPolicy` | Extracted and delegated in the isolated game; body ownership, account authorization, investment and persistence remain host-owned; see storage contract |
| Container geometry, eligibility, unique limits, neighborhood and numeric relic power | Optional `ContainerLayout`, `ContainerPolicy`, `SeatGeometry` and `SeatRules` | Extracted and delegated through four game helper modules; account progression, transfers and downstream grant/proc execution remain host-owned; see container contract |
| Canonical relic custody, legacy migration, death tombstones and power/storage investments | Optional `RelicCustody` | Extracted and delegated through explicit item identity/content/clone ports; action authorization, complete durable transactions and actor effects remain host-owned; see relic custody contract |
| Item rolls, forging, local/global values, sockets and epitaphs | `ItemRules` plus immutable `ItemContent` | Extracted; full source comparisons; optional runtime/data entry |
| Equipment eligibility, stash/container progression, trade authority | Future policy modules | Numeric equipment binding exists; full policy pending |
| Passive allocation/refund, choice deals, realm pools and vocation spending gates | Optional `PassivePolicy` / `PassiveBuild` / `PassiveHost` | Extracted and delegated in the isolated game; earning remains host-owned; see passive policy and host contracts |
| Passive and choice attribute/stat contributions, conduit/graft specification assembly | Optional `PassiveGrants` | Extracted and delegated in the isolated game; effect execution remains host-owned; see passive grants contract |
| Skill graph economy, vocation quests, unlock earning and account progression | Future character-policy modules | Source captured; not migrated |
| Ordinary casting commitment, mana/life payment, cooldowns, cancellation | `CastRuntime`, per actor | Extracted; advanced modes remain native |
| Projectile travel, contact collection, spatial queries and 2D/3D conventions | Host adapter plus future delivery module | Host supplies a resolved contact today |
| Strongest-wins Burning and raw typed ticks | `TimedDamage`, per bearer/effect | Extracted; host supplies resolved application and damage routing |
| Other statuses, procs, summons, guard/pool defenses and death lifecycle | Future combat modules | Pending; never silently emulated by this slice |
| Rendering, sound, input, storage, UI, world streaming, networking | Host and optional adapters | Outside the core runtime |

The primary Hollow Wake checkout retains authority. The isolated game adapter
delegates the extracted transitions to the actual installed package while keeping
its existing actor/status records and advanced host behavior.

## Public operations

`new Content(pack)` validates and owns a frozen copy. Immutable content may be
shared by several engines. `new Engine(content, seed)` creates private random state,
scratch storage and caches.

`engine.character(build)` constructs a build from a registered class.
`equip`, `unequip`, `allocate` and `refund` validate before replacing derived state.
The class start is owned without spending a supplied passive point. Hosts supply
authorized point budgets; account earning rules are not extracted yet.
The sample's item id identifies one specimen, so it cannot occupy two slots.
General inventory item-instance identity is explicit in `Inventory`.
`Character.equipInstance` now binds a host-authorized identity, compiled modifiers
and eligible slots to the selected character path. It still rejects mechanics
outside the character's declared capability; full equipment policy remains pending.

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

- Numbers use JavaScript binary64. Cross-runtime verification currently covers
  only the seven [native lifecycle leaves](native-lifecycle.md), not the full SDK.
  Fixture comparisons allow relative/absolute error of `1e-12`;
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
They are not a complete game save. `CastRuntime` and `TimedDamage` now provide
separate versioned snapshots for their in-flight state.
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

`PassiveBuild` uses a separate `passive-policy/v1` capability. Its refund graph
stays within each realm or vocation. Original free-root grants can survive a
refused purchase, reported explicitly by `rootsAdded`; this is an exception to
the older selected `Character` API's atomic refusal rule. See
[passive-policy.md](passive-policy.md) for strict restore, host authorization,
point pools and the distinction between allocation policy and grant execution.

`PassiveHost` explicitly attaches host-owned mutable state without copying it on
each query. It retains retired selections and shares the same rules as strict
SDK-owned builds. Live authoring reference tolerance is separately opt-in.
See [passive-policy-host.md](passive-policy-host.md) for shape/authorization
obligations, callback ordering, content revisions and reentrancy limits.

## Portability decision

Keep the first kernel in TypeScript/ES modules to compare against the original
implementation with minimal language-induced uncertainty. Production compilation
uses the ECMAScript library only: no DOM or Node type libraries.

The data and snapshot contracts are portable specifications; the broad implementation
still needs a JavaScript host. The experimental C ABI proves seven leaf transitions
from an independent C# caller and a C++ linkage consumer. Unity, Godot, Unreal, mobile
and WebAssembly compatibility remain unproven. The full-runtime language decision
still requires comparing embedding versus a native kernel on representative content,
call overhead, memory, debugging and distribution targets. Node consumer checks alone
never establish a native-engine integration.
