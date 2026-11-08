# Live equipment reference boundary

The accepted mechanical source course is **v2**: 12 original-World courses,
74 observations and two byte-identical captures in separate processes. It
records actual equip/unequip actions during ordinary casting, life/mana caps,
retained cast identity, paid cost, elapsed/total time, unrelated cooldowns,
previews, bag custody, equipped items and global random draws.

The common Lapis Ring, Coral Ring and Opal Amulet cover mana, life and attribute
effects. Additional courses cover a worn-ring swap, reseating, an over-level
refusal, a blocked unequip, no refill and a subsequent cast.

Only World.updateCasting advances. Actor.updateTimers, regeneration, projectile
travel, actual contact damage and full-frame behavior are not covered here.
Fixture resource/clock writes are explicit commands. The gameplay adapter has
not yet been implemented or qualified against this course.

The first capture at this directory's top level is retained for audit, together
with its compressed exporter. It recorded 73 observations but reset fixture
recovery between two commands without a separate observation. Before implementing
an adapter, v2 made that setup action explicit. No original game logic changed
and the first capture was not overwritten. Normal reproduction reads only v2.

~~~text
node scripts/run-live-equipment-reference.mjs
~~~

The initial-capture option refuses to overwrite existing accepted files.
Temporary exporters and output directories are removed on success or failure,
and the complete frozen source map is checked before and after the run.

See the [integration boundary](../../docs/live-equipment-boundary.md).
