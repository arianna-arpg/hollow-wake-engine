# Composed combat session

The candidate `@hollow-wake/combat` package joins the existing SDK combat rules
with the pinned Hollow Wake content. It is separately loadable from the small
generic engine root and from `@hollow-wake/characters`. Runtime consumers do not
need the original game, source compiler, quests, an account, a database, or saves.
The default content is compiled immutable data and pure read rules; each session
owns its actors, clocks, random stream, queues, controllers and mutable caches.

The milestone-three JavaScript/TypeScript composition is now used by the
[milestone-four Node/Godot reference adapter](node-godot-adapter.md). Unity and
Unreal integration and Steam Deck/mobile performance are not established by it.

## Build and installation

From a prepared SDK checkout (`npm ci`, `npm run reference:prepare`,
`npm run reference:install`), run:

```sh
npm run build
npm run compile:combat -- --out .artifacts/combat-package
npm pack --ignore-scripts --pack-destination .artifacts
npm pack ./.artifacts/combat-package --ignore-scripts --pack-destination .artifacts
```

The compiler refuses an existing destination. Install both generated archives
in the consuming project. The combat package declares the exact engine peer
version; mixing engine and content captures is unsupported. No registry upload
is needed. The generated manifest records source and output hashes. Keep the
license with redistributed artifacts; this milestone does not change licensing.
The existing [character package recipe](character-session.md) supplies the
memory-only character kit when Inventory-facing builds are required.

```js
import {createCombatSession} from '@hollow-wake/combat';
import {combatContent} from '@hollow-wake/combat/content';

const combat = createCombatSession(combatContent, {space: gameSpace}, {seed: 711});
const hero = combat.addCharacter(characterKit, character, {
  name: 'Hero', position: {x: 400, y: 400},
});
combat.aim(hero, {x: 440, y: 400});
combat.press(hero, 'firebolt', {x: 440, y: 400});
combat.advance(1 / 60);
const visible = combat.snapshot();
const events = combat.drainSignals();
```

`gameSpace` is the game's physical host implementation, described by `CombatSpace`
in the package declarations. This snippet assumes the character knows firebolt.
The empty arena used in the executable consumer is test geometry, not a production
collision engine. The package accepts explicit finite elapsed seconds and never
reads a wall clock or ambient random generator.

## Ownership and commands

`addActor` accepts trusted native encounter inputs. `addMonster` creates a native
authored body through the shared body factory, including its kit and inheritance.
Neither is an untrusted save importer. `addCharacter` connects admitted character
investment to the same combat actor and skill identities used by actual casting.
The character transfers exclusive publication responsibility to this session:
prepare/authorize on the character, then call `combat.commitCharacter(hero, change)`.
Do not publish directly through another live owner or attach it to two sessions.

Every intermediate investment publication is preflighted before a change commits.
Retirement reads the old investment before installing the new investment. Retained
skills keep active casts and cooldowns. The three original character courses also
exercise these publications inside real combat casts.

Handles are opaque and session-owned. IDs alone cannot manufacture a handle.
Use `actor(id)` to resolve a known current actor, `controlled(hero)` after a
possession change, `inspect` for one detached body view, `effects` for effect
state, `build` for the character view, and `stat` for derived statistics.
Inspection never lends mutable actor records. `meta` invokes authored alternate
actions; `release` and `timingPress` complete held/timed casting inputs. `aim`
updates live steering separately from the initial cast target.

`move(actor, direction, seconds)` adds ordinary locomotion before casts and the
frame clock. The SDK owns the original movement restrictions and accumulators;
the host submits collision/floor results through `space.stepPhysical`. `pose`
and `poses` return detached presentation facts. See the
[movement contract](node-godot-adapter.md#ordinary-movement-and-pose-submission)
for time bounds, flying/levitating native bodies, ordering and host ownership.
Spatial callbacks must not mutate actors; clients cannot submit authoritative poses.

The host controls session lifetime and should regularly drain signals. Discarding
the session and its handles releases its graph for garbage collection; there are
no timers, threads, sockets, or global registries to shut down. Large inspection
snapshots are explicit allocations, not a mandatory per-frame rendering format.

## Host boundary

| Responsibility | Owner |
|---|---|
| Cast admission, payment, timing, release and interruption | SDK |
| Hits, damage, mitigation, statuses, procs, resources and recovery | SDK |
| Skill geometry/contact selection, projectiles, fields and effect lifetimes | SDK |
| Summon construction, reservations, inheritance, retirement and combat commands | SDK |
| Passive/Vocation/support/awakening/item/Reliquary build contributions | Character SDK and shared live combat actor |
| Physical terrain, collision, layer facts and rendering | Host |
| General AI/navigation and generation | Host |
| Quest progress, loot policy, travel destinations, accounts and saves | Optional host systems |

Spatial callbacks are synchronous trusted services. Their borrowed actor facts
must not be mutated or retained. They must report physical facts, rather than
replace damage or target rules. `noteBodyHit` is the explicit contact annotation
exception. General AI consumes optional combat intent callbacks; it is not run
by `advance`. Native enemy bodies do not become an autonomous general game AI.

Terrain, cloud, vent, lightwell and portal effects require explicit `fields`
providers. Missing providers cause admission refusal before payment or targeting.
The same inspection follows nested payloads, native grants/trees/boons, invocation,
mimic banks, procs and retained build changes. Native probabilistic choices are
checked conservatively; a provider may be required for a possible later payload.
Providers must remain available throughout any admitted effect's lifetime.

The optional `environment(frame)` callback receives detached actor facts after
actor timers and before projectile contacts. It returns status facts for that
phase. The SDK validates the whole batch and owns resistance, application, damage,
duration and expiry. The host owns fog/weather simulation and determines occupancy.
The frozen fog course records the original environmental inputs independently;
it does not copy expected SDK status results back into the simulation.

Input errors and capability refusals leave the unstarted command unchanged.
A thrown host callback during execution can follow partial combat writes: the
session is quarantined and cannot be retried as though it rolled back. Callbacks
cannot reenter the session. This synchronous contract deliberately needs no
database acknowledgement. Optional campaign observations must not consume or
replace the combat random stream.

## Evidence and limits

The installed consumer replays frozen original observations through public package
imports, in two fresh processes, after removing optional runtime and declaration
modules. It also checks public types, browser bundling, invalid inputs, separate
owners, host refusals, positive world-service calls and failure quarantine.
The same lifecycle helpers run against source and installed packages.

Coverage is representative by authored family, with separate focused original
courses and broad catalogue execution. It is not an exhaustive proof of every
possible build combination or every host's collision implementation. The original
Heating Up/Heat Lost self-consumption behavior is preserved and explicitly tested.
On-kill world-light placement is tested without campaign bounties; survival-light
simulation and its cosmetic random draws remain host concerns.

Run `npm run verify` and `npm run reference:verify` for publication. The new
`test:combat-coverage` and `reference:combat-coverage` commands are included in
those gates. Accepted observations are never regenerated by normal verification.
See [milestone-three evidence](combat-inventory-milestone-three.md).
