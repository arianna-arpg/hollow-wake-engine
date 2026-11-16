# Node/Godot reference adapter

Milestone four adds the separately packaged `@hollow-wake/node-godot` host and
the [reference player](../examples/node-godot/README.md). Engine
`0.62.0-candidate.0`, combat `0.2.0-candidate.0`, characters
`0.1.0-candidate.0` and authored builds `0.2.0-candidate.0` are installed from
local archives. The adapter is `0.1.0-candidate.0`. These are engineering
candidates, not npm registry releases or a claim of universal engine support.

## Ownership and lifecycle

`createNodeCombatHost(content, {kit, character, space})` composes the existing
memory-only character with the combat session. A separate trusted
`nativeHero` option creates an encounter/effect-gallery body without character
investment. Client commands cannot select that option or mint bodies.

The host owns a fixed simulation step, the current controller, command queue,
input sequence acknowledgement and build publication. Godot owns meshes, UI and
camera picking. Spawned entities, projectiles and timed zones are read from
authoritative host state; removing a render node does not retire a combat effect.
Possession signals carry body/hero IDs rather than leaking live actor graphs.

`input` accepts bounded movement/aim, up to eight pressed and held skill IDs,
and a monotonically increasing sequence. Duplicate/stale inputs are refused.
The queue holds at most 32 inputs. `step` applies the latest movement once,
updates aim/hold, processes queued press edges, then advances the complete combat
clock. A press is an edge; a held ID feeds an ongoing channel/guard/charge. The
reference does not implement a separate automatic repeat scheduler. Existing
hosts may send `hold:true` to retain the current cast when no explicit `held`
list is supplied; an explicit list takes precedence.

`build(command, {preview:true})` prepares a detached candidate and reports its
build/stats without publishing it. A normal call publishes through the existing
live character boundary. Station/refund conditions are host-owned and replaceable
through `conditionsFor`; the reference training room enables its workstations.
The command allowlist excludes XP, item, Vocation and projection grants.
Grant entitlement never comes from a client message.

Trusted game code uses `grant(request)` for rewards, Vocation grants and
external projections such as Reliquary power. It publishes through the same
combat binding and advances the Inventory revision. The listener sends a fresh
Inventory view when that revision changes. There is no network grant command;
the game must determine entitlement before calling this host-only operation.
Three frozen original theorycrafting courses exercise both `build` and `grant`,
including Vocation/XP changes and retained casts. The sample UI demonstrates
equipment, support and passive edits; it is not a replacement for every
Inventory screen in the consuming game.

The sample's `listenCombatHost` is a single-client **localhost** bridge, not a
multiplayer/account server. It uses bounded UTF-8 newline JSON, partial-frame
decoding, bounded queued output, fixed steps and a capped catch-up interval.
Events from catch-up steps survive state coalescing. Disconnect clears movement
and held input; reconnect starts a new input sequence. Close releases sockets and
timers. The sample pauses its clock while no client is connected. A thrown
combat callback stops the host rather than retrying partial work.

## Ordinary movement and pose submission

`session.move(actor, {x, y}, seconds)` applies one host-authorized ordinary step
before fresh casts and `advance(seconds)`. Duration is bounded to 0–1 second;
the example host uses 1/60 second and refuses steps above 0.25 second. The
original mover normalizes direction and owns movement locks, cast/channel/guard
mobility, confusion, grab struggles, traction, tether restraint/return, stride
distance and movement-built charges. It uses the existing timeflow scale.

The original prototype's `rooted` status slows ordinary walking by 95%; it is
not an absolute movement lock. That observed rule is preserved. Native `flying`
and `levitates` flags are trusted encounter morphology. Authored characters
continue to obtain mobility through their existing skills and build rules.

The host submits a physical pose by returning
`{pos, tier, collision?: {hit:'none'|'wall'|'void'}}` from
`space.stepPhysical(bodyFacts, destination, origin, displacement)`. Input facts,
points and returned positions are detached. The host does not mutate actors.
The SDK checks finite coordinates and a nonnegative integral layer, applies
the returned pose, and enforces its tether after a host wall slide. Invalid
provider output quarantines the session. Missing `stepPhysical` retains the
existing `clamp` path. A void crossing additionally requires the host's explicit
world-boundary service; the reference floor is bounded and produces no void.

