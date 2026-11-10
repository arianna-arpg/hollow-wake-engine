# Aura ledgers

The optional `@hollow-wake/engine/auras/ledgers` capability handles
ledger capacity, mana-regeneration banking, upkeep and settlement. It borrows
active rows, definitions, balances and actor resources. Hosts supply current
pool queries and synchronous retirement, damage, death and presentation services.

`auraLedgerCapacity(actor, spec)` returns an unbounded capacity when the cap is
absent. A present cap sums its flat value and fractions of current full life and
mana capacities. Both pool reads occur even for zero coefficients. Reservations
do not reduce these full pool inputs.

`bankAuraManaRegeneration(actor, rate, dt)` returns the rate left after ordered
ledger skims. It banks only available room, but suppresses the full skim even
when the account is full. This is original gameplay behavior, not a missed
refund. Later accounts receive the already-reduced rate; live Map iteration is
preserved. The host owns living/standing admission, rate derivation and applying
the returned rate to mana. The existing damage pipeline owns damageTaken banking
and calls the same host capacity service; this module does not apply a second skim.

`AuraLedgers.update(actor, dt)` pays escalating upkeep on positive balances.
An exact bill is payable. Insufficiency announces closure before requesting
retirement, which owns actual settlement. After payment, a ventMana account
with at least one point vents when current mana is strictly below its authored
fraction of available capacity. That settlement retains the toggle. Callbacks
may alter the live active-row Map; a newly inserted row can be visited this tick.

`settle(actor, spec, balance)` clears the balance before checking the half-point
floor or death. Raw arrears debit life, publish the wound cue, then recheck death
before calling the host kill operation. Reclamation credits mana up to current
available capacity; optional burst damage uses the entire due balance, including
overflow. Color is captured before the burst. Later radius and position reads
remain current, so burst callbacks can affect the following cue. Lapse none still
clears the account. The constructor receives the host's default vent damage type;
the Hollow Wake binding supplies lightning.

The update settlement port deliberately routes through the host's settlement
entry, preserving observation and dispatch. It can delegate back to this service's
settle method. Retirement remains a separate command and can call settlement in
its original phase. Exceptions preserve preceding writes. This is not a save
transaction, actor clone, deferred effect queue or durable publication protocol.

The original observations use authored Arrears/Reclamation definitions, real
actors and explicit diagnostic rows. They cover actual damage/death, regeneration,
boundaries and callback order; activation and full World scheduling remain
separate. No database, registry, clock, random source or per-actor cache is owned
here. Runtime cost, whole-frame allocations and physical-device acceptance still
require measurement.
