# Bonded companions and inherited attributes

Three optional entry points supply the extracted rules:

| Entry | Responsibility |
| --- | --- |
| `@hollow-wake/engine/companions/bonds` | Bond policy, body growth coordination, capacity groups, granted skills, recovery countdown, mimic copies, dread pulses, whistle pulses, rally, frenzy and stance-art dispatch |
| `@hollow-wake/engine/minions/inheritance` | Owner investment, body/skill context, relic contribution scaling, batch scaling, life-to-armor trade and echo, regeneration, inherited status application and spent-armor preservation |
| `@hollow-wake/engine/minions/bequests` | Instance-owned attribute-sharing definitions and recipient source synchronization |

The modules have no runtime dependencies or ambient clock, random, rendering,
network or storage access. They are excluded from the eager core import. The
Hollow Wake adapter binds them to the pinned game's actor graph and authored
catalogue. Native Unity, Godot and Unreal package compatibility is a separate
integration and qualification task.

## Ownership and execution boundary

Create `CompanionBonds` with a complete `CompanionBondPorts` implementation and
optionally `createCompanionBondsState()`. The state contains body records, issued
skill ownership and a weak set identifying non-recursive mimic copies. It belongs
to one actor/skill graph. A shallow copy does not create an independent world.

The host supplies body releveling and revival, stat reads and sources, skill
construction, queue retirement, execution, enemy selection, stance definitions,
commands, cues, time and random draws. The controller owns the decisions and their
order. `retirePayloads` must match **both** caster and skill identity, across all
effect queues. `payloadActive` must include every queue in which a copied or
granted instance can remain in flight. The supplied game adapter covers repeats,
projectiles, fuses and zones; zones retire through their host lifecycle.

All services are trusted, synchronous operations on that same graph. Their
effects can affect later reads. Exceptions retain earlier writes; these APIs do
not provide transactions or authority to publish a prepared actor into live play.
Host definitions and modifier rows are borrowed. Admission, validation and the
lifetime of those definitions remain host responsibilities.

## Preserved behavior

Unchanged refreshes retain granted skill identity, cooldowns and wounds. Growth
relevels the body through the host, remints its granted skills at body level,
cancels a cast on a replaced grant and retains the ID-keyed cooldown. Growth
preserves the fraction of remaining armor; ordinary refreshes preserve armor
already spent. The claimed level remains a configurable floor.

Capacity counts distinct bond groups. A dormant body loses inherited sources and
grants, becomes downed, and does not revive when capacity merely returns. Raw
node order, socket IDs and levels, and dormancy determine payload policy changes.
Cleanup uses the previous policy's mimic cooldown before installing the new one.
Only granted or copied casts are cancelled; native casts survive that cleanup.

Recovery uses supplied elapsed time while the owner is alive and standing. It
does not advance merely because the absolute world clock changed, nor while
offline. Dread and whistle use host time and emit at most one pulse per update;
they do not replay all missed intervals after a long frame. Recovery protection
shares one configured budget across active bodies through the game adapter.

`resolveCompanionBond` sorts node IDs for patch precedence. Duplicate input nodes
retain additive contributions, matching the original; only granted skill IDs
deduplicate. Definitions, modifier arrays and rule inputs must not be silently
normalized by a host that requires exact original behavior.

Minion batch scaling applies once to owner contributions. Native stat bases,
regeneration rate, body size, avoidance and discrete armor follow their separate
original rules. Life trade and life echo read the same original investment.
Damage override modifiers retain their identity and value; other carried damage
rows preserve their filters while scaling the contribution.

Attribute bequests read original owner attributes without traversing the owner
chain. Recipient kind, team, owner life state, share caps and batch scale determine
the source. An unchanged signature avoids a source rewrite; resource clamps never
refill wounds. Attribute definitions must stay stable during active play because
the original signature does not encode modifier-definition revisions. Hot reload
requires an explicit host invalidation policy.

## Private continuation

