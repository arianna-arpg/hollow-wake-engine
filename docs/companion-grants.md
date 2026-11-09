# Persistent companion lifecycle

`@hollow-wake/engine/companions/grants` supplies `CompanionGrants` and
`companionReservationUnit` as an optional, dependency-free capability. The
package does not import an actor, scene, renderer, physics system or global
registry. State is an explicit `CompanionGrantState` owned by the caller.

The host supplies authored summon definitions, live stat queries, skill
construction, body presence, spawning, retirement and refresh. A presence
callback can use an existing entity index. The SDK neither scans the world's
roster nor constructs an index each frame. The Hollow Wake binding retains its
original roster lookup and per-owner weak map; this extraction does not claim
that binding is allocation-free or faster.

## Preserved behavior

- Derivation follows definition order, floors and caps granted levels, and
  creates companion skill instances with zero support sockets. Existing rows,
  instances and living bodies survive warm derivation. An instance retains its
  original definition when another definition with the same ID is supplied.
- Relic provenance is assigned before a living body refresh; display provenance
  is assigned afterward. A removed living body is retired. Dead bodies are not
  retired twice. The next map is published only after all callbacks return.
- Owner death retires a living companion and resets the unscaled authored
  delay. A companion's own death uses the current respawn multiplier once.
  Downed owners pause countdowns after dead or missing bodies are detected.
  Missing bodies retain their remaining delay. A failed/null spawn retries on a
  later eligible update.
- Spawn delivery is a shallow copy with `persistent`, `poolGroup` and
  `exclusiveGroup` explicitly set to `undefined`, and count/cap set to one.
  Authored definitions remain unchanged; unrelated delivery objects retain
  their references.
- Reservation price captures tags and modifiers once, then performs both live
  price queries even when the base reserve is zero.

This is a borrowed-state execution API, not a transactional save owner. Callback
exceptions retain earlier writes to existing rows and instances. A failed
derivation does not publish the next map. Reentrant calls, invalid/non-finite
time and externally corrupted state are outside the host contract. Private
workshop preparation must supply detached graphs and defer live side effects;
this module does not automatically make live bodies safe to clone or publish.

## Game adapter and qualification

`adapters/hollow-wake/integrate-companion-grants.mjs` checks the pinned original
module before changing it, supports dry-run review, preserves unrelated appended
work and rejects repeated installation or unreviewed source changes. It retains
game-owned stat registration and caller signatures. The complete game-adapter
preparation path installs this binding.

The original-only baseline contains 28 courses and 83 lifecycle observations,
including all ten authored persistent summons and callback-failure order. The
reference runner checks two fresh processes against frozen bytes; it cannot
regenerate expected results. Independent contracts also exercise identity,
three-dimensional delivery data, host observations and failures.

Qualification commands:

```sh
npm run test:companion-grants-package
npm run reference:companion-grants
npm run adapter:companion-grants
```

The game test loads the installed archive through in-memory source replacements,
leaving both the original checkout and pinned reference unchanged. It compares
the untouched original, companion-only binding and composition with passive,
equipment-skill and character-contribution runtimes. Its frozen courses cover
companion lifecycles, canonical account relics, class/container contributions and
live equipment casts. Deliberate runtime and binding faults must be detected,
then unchanged controls must pass again.

## Remaining boundary

This establishes portable lifecycle policy and a Hollow Wake binding. It does
not establish Unity, Godot or Unreal companion delivery, active-character account
authority, canonical relic investment writeback, complete authored workshop
construction, acknowledgement-time live publication, replication or save/resume
of companion bodies. Steam Deck and older-mobile CPU, allocations and frame
budgets remain unmeasured for this capability. Package size limits are growth
guards, not evidence of execution speed.
