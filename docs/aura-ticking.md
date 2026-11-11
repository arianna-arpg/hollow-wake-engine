# Aura ticking

Optional entry: `@hollow-wake/engine/auras/ticking`.

`AuraTick` advances existing borrowed aura rows through expiration, toggle upkeep,
charge payment, life seals, spatial membership, typed damage, siphon and pulses.
The host supplies the frame delta and clock, actor collections, geometry, hostility,
stats, conversion, retirement, death, resource-flow and presentation callbacks.
It owns no renderer, database, global registry, actor cache or random stream.

Each bearer snapshots its aura entries before processing. Actor iteration stays
live; each phase obtains the current collection. Enemy selection uses the host's
selection snapshot. Callbacks are synchronous and may observe preceding writes.
A thrown callback retains those writes. This service is not a transaction or a
durable save boundary, and callbacks must not defer required work asynchronously.

The caller admits and schedules frames. The Hollow Wake adapter retains its
original phase between construct updates and strobes; actor timers and ledger
updates remain earlier phases. A finite aura expires at zero before paying upkeep.
Life upkeep refuses a debit leaving life at or below one. Charge debt accumulates
fractionally and pays whole charges. Seals update only when rounded reduction
changes. Aura damage uses current conversion, resistance and invulnerability.
Pulses reset to their authored interval without catching up multiple pulses.

The original Righteous Fire description mentions enemy maximum life. Its runtime
uses the bearer's maximum life for `drainLifeFraction` damage. This extraction
preserves that observed behavior and records the discrepancy; it does not silently
rebalance content. Siphon uses requested damage, including overkill, and completes
healing/resource flow before the attributed death callback.

Borrowed content and state identities remain visible. An explicit empty ally
modifier array overrides definition modifiers. Existing members keep their source
until they leave; membership publishes after removal callbacks. The pulse callback
runs after timer reset and membership publication, before reading the current
healing rule. These ordering rules constrain future allocation optimizations.

The service has an immutable 63-observation original baseline in three courses
with 50 original fault checks. Forty-eight independent installed/browser contracts, public and direct-source
types, thirty-three package faults and thirty-four adapter guards qualify the
portable API. Ten installed modules retain 228 original observations and four
private companion contexts across fifteen stages; twelve deliberate game faults
are detected. Full game composition, native engine exposure and physical-device
acceptance remain separate qualification steps.
No ticking speedup, allocation reduction, Steam Deck or mobile result is claimed.
