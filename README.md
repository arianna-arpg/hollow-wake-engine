# Hollow Wake Engine

An independent combat and character SDK extracted from Hollow Wake.
Authored content is separate from the runtime, and each simulation owns its state.

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

```sh
npm ci
npm run verify
npm run example
npm run example:lifecycle
```

The example uses the game's Magician, Lapis Ring, Arcane Practice, Ruin,
Corrosion, Measured Blows, and Ruin Studies.

See the [boundary contract](docs/boundary-contract.md), [milestone two](docs/milestone-two.md),
[adapter and host contract](docs/casting-contract.md),
[verification and reproduction](docs/verification.md), and
[hardware/performance plan](docs/performance.md).

This is an early SDK, not a complete extraction or a finished game-engine plugin.
The primary game checkout remains unchanged. The first adapter is implemented
and tested in isolation. Spatial delivery, other casting/status families,
advanced defenses, full skill trees, vocation progression, crafting/trading,
durable account services and remaining UI integration remain explicit migration work.
Unity, Godot and Unreal wrappers are still future work; the broader SDK needs a JavaScript host.

[Completion criteria](docs/completion.json) track each system and its evidence.
The authored catalogue preserves definitions; it does not imply all those mechanics execute.

The source and content retain Hollow Wake's existing [license](LICENSE.md).
