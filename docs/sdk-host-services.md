# Host-service contract for adoption

The host supplies facts and policy; the SDK owns build rules and combat results.
The authoritative declarations are in `@hollow-wake/combat` and
`@hollow-wake/node-godot`. The reference implementations are examples of these
ports, not replacements for a game's navigation, terrain or multiplayer stack.

| Port | Contract and ordering |
| --- | --- |
| Clock and input | The host chooses finite seconds. The reference uses 1/60 second, bounded input queues and capped catch-up. Movement precedes fresh casts and `advance`. Input never supplies a timestep, pose or reward. |
| Physical step | `space.stepPhysical(facts, destination, origin, displacement)` returns `{pos, tier, collision?}`. Return finite points and a nonnegative integer story layer. Facts and returns are detached; do not mutate actors. A missing port retains the documented clamp path. |
| Terrain speed | Optional `space.walkScale` supplies a finite nonnegative multiplier. Geography, weather and navigation remain in the game. |
| Contacts and visibility | Implement the declared reach, segment, line-of-fire and area queries with existing delivery geometry. Report physical contacts; let the SDK decide damage, defenses and status results. |
| Projectile facts | Supply the declared ride/grid-ray and layer facts. The SDK owns projectile lifetime, collision consequences and hit ordering. |
| World-effect services | Terrain/cloud/vent/lightwell/portal families need their explicit `fields` providers. Admission refuses missing services before starting the effect. Keep providers available for the admitted lifetime. Travel destinations and campaign consequences remain host decisions. |
| Environment | Optional `environment(frame)` returns detached status facts after actor timers and before projectile contacts. The SDK validates the whole batch and applies resistance, duration, damage and expiry. |
| Build publication | A character belongs to one combat session. Preview is detached. Publish accepted proposals through that owner's `commitCharacter`, or the Node host's `build` / `grant`. |
| Entitlements and Reliquary | Supply the current authorized feature/relic projection. It is separate from exported character investment; loading a record cannot grant account authority. |
| Presentation | Consume detached poses, bodies, projectiles, zones and ordered signals. The sample wire uses `hollow-wake-sdk/1`, 30 game units per metre and height in centimetres. |
| Persistence | Optional host `load/save` methods receive detached investment. Default storage is memory. No persistence callback runs inside a hit or simulation step. |

Spatial and effect callbacks are synchronous trusted services. Do not reenter a
session, retain borrowed facts or use them to mutate SDK state. A callback can
throw after partial combat work; the session then quarantines itself. Discard
that owner rather than retrying the failed frame as though it rolled back.

The reference TCP listener is single-client localhost communication. Production
network authentication, remote authorization, replication and anti-cheat are not
supplied by exposing that listener. Trusted grants remain outside client messages.

Closing a host stops its simulation owner. Closing its listener releases sockets
and timers. On disconnect, the reference clears movement and held input; it
pauses without a client. The game may select another explicit lifecycle policy.

Godot conversion must preserve story membership across adjacent walkable columns.
A Ground floor index and an SDK story ID have different meanings. The sample's
two floors illustrate the contract without defining a world streaming model.
