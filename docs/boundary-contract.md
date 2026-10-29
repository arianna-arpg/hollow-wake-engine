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
| Canonical relic custody, legacy migration, death tombstones and power/storage investments | Optional `RelicCustody` | Extracted and delegated through explicit item identity/content/clone ports; complete durable transactions and actor effects remain host-owned; action policy is below; see relic custody contract |
| Relic action authorization policy, synchronous ownership commits and personal lockers | Optional `RelicActions` | Extracted from eleven World methods; host supplies authoritative observations and completes actor effects, selection synchronization and durable saves in original order; see relic actions contract |
| Item rolls, forging, local/global values, sockets and epitaphs | `ItemRules` plus immutable `ItemContent` | Extracted; full source comparisons; optional runtime/data entry |
| Equipment eligibility, equip/unequip and generic container/bag commits | Optional `EquipmentSlots` / `EquipmentActions` | Ordered content and six World action methods extracted; host supplies level, authority, ground delivery and actor/save completion; see equipment actions contract |
| Trade authority, crafting and salvage transactions | Future policy modules | Source captured; not migrated |
| Passive allocation/refund, choice deals, realm pools and vocation spending gates | Optional `PassivePolicy` / `PassiveBuild` / `PassiveHost` | Extracted and delegated in the isolated game; ordinary level earning is below, realm/vocation earning remains host-owned; see passive policy and host contracts |
| Passive and choice attribute/stat contributions, conduit/graft specification assembly | Optional `PassiveGrants` | Extracted and delegated in the isolated game; effect execution remains host-owned; see passive grants contract |
| XP awards, level thresholds/growth, passive-point earning and level milestones | Optional `CharacterProgression` / `ProgressionHost` | Extracted for all 39 classes and delegated through explicit hero/party/completion ports; class creation/unlocks and durable saving remain host-owned; see character progression contract |
| Skill graph economy, payload folding, ability currency and Font actions | Optional `SkillProgression` / `SkillActions` | All 132 trees and nine World actions delegated; native execution, account permission, cleanup and saves remain host-owned; see skill progression contract |
| Vocation quests, unlock earning and account progression | Future character-policy modules | Source captured; not migrated |
| Ordinary casting commitment, mana/life payment, cooldowns, cancellation | `CastRuntime`, per actor | Extracted; other modes use separate capabilities |
| Charge-up and overcharge progress, stage payment and release | Optional `ChargedCasting`, per simulation | Explicit active-state, pricing, payment and delivery ports; optional continuation handles shared interruption, hold and aim orchestration. Input occurrence, spatial observations and World payment effects remain host-owned; shared resource policy handles pool/debt arithmetic |
| Concentration progress/break decisions and repeated-input timing | Optional `casting/interactive` functions | Borrowed cast state, explicit focus observations and immutable terminal outcomes. Optional continuation clears active state before delivery/fizzle and orchestrates timing clicks; the host supplies target observations and input occurrence |
| Use-charge ammunition, rest clocks, magazine recovery and active round restoration | Optional `Ammunition` / `resources/ammunition` | Actor-owned maps with live coherent read ports; host owns World input authority, reload target selection, cooldown/cue completion and channel release |
| Channel hold, brim/completion, ordered pulse payment, release and persistence timing | Optional `ChannelCasting` / `casting/channel` | Borrowed cast/bank records and phase-specific observations; optional continuation supplies shared interruption and hold/aim orchestration. Input occurrence, spatial queries and actual effects remain host-owned; bank decay and gauge publication are below; see channel casting contract |
| Persistent brim binding, release lookup and ordered decay | Optional `ChannelBanks` / `casting/banks` | Stateless policy over actor-owned maps and records; the host supplies live contextual decay and the original frame phase. Record identity, held exclusion, plateau gates and negative detached fill are preserved; see channel banks contract |
| Ordered positive status, charge, brim, reserve and derived gauge publication | Optional `ActorGaugePublisher` / `stats/gauges` | Exact per-sink namespaced cache, five-pip brim rounding and detached changed publications. Source occurrence/derivation and sampling cadence remain host-owned. The explicit namespace correction replaces the original raw-id fingerprint omission; see actor gauges contract |
| Native actor conditions, replacement publication and ordered rising edges | Optional `ActorConditions` / `stats/conditions` | Extracted and delegated over borrowed mask/marker/queue with immutable configuration and compiled recency rows. Same-actor re-entry is rejected and failed publication retries without duplicating events. Host event stamps, timer phases and effects remain host-owned; proc selection is a separate optional module. See actor conditions contract for acceptance evidence and measured overhead |
| Guard hold, live bash readiness, AI warning commitment, pulse clocks and release decisions | Optional `GuardCasting` / `casting/guard` | Borrowed cast records and ordered host sinks; optional continuation supplies shared cast interruption. Input occurrence, interception/parry/break dispatch, native arts, spatial turning and actual bash hits remain host-owned; see guard casting contract |
| Shared mana/shield/life payment, loan headroom and timed repayment | Optional `ResourcePayment` / `resources/payment` | Stateless policy over actor-owned balances and loans; aura authority, World input authority, regeneration, debt locks, cost wards and saves remain host-owned; see resource payment contract |
| Actor eligibility, reflex/held combinations and ordered prerequisites | Optional `SkillAdmission` / `casting/admission` | Stateless policy over borrowed actors and live host ports; preserves lazy ammunition creation and existing charge validation. World input authority, redirects, targeting and effects remain host-owned; see skill admission contract |
| Cast seals, supplementary readiness, button faces and transient skill identities | Optional `CastSeals`, `SkillInstances`, `SkillIntent` | Instance-owned rules and weak cursor/relocation associations over borrowed actor caches; guarded World query delegation. Request preflight is below; targeting and effects remain host-owned; see skill intent contract |
| Ordered request authority, preference/trigger toggles and preflight redirects | Optional `SkillRequest` | First sixteen World request statements delegated through live host ports; scalar continuation can feed `SkillDispatch` or a host continuation. Borrowed state and synchronous callbacks retain original order; see skill request contract |
| Complete request orchestration, reserve spending, combo/status redirects, payment and cast preparation | Optional `SkillDispatch` | Delegated through cast creation in nine modes or immediate host delivery. Target selection and effect execution remain host services; later updates can use the continuation service below. Scramble failures clear the temporary latch while preserving prior payments; see skill dispatch contract |
| Running-cast interruption, hold/finesse decisions, nine-mode updates, completion and timing clicks | Optional `CastingContinuation` | Delegates World update/click orchestration and composes existing mode capabilities over borrowed cast state. Geometry, live aim input, effect/construction delivery and presentation remain host services; see casting continuation contract |
| Projectile travel, contact collection, spatial queries and 2D/3D conventions | Host adapter plus future delivery module | Host supplies a resolved contact today |
| Strongest-wins Burning and raw typed ticks | `TimedDamage`, per bearer/effect | Extracted; host supplies resolved application and damage routing |
| Proc eligibility, ordering, probability, cooldowns, causal depth and riders | Optional `ProcContent`, `BorrowedProcRegistry` and `ProcRuntime` / `combat/procs` | Extracted and delegated through explicit host ports; 147 proc records and one rider retain their order. Host event production and all 22 native effect branches remain outside this capability; see proc contract |
| Proc magnitude folding, ward resource arithmetic and ward effect gain | Optional `scaleProcEffect`, `gainWard`, `applyWardEffect` / `combat/effects` | Guarded delegation over borrowed state and shared ports preserves lazy queries, nested updates and native cue/rider order; see effect contract. Minimum arithmetic fields are not a complete serialized effect schema |
| Delayed burst scheduling, reverse-order delivery and zone-reset cancellation | Optional `DelayedBursts`, `compileDelayedBurstEffect` / `combat/delayed` | Borrowed host queue and actor state with explicit synchronous ports. Scheduling, delivery ordering and generation cancellation are extracted; native healing/mitigation, defense/death callbacks and presentation remain host services. Six original diagnostic courses have separately accepted repairs; see delayed effects contract |
| Buff grants, clocks, modifier publication, event-gated consumption and expiry | Optional `BuffRuntime`, `compileBuffDefinition` / `combat/buffs` and `combat/buff-content` | Borrowed actor state and synchronous host ports; explicit independent-consumption correction. Recipient/spatial selection, power resolution and next-hit payload execution remain host services; see buff contract |
| Life recovery, full refill and numeric proc healing | Optional `healLife`, `refillLife`, `applyProcHeal`, `compileProcHealingEffect` / `combat/recovery` and `combat/recovery-content` | Extracted and published in v0.37 over borrowed state and shared synchronous ports. Target selection, skill power, delivery, overheal defenses and presentation remain host services; see life recovery contract for 121 original observations, fifteen matching renderer stages, managed-game acceptance and retained desktop measurements. Physical-device acceptance remains pending |
| Shield/poise gains, immediate restoration and proc restoration | Optional `combat/restoration` and `combat/restoration-content` | v0.38 development candidate over borrowed pools and shared synchronous ports. All 218 native observations and 20 renderer stages match through the installed adapter; runtime/package and source/installed fault checks pass. Performance, managed-game and public-main acceptance remain open. See the resource-restoration contract |
| Cooldown proc reductions/resets and validated selectors | Optional `combat/cooldowns` and `combat/cooldown-content` | Development candidate with 75 accepted original scenarios and all 12 initialized authored effects. Borrowed live state, snapshot clock entries, exact arithmetic order and partial failures; the optional lifecycle module below handles elapsed recovery and skill clocks, while existing ProcRuntime owns internal admission. See [cooldowns.md](cooldowns.md) for adapter verification and remaining acceptance |
| Elapsed cooldowns, shared price, stamp/refund, orb refund and Time Dilation | Optional `combat/cooldown-lifecycle` | Six functions over borrowed clocks and reusable stat/policy ports. The installed adapter matches 44 original courses. Specialized writes, this integration’s renderer, native and performance acceptance remain open; see [cooldown-lifecycle.md](cooldown-lifecycle.md) |
| Ready-only refund credit, command spending and numeric publication | Optional `combat/ready-cooldown-bank` | Borrowed credit and clock stores, reusable eligibility/price/limit ports, synchronous publication. The original 35-course boundary is frozen; see [ready-cooldown-bank.md](ready-cooldown-bank.md). Court lifetime, formations, wards and delivery remain host-owned |
| Recoverable-attack holds, active-cast settlement and miss release | Optional `combat/sequence-recovery` | Borrowed locks/clocks/casts and synchronous flight, queue, pickup and catch-publication ports. The original 49-course boundary is frozen; see [sequence-recovery.md](sequence-recovery.md). Geometry, hit cycles, delivery and scheduled execution remain host-owned |
| Other statuses, remaining proc effect branches, other timed delivery, summons, guard/pool defenses and death lifecycle | Future combat modules | Partial; restoration and cooldown delegation have separate accepted checkpoints. Remaining native-only branches and specialized lifecycle ownership still require extraction and acceptance |
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
authorized point budgets; the optional `ProgressionHost` now supplies ordinary
level earning. Other account/realm/vocation earning remains outside that module.
The sample's item id identifies one specimen, so it cannot occupy two slots.
General inventory item-instance identity is explicit in `Inventory`.
`Character.equipInstance` now binds a host-authorized identity, compiled modifiers
and eligible slots to the selected character path. It still rejects mechanics
outside the character's declared capability. The separate optional `EquipmentActions`
API now supplies live slot eligibility and equipment/container commits; see
[equipment-actions.md](equipment-actions.md) for host completion and sink obligations.

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

