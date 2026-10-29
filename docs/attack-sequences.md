# Attack sequences

The optional `combat/attack-sequences` entry owns complete per-owner, per-skill
attack sequences: primary instances, per-target hit cycles, vulnerabilities,
rhythm wounds and consumption, independent casting sweeps, projectile contacts,
lodged weapons, bouncing catches, catch rewards/repeated throws, flight rain,
impact wounds, recovery clocks and ownership cleanup.

`combat/attack-sequence-content` assembles sorted tree patches, concatenates
independent sweeps, derives component delivery/status census and prepares payload
instances through the host's shared skill compiler. Growth is baked once; a
component preserves its real level for downstream rules. Generated payloads
strip the parent's attack sequence and trigger contract. Support records retain
their identities inside fresh socket/graft arrays. Host-specific definition
fields survive the definition copy.

## Host boundary

Create one `AttackSequences` controller for each simulation and keep it alive
through that simulation. It owns its sets, weak identity maps, scheduled work,
recovery objects and serial number. Actors, skills, flights, status/buff stores
and other delivery queues are borrowed, live records. `clear(owner, host)` and
`clearAll()` synchronously retire owned work through ordinary host cleanup.
Equal skill IDs do not make two skill instances the same owner.

The host supplies time, randomness, actor clock scaling, spatial observations,
position copying/interpolation, shared skill/stat/status/damage services,
projectile/construct execution, other work queues and semantic presentation.
The controller owns the chance, range, duration, damage and scheduling rules.
There are no ambient random/clock calls, engine imports or production dependencies.

Positions are a host type. The Hollow Wake adapter binds its existing 2D plane
and floor rules. The included headless example binds three-dimensional positions
and records delivery requests; it does not implement a physics or damage engine.
This generic boundary is not a verified Unity, Unreal or Godot attack-sequence
package. Those hosts still require actual bindings and acceptance checks.

All observations and sinks are synchronous. Sink port return types reject
Promise implementations. Actor methods are also required to finish synchronously.
Host queue replacement and zone retirement must occur immediately in the original
order. Do not defer a cleanup predicate. Shared actor records and callback failures
are not transactional: earlier writes survive a later exception. In particular,
a throwing strike delivery leaves its changed facing and an already removed
scheduled job does not execute again. Reentrant work follows the original snapshot
and live-observation rules; exhaustive callback/interleaving acceptance is open.

## Content and state

Trusted, already validated authoring and actor records are required. The exported
`attackSequenceErrors` preserves the game's numeric authoring diagnostic,
including its modifier exemption; it is not an untrusted-data schema parser.
The original policy fingerprint observes tree allocation, level, socket/graft
identity/level/rolls and the base definition. Editing external patch registries
in place does not provide a complete hot-reload invalidation contract.

The original arithmetic, random order, identities and cleanup behavior remain
authoritative for this extraction. No gameplay redesign or new numeric model is
hidden in the adapter. The controller still uses allocation/scan patterns from
the original; the nearest-target sort and policy serialization are candidates
for measured optimization, not established speed improvements.

## Verification

The expected trace was captured twice from the pinned original before runtime
implementation, and once through the 216-output predecessor adapter. All three
captures agree byte-for-byte: 31 probe groups, 114 checks, 7,264 call/sink events
and every one of 2,733 random draws. Actor resources, skills, status/buff records,
clocks, projectiles, pending work, zones and flashes are captured at each check.
The original probe owns the actions and assertions; the observer imports no SDK.
This scope is substantial but not exhaustive authored combinations or rendering
acceptance. Earlier 49 recovery courses remain a separate regression contract.

Use `npm run reference:attack-sequences` for the pinned original and
`npm run adapter:attack-sequences -- --location <location.json>` for an installed
candidate. The installed verifier checks archive integrity, package identity,
all runtime files, source preservation and the complete frozen trace. It never
rewrites accepted outcomes. `adapter:attack-sequences-faults` modifies disposable
copies only. `test:attack-sequences-package` exercises an independent consumer,
3D positions, simulation isolation and synchronous type contracts.

The [verified evidence](../evidence/attack-sequences/runtime.json) records 1,024 SDK
tests, 19 focused tests, 20 runtime faults, five source guards and eight installed
faults. A separate 12-course original content addendum covers patch/sweep ordering
and payload metadata, closing an observed gap in the gameplay trace. All 216 prior
runtime outputs remain unchanged; the optional modules add 25,874 bytes of JS. Device CPU,
allocation and memory budgets, dedicated renderer acceptance and native host
exposure remain open. The complete SDK project remains incomplete.
