# Hollow Wake Engine

An independent combat and character SDK extracted from Hollow Wake.
Authored content is separate from the runtime, and each simulation owns its state.

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
advanced defenses, full skill trees, vocations, equipment/storage policy,
progression and UI integration remain explicit migration work.
Unity, Godot and Unreal wrappers are still future work; the broader SDK needs a JavaScript host.

[Completion criteria](docs/completion.json) track each system and its evidence.
The authored catalogue preserves definitions; it does not imply all those mechanics execute.

The source and content retain Hollow Wake's existing [license](LICENSE.md).