- Numbers use JavaScript binary64. Cross-runtime checks cover the seven
  [native lifecycle leaves](native-lifecycle.md) and selected content-bearing
  [embedded paths](embedded-runtime-experiment.md), not the full SDK.
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
- Conditions and gauge inputs are supplied explicitly. The optional gauge
  publisher samples the five actor sources above; the optional actor-condition
  policy evaluates the 25 native conditions. Production of world-dependent
  inputs, sampling cadence and downstream effects remain host-owned.

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
Core numeric operations run synchronously without callbacks while using scratch
arrays. Optional live-host policies have the explicit read/sink port contracts
described in their respective documents.

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

Optional skill graph/progression/grant/action entries have separate owned-content
and borrowed-host contracts. Ordered ranks, original restore-versus-purchase gates,
legendary keeper/donor investment and host callback order are explicit. Strict
numeric inputs, bounded graph traversal and synchronous nonthrowing commit ports
are documented in [skill-progression.md](skill-progression.md). Resolving a tree's
payload does not implement its combat delivery or support mechanism.

Optional support entries now provide admission/mechanism predicates, tag closure,
effective levels, numeric routing and synchronous socket custody. Owned support
content is validated and frozen; live game bindings borrow records and observe
current host inputs. Original exclusion ordering, rolled crew asymmetry, callback
order and modifier identity are explicit in [support-rules.md](support-rules.md).
Trigger, summon, construct and other effect execution remain host-owned.

