# Persistent channel banks

`ChannelBanks` is an optional, host-independent service from
`@hollow-wake/engine/casting/banks`. It owns no actors or bank maps. A stateless
instance may serve multiple actors; the host owns every mutable record.

`bind(actor, instance, spec)` creates storage only when needed. It preserves
an existing bank and its fill, then updates the instance and spec references.
`lookup(actor, instance)` reads without creating storage. `decay(actor, dt)`
sweeps the borrowed map in insertion order. The host supplies a stable string
key and a live contextual decay multiplier through `ChannelBankPorts`.

The same-skill held channel is skipped before empty-record deletion. Other
empty banks are deleted. Missing or zero decay and an inclusive `bankAt`
plateau skip the contextual query. Remaining banks drain by authored rate,
current multiplier and supplied time. Deleted records keep their final fill,
including a negative overshoot; other holders can still observe that record.
No clamp, copy, receipt, clock or gauge publication is added.

Supply finite, nonnegative elapsed time and coherent finite bank data. Invalid
time is rejected before observation or mutation. A nonfinite query or computed
fill is rejected before assigning that bank's fill. A throwing query propagates;
earlier completed banks stay changed, and the current and later fills are not
changed by the service. Queries must not structurally mutate the map or reenter
its sweep. Skill/spec data remains host-owned and may change between calls.

The host applies world/actor time scaling and calls at the existing decay
phase. A zero elapsed sweep still deletes spent records and queries otherwise
eligible banks. To pause a world or actor, skip the call as the native host
skips its actor work. Keep gauge publication at its separate sampling phase.

The Hollow Wake adapter delegates creation and release lookup from the channel
adapter and replaces only the original decay block in `World.update`.
See [the baseline boundary](channel-bank-boundary.md) and the packaged
`examples/channel-banks.mjs` for the phase relationship. Full candidate and
device acceptance must be read from milestone evidence, not inferred from
this API contract.

## Size and performance boundary

The bank entry has a 3 KiB unminified JavaScript allowance; the separate gauge
publisher has 5 KiB. Their combined 8 KiB allowance increases the aggregate
package bound from 448 to 456 KiB. All prior module and core bounds stay fixed.
Both entries remain outside the eager core import graph. Size bounds do not
establish CPU, memory, frame rate or target-device performance.
