# Equipped resource event awards

The optional `resources/events` entry connects eligible game events to charge
banks and skill gauges. `ResourceEvents` owns the original filter and award
ordering. The host determines that a hit, kill, block, death, orb pickup or channel
completion occurred, then dispatches it with the actor and any event context.

One binding can serve a simulation's actors. The module owns no actor map, event
queue, charge bank, cooldown or random stream. Callbacks bind once; dispatch walks
borrowed equipped slots and feed rows directly. Actor state remains separate.
This avoids a second per-actor binding and does not claim measured allocation or
target-device performance.

## Boundary and ordering

The host supplies admitted skills, resolved innate/support/tree taps, toggle
state, distance measurement, elite classification, random draws, effective gauge
terms, cooldown access and the canonical charge award sink. Positions and victims
are opaque generic handles. Death-radius tuning is explicit in the host's units;
the Hollow Wake adapter supplies its original value of 360.

Each feed checks event equality, toggle requirement, enemy-death radius, orb
kind, elite victim, then chance. A missing death position bypasses the radius
check. The exact radius boundary is included. Other events do not use this
radius. Omitted chance consumes no draw; explicit zero and one both consume one.
A draw equal to its probability refuses the feed. The random port supplies a
finite number in `[0, 1)` and must participate in the host's deterministic stream.

Slots retain their original order. Charge taps run before gauge feeds within each
slot. Full, draining and locked banks still reach eligible chance rolls. A gauge
feed with an active cooldown shaves that cooldown instead of banking, including
during gauge lockout. Unused shave is discarded; a later feed sees the new
cooldown and may bank. Effective terms are read for each eligible gauge feed.

Calls are synchronous and commit awards in order. They do not roll back earlier
awards or random draws when a borrowed input is invalid. Sinks must not throw,
reenter, change content or change the equipped list during dispatch. Declared
state writes remain visible to later rows. Reentry is rejected across the shared
binding, and its guard is released even when an operation fails.

`fires` exposes the same predicate for hosts that need to inspect eligibility,
but it also consumes its chance draw. Calling `fires` before `dispatch` would
roll twice; dispatch already evaluates the predicate. It is not a UI preview.

## Content and installation

The validated resource pack from version 0.18 already carries these feed fields.
No schema or database conversion is required. Owned content is shared and
immutable; borrowed game definitions remain live. No production dependency or
query is added to the event path.

[The shipped example](../examples/resource-events.mjs) composes the event module
with statistics, charge banks and gauge payment. Two actors share one event
binding while retaining independent resources. The course covers exact death
radius, orb kind, elite hits, a partial gauge press, lockout and resumed feeding.
The package check executes copies of both examples from an actual installation,
with ambient randomness, network and browser globals disabled. A separate strict
TypeScript consumer checks the exported generic port contract.

The game overlay guards both original World declarations before replacing them.
It retains the event-producing call sites and elite helper, and lazily creates
one binding per World. Unrelated imports and source edits are preserved. Its
predicate characterization explicitly selects the installed SDK binding because
the original private predicate has been removed; ordered dispatch still calls
the actual game method. Full World resource scenarios check gameplay continuity.

## Verification scope

The accepted fixture reproduces 50 authored feed rows plus controlled edge cases:
1,300 predicate observations and 21 dispatch transitions. Original exports repeat
identically and match the preceding adapter. The standalone dispatch comparison
rehydrates each recorded before-state; it is supplemented by the existing seven
continuous World resource courses, with 54 transitions and real proc consumption.
Six deliberate SDK faults and three installed-game faults target chance, radius,
toggle, slot and cooldown/bank behavior.

The event vocabulary includes timed names because the original predicate accepts
them. Normal timed accrual still belongs to `ChargeRuntime`; do not dispatch it a
second time. Completed-use and credited-minion-kill lanes remain separate. Their
original loops apply only event/chance filters to one instance, so routing them
through this equipped dispatch would change behavior. Broader proc execution,
event generation, death authority, persistence and native engine wrappers remain
outside this capability. The mounted renderer course drives ordinary firebolt
input against controlled one-life monsters: actual kills fund a partial gauge
press, lockout denies further feeds, and later kills feed again. Gauge totals
are never seeded in that course. Profiles/saves are isolated; no physical-pointer
or target-device claim is made. Captures include two further simulation frames
so the bank's displayed state catches up with the death transition.

Two desktop event-path runs compared 64 real actors over 128 events each, with
five equipped skills, authored filters, synthetic chance/cooldown feeds, five
warmups and 25 rotating samples. Full derived outputs agree across the original,
v0.18 and candidate games. Candidate medians were 58.38 and 57.11 ms, versus
59.14 and 56.04 ms for v0.18 and 54.17 and 52.03 ms for the original. This places
the candidate within about 2% of v0.18 and about 8–10% above the original. No
speedup is claimed. Setup/equality checks are excluded, but result projection is
included equally. These measurements do not establish frame, allocation/GC,
renderer, native engine, Steam Deck or older-mobile budgets.