Optional resource entries now execute charge banks, decay/drain, regeneration,
timed taps, charge payment and gauge arithmetic. They attach actor-owned maps and
borrow coherent host observations; ordered updates are not atomic transactions.
Immutable resource content validates rates/references once and shares ordered
registry entries. Event occurrence, geometry, proc delivery and persistent saves
remain host-owned; held charge progress uses the separate charged-casting entry. See
[resource-runtime.md](resource-runtime.md) for preserved frame semantics,
fractional overdraw, operation limits and the complete standalone resource cycle.

The optional `resources/events` entry owns the equipped feed predicate and ordered
charge/gauge dispatch. One binding can serve multiple actors through explicit host
ports. Random consumption, radius edges, cooldown shaving and partial commits are
documented in [resource-events.md](resource-events.md). Positions/victims are opaque
host handles; underlying event authority and special use/minion-carry lanes remain
outside this entry. Calling the chance-bearing predicate is not a pure UI preview.

Keep the first kernel in TypeScript/ES modules to compare against the original
implementation with minimal language-induced uncertainty. Production compilation
uses the ECMAScript library only: no DOM or Node type libraries.

The data and snapshot contracts are portable specifications; the broad implementation
still needs a JavaScript runtime. The leaf C ABI proves seven transitions from
independent C#/C++ callers. The separate [embedded library](embedded-native-library.md)
exercises selected persistent gameplay paths through C++ and .NET callers using
the shared JavaScript implementation. Unity, Godot, Unreal, mobile
and WebAssembly compatibility remain unproven. The full-runtime language decision
still requires comparing embedding versus a native kernel on representative content,
call overhead, memory, debugging and distribution targets. Node consumer checks alone
never establish a native-engine integration.
