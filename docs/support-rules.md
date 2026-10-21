# Support rules, content and socket custody

Version 0.17 extracts support admission, tag composition, effective levels, numeric
folding, rolled cuts and the three socket/unsocket actions. The optional entries
are `@hollow-wake/engine/skills/supports`, `skills/support-content` and
`skills/support-actions`. They add no runtime dependencies and are not imported by
the core entry. They do not implement every support's effect executor.

## Ownership and host boundary

`SupportContent` validates, detaches and deeply freezes a `support-rules/v1` pack.
Definitions and status observations are indexed once. Policy membership uses
read-only sets. There is no database query, filesystem or shared registry in a
gameplay query. The existing authoring catalogue/SQLite tools remain build-time
tools; this capability compiles their ordered content into a separate JSON pack.

`SupportRules` binds synchronous observation ports once. A host supplies base tags,
resolved delivery/cast mode, tree modifiers, self stacks, summon/component
observations, status metadata, ailment tuning and crew-instance construction.
These observations must be coherent and side-effect free during each query.
The optional mechanism port supports a live host registry; `builtinMechanism`
provides separate dispatch so that the bridge does not recurse into that registry.
No cross-query cache assumes that mutable game instances stayed unchanged.

Input records are borrowed. Socket and definition identities survive routing;
unchanged modifiers remain borrowed, while scaled modifiers are shallow copies.
Returned arrays are newly allocated except `rawSockets`, which borrows the socket
array when there are no grafts. Consumers must not mutate borrowed results.
The constructor owns callback bindings, not a snapshot of the callbacks' results.

`SupportActions` binds bag lookup, known/granted skills, compatibility, discipline,
return/removal, rebuild, crew synchronization and dirty-notification ports. Its
reentry guard is per host. Invalid numeric addresses refuse before host reads.
Known skills take precedence over an item-granted copy of the same skill id.

Socket commit order is assign support, remove wrapper, rebuild character,
synchronize existing minions, then notify. Unsocket checks discipline and gives
the support a bag wrapper before clearing its old socket, then rebuilds and
synchronizes. Stored-skill recovery gives first, clears saved cargo, then notifies.
The `give` port owns the original notification for the returned wrapper. A full
bag must return false without changing custody. Commit ports must be synchronous,
nonthrowing and nonreentrant. Authorization, durable transactions, actor updates
and player input dispatch stay with the host; this API is not a persistence engine.

## Compatibility decisions

- Admission takes a positive tag closure while preserving slot order and graft
  order. Unseeded cycles admit nothing. A support admitted before a later excluded
  tag remains admitted, as in the original; reversing those sockets can differ.
- Effective levels floor each bonus contribution separately and have no paid-level
  cap. A zero base level bonus does not activate a per-support-level bonus.
- Forwarded numeric values scale, but overrides do not. Component-only costs,
  global armor/life modifiers and summon crew costs retain their distinct original
  lanes and ordering. Crew costs do not start reading rolled modifiers or forwarding
  scales merely because ordinary modifiers do.
- Caster compatibility reads rolled-row mechanism requirements. Legacy crew
  compatibility reads definition requirements only. This asymmetry is captured and
  preserved, not silently corrected during extraction.
- Missing or retired cut-row ids fall back to the first authored row. Rolling
  requires an explicit random source; all axis weights/totals and empty axes are
  checked before the first draw. Unit draws must be finite in `[0,1]`. Authored
  zero/nonpositive weight boundaries preserve the original first-row behavior.
- The borrowed legacy host passes unknown mechanism names through. Owned content
  rejects unknown mechanism families. Parameter interpretation remains the named
  predicate's contract; a custom `pour` lane can legitimately have no matching skill.

## Authored content

`npm run supports:build` creates the separately packable
`@hollow-wake/support-content` directory under `.artifacts`. It contains all 457
authored supports, 152 selected status observations, routing policy and ailment
tuning. The compiler checks definitions and their order against the original
catalogue and records a content hash. The JSON is approximately 369 KiB; its
package budget is 512 KiB unpacked. Optional runtime modules have a separate
32 KiB unminified JavaScript budget; the core retains its 96 KiB budget.

