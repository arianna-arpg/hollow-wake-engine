# Private stat context for character builds

`StatSheet.fork()` creates an independently mutable sheet with the same rules,
ordered modifier sources, base overrides, active conditions and gauges. Use it
when preparing a build before it can become visible to a live simulation.

```ts
const candidate = liveSheet.fork();
candidate.setSource('gear:helmet', candidateHelmetModifiers);
```

Writes to either sheet cannot change the other. Existing modifier arrays and
their nested tags are already copied and frozen by `setSource`; forks share those
immutable rows and immutable `StatRules`, and copy their mutable maps and sets.
Public source reads still return detached copies. Forking neither runs gameplay
callbacks nor reads a database, clock, random stream or host engine.

Value caches, tag-context caches and lazy indexes start empty. The original cache
bounds are retained, including zero. The revision is copied and then advances
independently. Equal revisions on different sheets are **not** a conflict token
or proof that their contents match. This method returns a `StatSheet`, not a copy
of arbitrary fields or behavior added by a subclass.

This is a build-change operation, not a frame-loop requirement. Sharing frozen
rows avoids re-copying and re-validating those payloads. It does not eliminate
map/set allocation, guarantee a speedup, or establish Steam Deck/mobile budgets.

## Recorded original behavior

The [original capture](../baseline/build-context/README.md) contains fourteen
checkpoints using actual Cindervigil/Emberbrand equipment, paid Firebolt casts,
original rebuilds, saved investment and executed projectiles. Diagnostic base
overrides, a condition and a gauge expose dependencies that source-only copying
would omit. Explicit persisted Flame Studies picks exercise the original loader;
the course does not claim UI allocation or authored conditional-grant coverage.

A same-host rebuild changes the retained grant's level and preserves its existing
tree investment. A replacement host creates a new grant and restores investment
against its current level, potentially removing over-budget picks. The paid cast
continues to own its former instance. Rebuilding preserves current resources or
clamps them to their new maximum; it does not refill them or rewind cast payment,
cooldowns, use lock, elapsed time or random continuation.

These distinctions constrain the complete private build and live-publication
path. Forking a sheet alone does not rebuild contributions, clone a companion
graph, normalize durable investment or authorize live publication. Do not replace
a live actor or its action bar with a private snapshot. A durable save may outlive
its sampled combat context; acknowledgement needs an explicit rule for changed
context and retained instance identities.

## Verification

`test:stat-fork-package` runs 21 contracts through an installed archive and a
browser bundle, checks public types, detects 13 deliberate faults, and restores
a passing control. `reference:build-context` typechecks the pinned original game
and reproduces the accepted bytes in two fresh processes. It cannot regenerate
the accepted observations. Both commands clean their own generated folders.

`adapter:build-context` prepares private contribution/equipment/level/resource
results at all eleven rebuilds inside the fourteen-checkpoint original course.
It verifies unchanged live ownership during preparation, exact derived sources
and equipment, current-resource clamps, and the unchanged original capture.
The installed package and composed game adapter must be used. Five deliberate
faults cover cold restoration, resource refill and lost bases/conditions/gauges.

This is qualification of the ordinary authored path, using the game's typed
content services. It is not a complete standalone authored build provider. The
course has no active guard, aura, summon toggle or companion grant; it refuses
those cases explicitly. Guard reconciliation, persistent-companion refresh and
retirement, bonded-beast updates, and durable live acknowledgement still require
their complete graph and ordered-effect integration. Those phases can change
defensive sources, owned effects, and companion casts and must not be omitted.
