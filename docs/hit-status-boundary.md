# Hit/status boundary before implementation

This is an accepted original-game fixture, not a new runtime API. The existing
`statuses` and `statuses/effects` capabilities remain unchanged.

The 369 courses exercise all 152 status definitions through both authored effects
and stat-granted application, plus 65 focused cases. They cover linked curses,
duration overrides, resistance/chance, wet grants, rupture conversions, critical
ailments, next-hit riders, delivery-added effects, callback changes and failures,
and held/top-level Impale discharge and drive-in. The observer calls the original
`World.resolveHit`; it does not replace the damage calculation with a stub.

Two original captures and the installed predecessor agree. State, random draws,
stat query values and order, application payloads, pool banking, proc callbacks,
text and flashes are retained. Stat-query traces explicitly represent all three
arguments `(id, tags, extra)`: omitted and explicitly undefined optional arguments
have the same representation. No source call or result is changed by this
normalization. An intentional application exception is recorded after the
application's earlier writes.

The initial draft missed ailment criticals despite a 95% chance because every
course started at the same random sequence. Its critical-scaling mutation
survived. The accepted fixture adds a course that must observe an actual ailment
critical. Five original-source faults are now detected: missing critical scaling,
changed stat-path pool banking, unspent rider stacks, ignored discharge hold and
changed fixed duration. The original source copy is restored after every fault.

## Distinctions the extraction must preserve

- Authored ailments perform the World-level victim resistance roll. The
  stat-granted path does not perform that same roll.
- Authored ailments can apply critical scaling. The stat-granted path has
  different Doom arithmetic and omits the non-damaging `power` option.
- Authored pool banking uses final outgoing DPS. The stat-granted path banks
  its earlier DPS value, before rupture conversion.
- Linked curses apply their first status with a narrower payload, without the
  ordinary authored-effect chance, potency and attribution process.
- Next-hit riders snapshot buff entries, execute their lanes, consume by id,
  and then emit their release cue. Reentrant changes must retain that order.
- Impale discharge precedes Assault planting and stat Impale drive-in. These
  phases must stay distinct across the host boundary.

These differences are observed behavior, not endorsements of balance choices.
Unifying them requires an explicit semantic decision and separate acceptance.

## Reproduction and next implementation

```
node scripts/run-hit-status-reference.mjs
node scripts/run-hit-status-reference.mjs --game <prepared-game>
node scripts/test-hit-status-observer.mjs
```

Ordinary runs verify the frozen inputs and never regenerate expectations.
The source lock, method/statement hashes and observer are under `baseline/hit-status`
and `reference/export-hit-status.ts`.

Implementation still needs independent arithmetic and callback-failure tests,
guarded adapter delegation, installed fault checks, and clean consumer validation.
Preserve live reads and reentry without a shared mutable current-hit slot. Measure
whole-hit cost before selecting caching or a different memory layout. Complete hit
orchestration, spatial delivery, death processing, native APIs and target-device
acceptance remain separate work.
