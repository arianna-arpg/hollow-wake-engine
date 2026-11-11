# Ordered body factory

Optional capability: `@hollow-wake/engine/bodies/factory`.
The factory remains separate from the eager core import.

`BodyFactory.create(defId, level, team, owner?, { scale? }?)` assembles a body
from borrowed definitions and synchronous host services. It returns that body
without adding it to a world roster. The factory has no runtime dependencies,
engine objects, global clock, ambient random source, filesystem or database.

Create one binding per host context and supply current time, randomness and
content through its ports. The Hollow Wake adapter binds the factory to the
existing body-level service and the real actor, skill, reserve, party, appearance,
status and item services. Allocation still owns identity and constructor defaults.

## Ownership and order

- Definition records, modifier objects and nested authored metadata remain
  borrowed. A fresh innate modifier array prevents appending generated modifiers
  to the definition's array.
- The factory creates mutable shell/segment state, reserve maps, skill arrays
  and selected boon arrays. Host constructors must provide independent skill
  and reserve state. The support, skill and choice tables are borrowed views.
- Owner queries, appearance, attunement, item generation and ambush callbacks
  execute in the original order. Later definition reads remain late reads;
  moving them into an eager compiled snapshot would change callback-visible
  behavior unless the content contract is deliberately revised.
- Exceptions preserve preceding writes and host effects. A mint counter or
  status callback can change before a later service throws. This is synchronous
  assembly, not a rollback transaction or permission to publish a private build.

The allocation port must return a fresh or correctly initialized body. The
factory does not clear every optional field, reset a pooled actor, deep-copy a
character graph, authorize party scaling or publish a durable change. Private
construction requires isolated host services as well as private body storage.
Void-returning TypeScript ports cannot enforce synchronous implementations;
hosts must honor the synchronous callback contract.

## Content behavior

The factory retains authored fields and original arithmetic, including explicit
zero weight, heft, shell regeneration and graft level; the juvenile and weighted
personality endpoints; grant thresholds and random draw order; first-null support
sockets; and canonical boon source identity. Positive finite scale overrides
avoid the variance draw. Zero and nonfinite overrides use the authored variance.
Structural skill-tree pin validation does not introduce a player level budget.

Keep authoring and persistence outside this operation. Shared validated tables
can come from a content build or database-backed editor; no query is needed for
each stat, skill or factory step. Cache or precompile additional work only after
measurement and with an explicit rule for mutable content and host callbacks.

## Candidate evidence

The original baseline covers 1,184 loaded definitions in 4,822 cases, plus twelve
focused ordering cases. Both courses were reproduced in fresh processes with
twenty original fault checks. The candidate prototype matches all 4,834 records.
Loaded definitions and selected level thresholds do not prove every possible
generated definition or branch combination.

The packed candidate passes 27 independent contracts in Node and a browser
bundle that refuses ambient host globals. All 27 deliberate package faults are
detected and the restored control passes. Eleven negative type examples qualify
the public declaration consumer, including its strict indexed-access option.
The implementation itself is checked with the repository's compiler settings.
The guarded installer passes nineteen installation and refusal checks.

The candidate installed game matches 5,179 observations across thirteen installed
modules in fresh processes and detects eighteen integration faults. The complete
candidate assembly matches those observations and all 25 paired combat episodes
against the same assembly retaining only the original body factory. Game,
launcher and simulation types pass. Four private companion contexts retain
their fifteen stages; this does not establish complete private character graphs.

Run `test:body-factory-package`, `reference:body-factory`, `adapter:body-factory`
and `adapter:body-factory-composed` after building and preparing the reference.
The last command qualifies the normal complete game adapter. Milestone evidence
records full SDK/reference acceptance separately from these focused checks.
The packed browser module is 5,799 bytes under the recorded toolchain; this is a
bundle-size observation, not a runtime or allocation benchmark. There is no
factory speedup, native-engine, Steam Deck or physical mobile-device claim.
