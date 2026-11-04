# Triggered effect delivery

Import `createProcDelivery` from `@hollow-wake/engine/combat/proc-delivery` to
execute the 22 effect shapes used by Hollow Wake's proc dispatcher. A caller
supplies a proc that has already passed admission, the casting actor, an optional
skill instance and target, the current causal depth, and an optional aim.

```js
const delivery = createProcDelivery(hostPorts);
delivery.execute(proc, caster, triggeringSkill, target, depth, aim);
```

The Hollow Wake binding composes status application, healing, restoration,
cooldowns, ward, delayed bursts and triggered casting with the existing SDK
services. The dispatcher owns effect selection, power scaling, target iteration,
resource cue decisions and rider ordering. Its host supplies live actors,
geometry, hit resolution, construction, death, presentation and the actual
storage for each actor. Positions, directions, skill instances, birth definitions
and lifeline identifiers retain their host types.

## Rules that affect gameplay

- Each invocation reads proc power once in the triggering skill's context. Buff
  and summon duration are separate live queries. A buff grant prepares a distinct
  definition before reading duration. The host owns that definition's representation.
- Ordinary refusals, including a capped summon or a missing target, still run the
  proc's riders. An exception stops the current invocation at the failing step.
  Earlier writes remain visible. Nested invocations finish their own rider tails
  before the outer invocation continues.
- An immediate burst captures its base damage before striking surfaces. It
  queries enemies afterward and applies mitigation before checking invulnerability.
  A shield break clears the edge flag before reactions, then defense events run
  before any lethal landing is retired.
- Explosions check the target's story. Arcs check the caster's story, query fresh
  candidates for every hop, prefer the later candidate on an equal distance,
  and use the previous victim's live position after hit callbacks.
- A summon belongs to the resolved keeper. The cap key, lifeline, forwarded skill
  instance and duration are established before publication. The host may answer
  the census through an index. The supplied `countProcSummons` helper captures
  roster length, skips holes, and counts matching live actors without constructing
  a temporary result array. Hosts with integer owner IDs can use zero as an ID.
- Actor views must retain stable identity across queries. A skill instance may
  be a numeric handle, including zero. Windowed gameplay state and randomness
  stay in the host's synchronous services.

## Verification

The frozen game comparison contains 328 courses over 147 authored procs, every
effect shape, actual projectile travel and 28 intentional callback failures.
The installed dispatcher reproduced the accepted observations byte for byte.
The separate browser consumer imported the dispatcher and its magnitude fold in
9,602 bytes. A consumer type check exercises 3D positions, quaternion directions,
numeric skill handles, host damage types and extended birth records.
The public types let consumers select `extraHit` and `collisionDamage` individually.

The [Desperate Ward example](../examples/proc-delivery.mjs) runs one equipped
talent from the separately installed Hollow Wake content pack. Load the pack's
`procs.json` into `ProcContent` and its `stats.json` into `StatRules` once.
Pass both to `createWardExample` with the host's random function and a cue
callback. Two actors can share those definitions and retain independent ward and
cooldown state. At simulation times 0, 1 and 20 seconds, a successful sample
gives 30, 30 and 60 ward on a 100-life actor. The package check exercises this
sequence through both installed archives.

The pack check also compares all 147 proc definitions and the rider with the
original runtime capture. JSON omits 82 optional buff-modifier fields that the
game initialized to `undefined`. The game observer records each explicitly.
The content comparison accounts for those two fields (`tags` and `when`) and
requires every remaining value and array position to match. The installed game
replay retains the original observer representation throughout.

Use `test:proc-delivery-package` and `test:proc-delivery-mutations` for the standalone
entry. Use `adapter:proc-delivery-source` to check source replacement and recovery
from a failed file replacement. Use `adapter:proc-delivery` and
`adapter:proc-delivery-faults` for the installed game. The casting entry has
its own [identity and randomness contract](proc-casting.md).

C, C++ and .NET each ran the 328 proc courses under the existing embedded
runtime limits. All 379,857 numeric observations matched exactly between the
original and installed games and against Node. Each host detected both the
changed arc tie-break and the incorrect rider depth. Every run released all
tracked allocations at disposal. The broader native attack comparison separately
matched 150,608 numbers. Full engine-editor coverage for this capability and
physical-device measurements remain open.

The [Godot ward addon](../adapters/godot/ward-example/README.md) now exercises
one authored effect through a real engine and its exported game. It selects
Desperate Ward and four stat definitions for its actor API. The other effect
shapes retain their independent runtime and game-adapter contracts.

## Measured costs

On Intel(R) Core(TM) i9-10900K CPU @ 3.70GHz (x64, v24.9.0 and QuickJS-NG 0.17.0), six balanced runs compared the original filter/count expression with the roster scan. Both methods answered nine repeated queries per roster. Time ratios below 1 indicate a faster scan. Embedded allocation counts cover startup, warmup, the timed loop, serialization and disposal.

| Actors | Roster | Node time ratio | Embedded time ratio | Filter allocations | Scan allocations |
| ---: | --- | ---: | ---: | ---: | ---: |
| 32 | sparse | 0.66 | 1.12 | 146 | 146 |
| 32 | crowded | 0.70 | 1.05 | 146 | 146 |
| 128 | sparse | 0.70 | 1.25 | 150 | 150 |
| 128 | crowded | 0.66 | 1.19 | 151 | 151 |
| 512 | sparse | 0.63 | 1.26 | 3,107 | 173 |
| 512 | crowded | 0.57 | 1.23 | 5,554 | 184 |

The ratios between two copies of the same scan ranged from 0.67–3.21 on Node and 0.94–1.14 in the embedded runtime. The [measurement record](../evidence/proc-delivery/runtime-windows.json) includes each paired result.

A follow-up compared the scan with array visitors on the same six rosters.
Calling an ordinary array's `forEach` directly took 0.57–0.86 times the original
filter time on Node and 0.87–0.94 times that time in the embedded runtime.
Invoking the same visitor through `Array.prototype.forEach.call` took 1.61–3.13
times the original time on Node. The host can supply its own `summonCount`
service. Hosts that own ordinary arrays can use the direct visitor and count
matching live actors without collecting them into a temporary array.

The full-game replay also compared three builds with the same C driver, requests and byte-identical output. The predecessor already contained triggered casting. Only the World forwarding method and its new binding differ in the installed game source.

| Workload | Original game, MiB | Casting predecessor, MiB | Dispatcher, MiB |
| --- | ---: | ---: | ---: |
| startup | 74.04 | 75.78 | 75.78 |
| first-course | 74.04 | 96.78 | 96.79 |
| complete | 89.15 | 141.05 | 140.62 |

Over the complete course the predecessor made 706,941 allocator requests and
the dispatcher made 741,322. The dispatcher peaked 454,001 bytes lower while
issuing 34,381 more requests.

These peaks count requested heap bytes in a driver loading the complete game and its observer. All nine processes released every tracked block at disposal. Whole-process RSS, frame budgets and performance on Steam Deck and older mobile devices remain separate measurements.
