# Summon birth and offspring

The optional `@hollow-wake/engine/summons/birth` and
`@hollow-wake/engine/summons/offspring` entries execute synchronous commands over
host-owned actors and skill instances. The optional entries remain separate from the eager core import.

Create one `SummonBirth` with typed host ports, then call
`spawn(owner, skill, overrides?)`. It returns the created body or `null` when
admission refuses. `SummonOffspring.spawn(parent, action)` requests child bodies
through its host birth port. Hosts may connect that port to `SummonBirth.spawn`.

The birth service orders capacity eviction, reservation admission, selected body
creation, summon-specific configuration, crew skills, inheritance, socket forwarding,
resource fill, placement, world membership, auras and arrival effects. The offspring
service preserves source-skill identity, action read timing, random consumption and
the removal of parent-only persistent contracts from each child request.

The host owns the body factory, authoritative roster, stat queries, randomness,
simulation time, collision placement, damage, death and presentation. Supply the
current resolved summon delivery or `undefined` from the normal delivery port.
Explicit delivery overrides are read and checked once before effects; null falls
back to the resolver. Value-producing callbacks must return synchronously. All
callbacks are synchronous by contract; TypeScript cannot enforce this for callbacks
whose return type is `void`.

Actors, skill instances, delivery payloads and content rows are borrowed. Preserve
their identity. Roster ports return fresh, ordered arrays that the command may
filter and consume. Captured stat contexts retain their own original tag/modifier
references through later callbacks and re-entry. Reusing one mutable scratch
context for every capture breaks that contract. Query tags and modifier-filter
tags have separate type parameters because their host representations can differ.

An exception retains earlier resource, shell and membership writes. Neither
command supplies rollback, detached graph construction or durable publication.
Private preparation requires the host to supply a fully isolated graph.

Validated shared content tables can supply definition lookups. Storage databases
belong in content authoring and persistence; these commands perform no SQL or
network access. Byte size checks do not measure CPU time or allocation cost.
Birth bursts, sustained churn, whole-frame performance and Steam Deck/older-mobile
device acceptance remain separate qualification gates. Actual engine packages
must expose and verify these capabilities before claiming native support.

The immutable original baseline has 117 observations in seven courses and 108
original fault checks. Installed/browser consumers pass 56 independent contracts,
35 package faults and public/direct-source types. The game adapter has 62
installation guards and compares 345 observations through twelve installed
modules, retaining four private companion contexts and fifteen stages. Ten
integration faults are detected. The complete assembled game has a separate
paired combat course; see the milestone evidence for its recorded outcome.
