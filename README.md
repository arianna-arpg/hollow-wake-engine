# Hollow Wake Engine

An independent combat and character SDK extracted from Hollow Wake.
Authored content is separate from the runtime, and each simulation owns its state.

This repository currently implements an initial, bounded capability:
character attributes, equipped item modifiers, connected passive allocation,
numeric skill supports and a skill-tree node, damage previews and costs,
and spell damage at a contact already resolved by the host.

```sh
npm ci
npm run verify
npm run example
```

The example uses the game's Magician, Lapis Ring, Arcane Practice, Ruin,
Corrosion, Measured Blows, and Ruin Studies.

See the [boundary contract](docs/boundary-contract.md), [milestone status](docs/milestone-one.md),
[verification and reproduction](docs/verification.md), and
[hardware/performance plan](docs/performance.md).

This is an early SDK, not a complete extraction or a finished game-engine plugin.
The game has not switched to this package yet. Spatial delivery, cast lifecycle,
statuses, advanced defenses, full skill trees, vocations, inventory grids,
progression and UI integration remain explicit migration work.

The source and content retain Hollow Wake's existing [license](LICENSE.md).
