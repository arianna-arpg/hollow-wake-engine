# Hollow Wake Engine

An independent combat and character SDK extracted from Hollow Wake.
Authored content is separate from the runtime, and each simulation owns its state.

The JavaScript/TypeScript package works outside the game and has no production
dependencies. The Hollow Wake adapter consumes the installed package and compares
its behavior with the preserved original. This is an alpha extraction: the broader
runtime still needs a JavaScript host. Unity, Godot and Unreal drop-in packages
and Steam Deck/older-mobile measurements remain incomplete.

An unpublished [life-recovery candidate](docs/life-recovery.md) adds optional
healing/refill operations and validated proc-heal content. Native direct cases,
method-selection cases and an independent package consumer pass. Its installed
game adapter reproduces 121 native observations, including actual healing cues
and customized callable behavior.
A measured function-layout experiment failed its predefined acceptance threshold;
the corrected runtime remains selected, with [both comparison runs retained](evidence/milestone-forty-two/recovery-notification-performance.json).
Renderer and managed-game acceptance remain pending, and device performance is
unmeasured. Published v0.36 is described below.

Version 0.36 adds optional [buff lifecycle and content validation](docs/buffs.md):
grants, shared and independent clocks, stat publication, event-gated consumption,
removal and expiry. Host ports retain native cue and callback behavior. The
[acceptance record](evidence/milestone-forty-one/verification.json) includes forty
original courses, one explicitly specified independent-consumption correction,
fourteen matching renderer observations and a preserved local game integration.

Lazy reentry bookkeeping saves 96 retained bytes per used Actor against the first
extraction. Remaining grant and timer overhead is reported against v0.35. A later
timer experiment missed its prespecified adoption threshold and was reverted;
its tests and measurements remain available. These desktop results establish
neither device performance nor a general speedup. All eleven partial system
families remain partial; native-engine packages and hardware acceptance still
require work.

Version 0.35 adds optional [delayed effects](docs/delayed-effects.md): scheduling,
ordered delivery, validated effect content and cancellation across zone changes.
The installed game adapter preserves 48 original courses with six explicitly
accepted repairs for re-entry and stale-area delivery. [Acceptance evidence](evidence/milestone-forty/verification.json)
records 520 SDK tests, 13 renderer checks and ten managed-game checks.

Four controlled desktop comparisons show waiting-queue drains improving 9–14%
over the initial extraction, with remaining overhead against v0.34. Other
workload rankings vary. These results do not establish device speed or FPS gains.
Twenty other native proc effect branches remain to extract; all eleven partial
system families remain partial.

Version 0.34 added optional [effect scaling and ward gain](docs/proc-effects.md).
The first complete proc-effect path composes scaling, native resource access,
proc dispatch and visible ward feedback through the installed SDK. Its
[acceptance record](evidence/milestone-thirty-nine/verification.json) includes
1,096 original observations, seven extra native hook/cue cases, 15 installed
effect faults, 12 renderer checks and a preserved managed-game integration.
At that milestone, 21 native effect branches and delayed scheduling still needed
extraction; the delayed-effect follow-up is described above.

Separate object-copy sites reduce authored scaling time by about 24% against
the first extraction in two desktop runs. Remaining overhead against v0.33 is
recorded; this does not establish device performance or zero abstraction cost.

Version 0.33 adds optional [proc selection and dispatch](docs/proc-runtime.md):
ordered gates, probability draws, cooldowns, causal depth and rider selection over
explicit host ports. A validated content pack preserves 147 procs, one rider and
298 stat definitions. The game adapter delegates native events and demonstrates
an earned low-life ward reaching the HUD. In that version, all 22 native effect
branches execute in the host; the ward follow-up is described above.

The [v0.33 acceptance evidence](evidence/milestone-thirty-eight/verification.json)
records 150 original courses, 18 installed faults, 12 renderer checks and a
preserved managed-game integration. The targeted changing-grants workload is
17–21% faster than the earlier v0.33 candidate; remaining overhead versus v0.32
is explicit, and Steam Deck/mobile performance remains unmeasured.

Version 0.32 adds optional [actor conditions](docs/actor-conditions.md): the 25
native conditions, ordered rising edges, last-sample queries and replacement
publication over host-owned actor state. An explicit recovery contract retries
failed publication without duplicating events and rejects same-actor re-entry.
Event stamps, timers, proc execution and effects remain host responsibilities.
The shipped `actor-conditions` example demonstrates low-life damage, a host ward,
expiry and recovery through the installed package.