The modifier vocabulary includes six ids outside the original central stat
registry: `apply_ignite`, `cloudTrail`, `cloudCharge`, `cloudSalve`, `levitation`
and `windchillWard`. `dynamicStatIds` records this provenance. The game's numeric
sheet accepts dynamic ids and some have direct host readers. The compiler does
not invent base values, rename these ids or claim every id has an effect executor.

Unextracted support fields remain immutable opaque authoring data. They are not
evaluated as code. Keeping a trigger, charge, construct, summon or graft payload
does not make its runtime behavior portable. The remaining delivery and effect
execution is explicitly tracked in `docs/completion.json`.

## Reproduction and acceptance

Run `npm run verify` for the SDK contracts, fault checks and isolated packed
consumers. After `reference:prepare` and `reference:install`, run
`reference:supports`; normal checks compare immutable accepted captures and never
regenerate them. The accepted original observations cover 435,978 bare skill/support
pairs, 954 resolver states, 301 changed compositions and eight real World courses
with 35 transitions. Courses include remote custody/wire, equipment-granted skill
residence/save, rolled cargo/full bags, and live minion resynchronization.

`adapter:support-source` checks all three source files and both bridge collisions
before writing, both line endings, duplicate declarations, independent edits and
retained imports. `adapter:supports` verifies every installed runtime file, compares
all four captures and detects five deliberately broken installed behaviors before
restoring the package. The standalone packed consumer checks all 457 supports
against an ordinary Fireball host, both cut chassis, 1,064 chance samples and a
socket → preview → save → full-bag refusal → unsocket path without game imports.

Build an isolated renderer with `scripts/build-game-item-ui.mjs`, then run
`scripts/test-support-ui.mjs --game <game> --dist <build> --electron <electron>`.
It exercises mounted click-lift/drop, unsocket, full-bag refusal and stored-cargo
controls through native intents. Profiles and saves are isolated. This is a
desktop renderer test, not Steam Deck, mobile touch or foreign-engine validation.

`benchmark:supports -- --previous-adapter <retained-v0.16.1-game>` verifies source
and package controls before rotating original/previous/current workloads. It
compares a full preview over 954 populated skills and 40 socket/unsocket cycles
including character rebuilds. Setup and equality checks are outside timing;
every derived output must match. Target-device and allocation measurements remain
outstanding. Four runs on the recorded Windows/Node desktop measured:

| Complete workload | Original median | v0.16.1 median | v0.17 median |
| --- | --- | --- | --- |
| 954 populated skill previews, run 1 | 9.499 ms | 9.237 ms | 8.483 ms |
| 954 populated skill previews, run 2 | 9.207 ms | 9.669 ms | 9.184 ms |
| 954 populated skill previews, run 3 | 9.503 ms | 9.996 ms | 9.141 ms |
| 954 populated skill previews, run 4 | 9.437 ms | 9.487 ms | 9.226 ms |
| 40 socket/unsocket cycles, run 1 | 1.966 ms | 2.521 ms | 2.413 ms |
| 40 socket/unsocket cycles, run 2 | 2.020 ms | 2.711 ms | 2.474 ms |
| 40 socket/unsocket cycles, run 3 | 1.667 ms | 2.218 ms | 2.177 ms |
| 40 socket/unsocket cycles, run 4 | 2.105 ms | 2.756 ms | 2.324 ms |

Relative to the previous adapter, previews improve about 3–9% and complete socket
cycles about 2–16% in these runs, with substantial timing variation. Socket cycles
remain about 10–31% above original, including previously extracted rebuild overhead.
All previews contain 2,862 occupied sockets (three per rare skill). The first two
raw reports mistakenly described four sockets; the final two add explicit counts,
and all four derived-result hashes match. The evidence retains this correction.
No speedup is claimed across
unmeasured builds or hardware. Host tag routing uses an indexed admission array
instead of a set and keeps source order; immutable content pays validation once
at load. More invasive caching or database-backed runtime queries need measured
evidence and an explicit revision/ownership contract before adoption.
