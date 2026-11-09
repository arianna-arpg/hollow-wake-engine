# Equipment skill derivation

`@hollow-wake/engine/skills/equipment` exports `EquipmentSkills`, an optional
runtime for the skill portion of a character rebuild. It owns ordinary granted
skills, class skill bonuses, passive/tree grafts and worn support admission.
The guarded Hollow Wake adapter replaces that contiguous `World.recalcSeat`
phase. Item modifier compilation and equipment-action authorization remain
separate capabilities.

## Ownership and ordering

The host supplies a borrowed frame: character meta, the actor's bar and toggle
maps, the previous grant map, and already compiled modifier sources. Methods
are synchronous on validated, single-writer state. Content lookups, stat reads,
support fit and companion operations are explicit live ports. A frame is not
a serialized public command or a durable transaction.

The first granting worn item in equipment-slot order hosts a skill's saved
investment; the first granting container piece is the fallback. Rebuilding
the same host retains instance identity. Changing hosts restores the new
item's investment and replaces exact old bar references. Learned copies take
over granted seats without losing their base investment. Retired grants
remove only their own bar, aura and summon ownership.

Companion candidate discovery and source attribution are inside this policy.
The host still derives companion bodies, kills/relevels them, and supplies
crew-aware support fit. Companion completion precedes reading the old ordinary
grant map. Aura dismissal, summon dismissal and grant serialization preserve
the original call order. If a callback throws, earlier mutations remain;
callers requiring atomic publication must operate on private candidate state.

Bonuses and grafts are rebuilt rather than accumulated. Passive grafts keep
the original authoring semantics; tree and worn grafts yield to earlier
copies. Worn candidates scan innate, passive and gear modifiers, as in the
original game. Container modifiers do not independently create worn
candidates. Unfit worn rows are retried until no additional support fits.
Cycles with no initial enabler remain dormant. The final ledger carries the
same live/duplicate/unfit/empty decisions used for injection.

## Verification

The immutable original fixture was captured before implementing the runtime.
Two fresh processes produced identical state at all 60 legend checks and
36 worn-support checks. Observations include identity, sockets, tree picks,
derived grafts/bonuses, item-resident saves, bar bindings, resources, sheet
sources, active casts and toggle ownership across 11 original worlds.
Ordinary verification cannot rewrite accepted observations.

The installed-game qualification packs the SDK, reconstructs a disposable
pinned game, verifies all three game type configurations, installs the guarded
adapter and compares both probe outputs byte for byte. It also compares the
full 18,773-case equipment catalogue, including active-cast preservation and
item removal. Five deliberate faults target saved investment, compounded
bonuses, retained grafts, dependency retries and retired bar instances; a
restored package must match again. Nine independent tests add host changes,
source precedence, toggle identity, callback failure ordering and cycles.

The complete prepared-game qualification runs the real `adapter:prepare`
pipeline with the other extracted systems installed. It checks those same
lifecycle and catalogue observations, the 4,103 passive rebuild observations,
eight live authoring observations, all three game type configurations and the
simulation smoke suite. A separate 15-checkpoint original-game fixture exercises
actual registered passive supports, binding changes, choices, authoring refresh,
retired nodes and repeated rebuilds. Removing the compiled graft handoff must
fail that course; restoring it must recover byte-identical observations.

That additional fixture closes a coverage gap: the older passive rebuild rows
contain no active passive graft sources, and the older refresh course uses a
retired support identifier. Those accepted fixtures remain unchanged. The new
course uses the existing equipment observer, so its payload retains that helper's
general legend/worn scope label; the separate acceptance manifest identifies
the passive-graft course and pins its source and bytes.

Run `npm run build`, `node --test test/equipment-skills.test.mjs`,
`npm run reference:equipment-skills` and
`npm run test:equipment-skills-original` after preparing/installing the pinned
reference. Also run `npm run reference:equipment-passive-grafts`,
`npm run test:equipment-skills-overlay` and
`npm run test:equipment-skills-composed` for the complete integration. Installed
qualifications remove their generated games, reused dependency links, packed
archives and raw output even on normal failures. Tool reuse checks pinned
versions and installs the SDK into a separate consumer; it never installs into
shared dependencies. Public CI runs both integration modes on Windows and Linux.
Reference verification checks the frozen archive's integrity and its decompressed
observation bytes; it does not require platform-specific gzip headers to match
fresh compression.

## Performance and integration limits

This phase runs on build changes. It performs no database, filesystem, network,
rendering or per-frame work and imports no content registry. Temporary maps,
sets and rows preserve original ordering and callback semantics; this extraction
does not claim fewer allocations or a measured speedup. Avoid caching live
content or callback results without a separate correctness and performance
course. Content authoring/indexing belongs upstream of the compiled modifier
inputs; durable storage belongs after validated candidate publication.

The current Unity equipment preview still accepts its previously qualified
small jewelry set. This module does not expand native actor admission, execute
all authored skill effects, or qualify Unreal, newer Unity versions, Steam Deck
or older phones. Native candidate composition, item save publication and actual
device budgets remain required before that broader promise is made.

The source adapter accepts either the pinned original graft lookup or the exact
compiled-passive transformation. The default `adapter:prepare` path uses
`passiveBuild.grafts` from the existing passive adapter. Other edits within the
replaced phase, a missing preceding passive build and repeated installation are
refused. Unrelated host extensions and existing line endings are preserved.