The [v0.32 acceptance evidence](evidence/milestone-thirty-seven/verification.json)
records original comparisons, installed faults, renderer checks and preserved
managed-game integration. [Measured recency compilation](docs/actor-conditions.md#recency-metadata-optimization)
reduces sampling time versus the initial extraction; its remaining overhead
against v0.31 and the absence of a whole-world speedup are explicit.

Version 0.31 adds [persistent channel banks](docs/channel-banks.md) and
[actor gauge publication](docs/actor-gauges.md). Banks retain their native
identity and decay phase; gauge publication uses exact namespaced comparisons
and a compact cache. A separately recorded correction prevents a spent charge
from leaving stale stats when it becomes a brim gauge. The original baseline
contains 57 courses and 292 transitions. The shipped `channel-banks` example
demonstrates binding, publication, decay and stat updates through the installed
package. These entries remain optional and outside the core import graph.
A separately captured two-course addendum preserves sparse status/reserve counts.
The [corrected implementation evidence](evidence/milestone-thirty-six/compatibility-repair/runtime-verification.json)
includes exact game comparisons and a [measured cache decision](docs/actor-gauges.md#measured-cost).
The [v0.31 acceptance evidence](evidence/milestone-thirty-six/verification.json)
records installed-game faults, renderer checks and the preserved managed-game
integration. Device and full native-engine acceptance remain outstanding.

Version 0.30 added optional [casting continuation](docs/casting-continuation.md):
ordered interruption, aim and hold handling, AI timing clicks, nine-mode updates,
completion and repeated input. It composes the existing casting capabilities
over actor-owned state. The shipped 3D example now connects request, updates and
delivery. The original baseline contains 60 courses and 269 transitions; physical
input, geometry, actual effects and presentation remain host responsibilities.

The [v0.30 acceptance evidence](evidence/milestone-thirty-five/verification.json)
records original comparisons, installed-game faults, renderer checks and the
preserved managed-game integration. [Measured update fast paths](docs/casting-continuation.md#cost-and-compatibility-limits)
reduce the ongoing-cast workload; complete-cycle tradeoffs remain explicit.

Version 0.29 added optional [complete request dispatch](docs/skill-dispatch.md):
reserve spending, combo and status redirects, targeting orchestration, payment,
and preparation of all nine casting modes or immediate host delivery. A shipped
3D example connects preflight, dispatch, ordinary advancement and delivery through
the installed package. Actual spatial queries and effects remain explicit host
services; ongoing cast orchestration is now above. Two v0.29 desktop comparisons found no repeatable speed
change; Steam Deck and older-mobile acceptance remain outstanding.

The [v0.29 acceptance evidence](evidence/milestone-thirty-four/verification.json)
records original comparisons, installed-game faults, renderer checks and the
preserved managed-game integration.

Version 0.28 added optional [request preflight](docs/skill-request.md): ordered
authority, replenishment and trigger toggles, held-body struggle, redirects and
actor admission. Its explicit continuation result now feeds the optional dispatcher;
hosts can also use preflight independently.
The [acceptance evidence](evidence/milestone-thirty-three/verification.json)
includes original comparisons, installed-game checks and rendered input. Its
[measured request costs](docs/skill-request.md#validation-and-performance-scope)
include a small early-refusal/toggle regression.

Version 0.27.1 optimizes [empty support admission](docs/support-admission-cost.md),
with complete-workload measurements and explicit preview-performance tradeoffs.

Version 0.27 adds optional [skill intent](docs/skill-intent.md): cast seals,
HUD/button readiness, displayed skill faces and temporary-instance ownership.
Request preflight followed in v0.28 and complete request dispatch in v0.29.

Version 0.26 adds optional [skill admission](docs/skill-admission.md): actor
eligibility, reflex/held combinations and ordered prerequisites. It preserves
lazy ammunition creation and existing resource validation. It builds on v0.25's
[resource payment](docs/resource-payment.md) and v0.24's
[guard casting](docs/guard-casting.md).

## Start here

From this repository, with Node 22 or newer:

```sh
npm ci
npm run verify
npm run example
npm run example:lifecycle
```

Verification includes isolated installed consumers. The first example uses the
game's Magician, Lapis Ring, Arcane Practice, Ruin, Corrosion, Measured Blows and
Ruin Studies. The lifecycle example demonstrates casting and timed damage.

To install a local build into another JavaScript project, run `npm run build`
and `npm pack` here, then install the resulting `.tgz` by its filesystem path
in that project. This repository does not depend on a public registry release.
Import only the capabilities you need; optional entries are not eager core imports.

| Capability | Entry / starting contract |
| --- | --- |
| Statistics, selected character builds and resolved spell contacts | `@hollow-wake/engine` — [boundary contract](docs/boundary-contract.md) |
| Inventory, equipment and storage | [Inventory](docs/inventory-contract.md), [equipment](docs/equipment-actions.md), [storage](docs/stash-policy.md) |
| Passives, skills and supports | [Passive policy](docs/passive-policy.md), [skill progression](docs/skill-progression.md), [support rules](docs/support-rules.md) |
| Resources, payment and ammunition | [Resource runtime](docs/resource-runtime.md), [payment](docs/resource-payment.md), [ammunition](docs/ammunition.md) |
| Persistent casting banks and stat gauges | [Channel banks](docs/channel-banks.md), [actor gauge publication](docs/actor-gauges.md) |
| Casting | [Complete dispatch](docs/skill-dispatch.md), [request preflight](docs/skill-request.md), [intent and seals](docs/skill-intent.md), [admission](docs/skill-admission.md), [ordinary lifecycle](docs/casting-contract.md), [charged](docs/charged-casting.md), [focus and timing](docs/interactive-casting.md), [channels](docs/channel-casting.md), [guards](docs/guard-casting.md) |
| Engine adapters and native experiments | [Host contract](docs/casting-contract.md), [seven-operation C ABI experiment](docs/native-lifecycle.md) |

The shipped `examples/` include small hosts for complete requests, resources, charged casting,
interactive casting, channels, guards and ammunition. Each capability's contract distinguishes SDK
state and operations from host obligations such as input, spatial queries,
delivery, presentation and durable saves.

## Scope and evidence

[Completion criteria](docs/completion.json) track each system and its evidence.
Importing an authored definition does not establish that its mechanics execute.
Remaining work includes World input authority and delivery, guard interception,
loan aura installation/teardown, advanced defenses, other
statuses and procs, summons, downstream execution of tree payloads, vocation
progression, crafting/trading, durable account services and later UI integration.
The primary game checkout and its unfinished work remain preserved.

See [verification and reproduction](docs/verification.md), the
[hardware/performance plan](docs/performance.md), and the
[content/storage decision](docs/content-storage.md). Validated content packs
serve the runtime; SQLite is optional tooling rather than a combat dependency.
The source and content retain Hollow Wake's existing [license](LICENSE.md).

<details>
<summary>Extraction history and evidence</summary>

Version 0.24 adds optional [guard casting](docs/guard-casting.md), including the
shared readiness read and AI hold fold, bounded component pulse clocks and
phase-ordered release over caller-owned state. Native defense and guard arts
remain explicit host responsibilities.

Version 0.23 adds optional [channel casting](docs/channel-casting.md), with
phase-specific live observations, bounded pulse scheduling, brim/release arithmetic
and persistent effects through explicit host ports. Original and installed game
traces cover native effects and triggered buffs; no device performance claim.

Version 0.22 adds optional [ammunition banks](docs/ammunition.md): magazine and
trickle recovery, movement loss, optional fuel, final-round spending and active
restoration over actor-owned state, with a standalone packaged example.

Version 0.21 adds optional [focus and timing casts](docs/interactive-casting.md):
concentration progress/break decisions, fizzle-clock quotes and one-shot timing
attempts over caller-owned cast records, with explicit host completion.

Version 0.20 adds optional [charge-up and overcharge phases](docs/charged-casting.md),
including staged payment and timing-dependent release through explicit host ports.

Version 0.19 adds [equipped resource event awards](docs/resource-events.md):
ordered filtering, explicit randomness, charge awards and gauge/cooldown feeds.
One simulation binding serves independent actors, with geometry and event
occurrence supplied by the host. A shipped example exercises the installed API.

Version 0.18 adds [charges and skill gauges](docs/resource-runtime.md): banks,
decay/drain, regeneration, timed taps, admission/payment and gauge arithmetic.
The separate content package includes all 23 charge definitions, resource fields
and tree resource payloads. The standalone consumer connects these to statistics
and a complete resource cycle; event eligibility and delivery remain host-owned.

Version 0.17 adds [support rules and socket custody](docs/support-rules.md):
compatibility, tag composition, effective levels, rolled cuts, modifier routing
and complete socket/unsocket paths. All 457 support definitions ship in a separate
validated content package. The game adapter preserves saved gems, equipment-granted
skills and live crew updates; support effect execution remains a separate boundary.

Version 0.16.1 adds [rebuild regression guards and measured experiments](docs/rebuild-vectors.md).
The runtime remains byte-identical to v0.16.0: the tested optimizations did not
establish a consistent improvement across complete rebuild workloads.

Version 0.16 adds [skill progression and tree actions](docs/skill-progression.md):
all 132 tree graphs, ranked/legendary point budgets, skill/support levels, resolved
tree payloads, Font resets and merges. Four optional modules connect the same
rules to standalone content and the game adapter. Desktop tree previews improve
about 59–60% versus v0.15.0; a measured action/rebuild regression remains a target.

Version 0.15 adds [character progression](docs/character-progression.md): XP awards,
level growth, earned passive points and ordered class/account milestones. All 39
classes connect XP to passive spending and stat rebuilding in a separate consumer.
The game adapter preserves party, possession and downed behavior. Small XP awards
improve in the desktop measurement; level-up rebuilds remain a measured cost.

Version 0.14.1 [reduces copying costs during character rebuilds](docs/rebuild-optimization.md)
while preserving validation and independent state ownership. Complete game workloads
retain matching results; the larger equipped-loadout batch improves about 19% over
v0.14.0 on the measured desktop. Device performance remains unverified.

Version 0.14 adds [equipment and generic-container actions](docs/equipment-actions.md):
slot eligibility, equip/unequip, bag/board moves and complete placement/exchange
commits. Ordered slot content ships separately, and the offline item-to-character
consumer now uses the same equipment policy as the isolated game adapter.

Version 0.13 adds [relic and personal-storage actions](docs/relic-actions.md):
authorization policy, complete placement/exchange/withdrawal commits and restoration
reconciliation. Eleven game methods delegate to the installed package while the
host preserves actor effects, callback order and durable saving. The offline
consumer now exercises authorized transfers through the same public API.

Version 0.12 adds [account relic custody](docs/relic-custody.md): canonical item
identity, stale-save migration, death tombstones, restoration and bounded power/
storage investments. The game delegates its ownership helpers through explicit
host ports; durable transactions and player-action authorization remain host duties.

Version 0.11 adds [container and relic seat rules](docs/container-policy.md):
compiled unlock shapes, eligibility, unique limits, landing decisions and numeric
neighboring power. The game delegates four helper modules, and a separate content
package connects forged relics to placement and statistics without the game.

Version 0.10 adds [paged storage policy](docs/stash-policy.md): lossless layout
repair, recovery limits and exact cross-page exchange plans, delegated through
the game's account relic storage and personal lockers. Plans use compact placement
records and keep item ownership, authorization and saving with the host.

Version 0.9 adds [live inventory delegation](docs/inventory-host.md) across the
game's bag, masked-container and storage geometry. It preserves host-owned item
identity and observes direct edits while rebuilding bounded occupancy once per
first-fit operation. Original traces, complete game transitions and installed
fault checks establish behavior; container/account policy remains a separate step.

Version 0.8 adds [live host policy integration](docs/passive-policy-host.md):
the game now delegates full-tree allocation/refund, realm points and graft binding,
with shared compiled graphs, per-character scratch and explicit editor refresh.
Original callback order, co-op, save restoration and live summon updates are
checked through the installed package. The public API supports both strict
SDK-owned builds and explicitly attached host-owned state.

Version 0.7 adds [passive attribute/stat grants and game delegation](docs/passive-grants.md)
through `@hollow-wake/engine/passives/grants`. The separate full-tree
[allocation/refund policy](docs/passive-policy.md) and grant data packages connect
in an offline consumer. Conduit and graft specifications are preserved; their
effect execution and progression remain host-owned.

An optional [native lifecycle experiment](docs/native-lifecycle.md) now provides
seven C ABI operations and a C# binding, with batched timers and standalone C++/C#
package consumers. It is a measured interoperability proof, not a full native SDK
or a Unity/Godot/Unreal plugin. Run `npm run native:verify` with a C toolchain and .NET 8.

Version 0.5 adds [host-owned item ports and actual-game item delegation](docs/item-adapter.md),
including preserved shared RNG/identity order, original save migration and explicit
content refresh. Clean reconstruction and installed-package fault checks verify
the bridge; native engine packages remain future work.

The isolated game includes the [Inventory cancellation acceptance repair](docs/inventory-ui-adapter.md),
with original failure evidence, a failing control and independent NPC/player close checks.

Version 0.4 adds [item rolling, forging and modifier compilation](docs/item-contract.md)
through the optional `@hollow-wake/engine/items` entry, separately packaged item
content, and runtime item equipment with build save/restore. See
[milestone four](docs/milestone-four.md) for coverage and performance evidence.

Version 0.3 adds an independent indexed inventory with atomic transfers and
masked boards, plus separately packaged authored registries and optional SQLite
tooling. See [milestone three](docs/milestone-three.md) and the
[inventory contract](docs/inventory-contract.md).

Version 0.2 added ordinary casting, resource payment, cooldown clocks, cancellation,
save/restore, and strongest-wins Burning with explicit original-game timing.
An isolated Hollow Wake adapter consumes the packed SDK and is checked against
the unmodified game's traces. The package also implements:
character attributes, equipped item modifiers, connected passive allocation,
numeric skill supports and a skill-tree node, damage previews and costs,
and spell damage at a contact already resolved by the host.

</details>
