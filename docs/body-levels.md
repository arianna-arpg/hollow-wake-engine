# Body leveling

The optional `@hollow-wake/engine/bodies/levels` entry owns the body-level stamp,
in-place releveling, hit-counted armor capacity and body-to-skill level ladder.
One stateless `BodyLevels` service can operate on multiple host-owned actors.
It neither creates actors nor owns a world, clock, random stream or database.

`stamp(actor, definition, level)` publishes the level, borrows the authored ply
policy, calculates ply capacity, writes the baseline level modifiers, writes
nonempty authored scaling modifiers, and applies default boss poise only when
the definition has no authored poise. It does not refill life or armor. Fresh
body construction remains responsible for settling initial resources.

`relevel(actor, level)` resolves the body's definition and leaves missing or
same-level bodies untouched. Otherwise it preserves life and armor fractions
through the same stamp, clamps to new capacities, keeps living bodies at at
least one life, and does not revive a zero-life body. Armor uses the original
nearest-integer rounding. Native skill instances retain identity and receive
the resulting skill level; cooldowns and active cast progress remain untouched.

The default skill ladder advances once per four body levels. A configured
spacing is supplied to `BodyLevels` and `bodySkillLevel`; a host must use the
same policy for fresh skill creation and releveling. The Hollow Wake adapter
routes both existing World methods and the original ladder helper through this
entry, so minting and companion growth share the implementation.

Host ports supply definition lookup, baseline growth, boss policy, modifier
construction, stat writes and current maximum life. Inputs and ports are trusted
and synchronous. Level validity and content admission belong to the host; this
API does not silently coerce or reject policies accepted by the original game.
Exceptions retain preceding writes and are not transactional rollback.

Definitions are borrowed. Share them only when immutable for the relevant
simulation lifetime. In particular, the original ply policy reference is
retained. An absent ply or scaling policy does not remove a previously written
policy or source; changing definitions requires a separate explicit rebuild.
The order of stat sources and modifiers follows authored enumeration order.
Flat and increased scaling use the authored exponent; geometric multipliers
use the level offset directly. Zero coefficients retain the original omission.

The accepted original course has 23 checkpoints over three authored definitions
and one diagnostic definition. It covers wounds, spent armor, boss defaults,
authored poise, polynomial/geometric growth, native skill identity and
levels, unchanged cooldowns, missing-definition/same-level no-ops, living and
downed floors, and overfull clamping. Its expected output is immutable.

Companion continuation is checked separately with actual actor graphs and
current controller state. These courses do not establish every spawn, death,
revival, AI, zone-retirement or complete private-character construction path.
Durable acknowledgement must derive from current live resources and identities;
it must not replace a running actor with an older prepared snapshot.

This is a command/build operation. It adds no frame scheduler, actor registry
or cache. Source and modifier allocation remains visible and should be measured
before introducing caching or packed storage. Package size bounds do not prove
frame-time, process memory or Steam Deck/older-mobile acceptance. Native engine
exposure and device measurements remain separate work.