`source.copyOwnedStateTo(emptyPrivateController, mapping)` populates a controller
already owned by a detached actor/skill graph. `source.forkOwnedState(privatePorts,
mapping)` creates that controller instead. Both preserve native, granted and
issued skill aliases, policy and inheritance signatures, exposure targets, stance
and all body-record clocks. Neither adopts, refreshes, revives, executes a skill,
advances time nor emits a cue.

`CompanionBondForkMapping` supplies complete `actors` and `skills` maps plus a
`spec` copier. Each source identity maps to one distinct private identity;
logical actor IDs and skill definition IDs stay stable. Owner, skill-bar and
active-cast aliases must already point into that graph. Mutable rule rows must
be detached; sharing requires the host to guarantee immutable content for both
graphs' lifetimes. Services are trusted and synchronous. Admission checks do
not validate arbitrary actor fields, callbacks, engine objects or effect queues.

Include every skill reachable through the simulation and external handles,
even if no body record or issued set references it. A copied skill remains
ineligible for recursive copying after its owned payload ends, after a policy
change and after body records are removed and recreated. A foreign caster's
carrier can still reference that instance. Equal definitions or serialized
contents do not carry this identity. The runtime transfers `WeakSet` membership
for every supplied pair; it cannot enumerate the set to discover omitted handles.
This requires enumerable maps rather than lookup callbacks alone.

The destination needs a separate empty body map. Its copy-history set is
replaced with the source history projected through the supplied skill map.
Old destination-graph handles must not enter the new graph. This also applies
when the source has no remaining body records. No strong registry retains
historical copies solely for continuation.

The host still copies actor resources, statuses, saved revival countdowns,
investment, active casts, payload queues and world-owned callbacks. It supplies
private time, randomness, stats and effects. This API neither constructs a
complete World nor publishes a durable build into live play. At acknowledgement,
derive from current live wounds, casts, clocks and identities; an older private
snapshot must not replace them.

## Persistence and evidence

`saved()` is a durable companion projection: body definition, level, host skill,
claimed radius, spawn scale, rarity sources and remaining recovery time. It is
not a snapshot of casts, issued effects, controller maps, or a complete actor
graph. Preserve the separate full-graph ownership boundary during build previews.

The accepted original evidence consists of 170 companion assertions plus the
existing 14 bond and nine persistent-body rebuild observations. The adapter
comparison also replays 17 guard rebuild observations. Independent contracts
exercise deterministic timing, mutable-host ordering, ownership and exceptions;
installed-package and browser checks use the exported interfaces. Deliberate
faults qualify selected assertions instead of treating matching happy paths as
complete proof. See `baseline/bond-mechanics/acceptance.json` and the scripts
`reference-companion-mechanics.mjs`, `test-game-companion-bonds.mjs` and
`test-companion-bonds-package.mjs`.

This extraction does not establish Steam Deck or mobile frame-time, memory or
allocation results. Bounded optional package size prevents eager loading of these
features into games that do not use them. Runtime optimization must be measured
against these preserved behaviors before introducing caches, dirty propagation,
packed storage, or scheduling changes. World body execution, movement, full AI
conduct and complete private graph construction remain separate work.

The [original copy-lifetime capture](../baseline/companion-continuation/README.md)
adds eight checkpoints in two fresh processes and four detected source faults.
It uses explicit diagnostic completion and foreign-carrier inputs, not UI
legality or graph transfer. The installed package and browser course now checks
53 contracts and 31 deliberate faults. Four real-game continuation contexts
exercise fifteen paired stages and five additional game/binding faults: active
and completed copies, body-record recreation, recovery with actual cleansing and
revival, and a partly elapsed native attack across policy changes and growth.
Every private step verifies that the live control stays unchanged before it
advances. This explicit fixture copier is not an arbitrary World copier.

The inheritance helper's optional tag/modifier arguments now have explicit
generic annotations. They preserve its generated public types and runtime
behavior while fixing inference for direct source consumers.