`space.walkScale` optionally supplies a nonnegative derived terrain/weather
speed multiplier. It replaces the original geography-specific road, boat, wind
and snow reads, without importing those world systems. `pose` and `poses` expose
detached presentation facts; the batch form avoids per-body identity searches.

`createCombatGeometry(content)` supplies the original nearest/contained body,
segment radius and area queries for an adapter. Segment selection is spatial;
the SDK writes the selected combat hit segment. A spatial provider need not
modify a body to make a multipart hit work.

## Mapping to the existing game seams

The reference follows the inspected Vesperwild Combat contract: Node combat
authority, Godot client, `(x,y,floor)` host facts, 30 game units per metre,
height in centimetres, and localhost newline JSON. It does not import or edit
Vesperwild Combat, Vesperwild Foundation or `D:/Games/Hollow-Wake`.

| Existing seam | Reference adapter / adoption responsibility |
|---|---|
| `host/src/server/serve.mjs`: `input`, `hello`, `state` | Same transport and coordinate convention; explicit `hollow-wake-sdk/1` profile, sequence acknowledgements and build messages |
| `Ground.walkStep`, `footprint`, `walks` | Implement `stepPhysical` and `clamp` with the game's existing collision/floor providers |
| `Ground.touchLine`, `blowReaches`, `reaches`, `gate` | Supply sight/fire/contact and area predicates using existing delivery rules |
| `Ground.rideInto`, `shotMeets`, `airAt` | Supply projectile ride/grid-ray facts; retain SDK projectile and hit authority |
| `Ground.sheetAt`, floor identities | Supply height for rendering and maintain the host's floor ledger |
| Spawned bodies / delivery presentation | Consume authoritative IDs, poses, zones, projectiles and combat signals |
| Inventory | Prepare/preview/publish through `CharacterSession` and the combat binding |

**Floor indices are not SDK story IDs.** A Ground floor index identifies one
column record; adjacent walkable columns must not become unrelated combat
stories. Adoption must explicitly derive the SDK story/layer partition and keep
the detailed floor ledger in the existing host. Layered reach still needs the
host's Ground gates. The reference's two layers are a small deterministic
example, not a replacement terrain/fall/navigation framework.

Actual game adoption is a later project-controlled step: replace the reference
space, map its input and renderer, and replay the game's own ground/contact cases.
No edits to that evolving foundation or communication with other sessions is
implied by this delivery.

## Optional storage

`createMemoryCharacterStore` is the default. The file example is a separate host
module selected only by `--save-file`. It serializes writes through one owner,
uses a temporary sibling and rename, cleans temporary files on failure, and
admits loaded character data through the same kit. A database or game save
service can replace those two `load/save` methods without changing combat.
External entitlement and Reliquary projections remain host-owned: the consuming
game supplies its current authorized projection when loading character data.
The sample uses its fixed training-room projection.

This is portable character investment, not live fight recovery, account
coordination, campaign state, cross-process writer arbitration or crash-durable
whole-game saving. No persistence call occurs in a hit or simulation step.

## Verification and limits

`npm run test:node-godot` builds and installs all five archives offline, removes
66 optional runtime/declaration files, checks public types and runs two fresh
consumers. The family courses enter through the actual Node input/step adapter;
locomotion also runs through the actual reference spatial provider. Separate
contracts check ownership, queue/framing limits, storage replacement, build
preview/publication, layer crossing, walls, flight and a live TCP connection.

`node scripts/test-node-godot-player.mjs --tools <tools.json>` builds a fresh
consumer, runs Godot, exports the player and repeats the interaction course with
the source scene unavailable. `--render` additionally checks a real rendered
player and saves screenshots. The pinned editor/templates come from the existing
toolchain lock; the new preparer needs no C++ bindings or native build toolchain.
Godot's [TCP API](https://docs.godotengine.org/en/stable/classes/class_streampeertcp.html)
and [export workflow](https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html)
are the engine boundaries used here.

This qualifies a desktop Node/Godot reference path. The simple compatibility
renderer, bounded protocol and absent storage work in the hot path are design
choices, not measured Steam Deck/mobile performance. Native mobile Node hosting,
Unity and Unreal remain unqualified. The [performance record](combat-inventory-milestone-five.md)
contains measured desktop budgets. The [release adoption guide](sdk-adoption.md)
provides the matched archives and clean-project walkthrough.
