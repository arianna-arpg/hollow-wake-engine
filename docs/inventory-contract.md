# Inventory contract: grid ownership v1

`Inventory` owns one board, stable string item identities, integer cell occupancy,
and copied JSON payloads. A host converts its item footprint and durable instance
data once on insertion. Item roll data, gems, locked flags, sockets and future
fields remain opaque; this module never generates or reinterprets them.

Boards have explicit dimensions and optional row-major `#`/`.` masks. No global
board callback or account registry exists. Coordinates and footprints are integral.
Boards are bounded to 4096 cells and 256 cells per axis. These rails bound the
occupancy index; opaque payload sizes remain the host's responsibility.

`insert` refuses duplicate identities and occupied/closed destinations. Omitting
both coordinates chooses the first row-major legal hole. `move` allows a single
blocker to exchange into the origin only if both final footprints fit and do not
overlap. It returns `moved`, `swapped`, `blocked` or `missing`. Locked flags do not
prevent grid movement, matching the original game's bag movement rule.

`remove` returns a copied item without a placement. `transferTo` first validates
and copies into the destination, then releases the source; failure leaves both
unchanged. It never invokes an overridden public insertion method. This is an
in-process synchronous transaction, not a distributed trade protocol. The host
must authorize account transfers, quest-item restrictions and equipment eligibility.
Identity allocation and uniqueness across different inventories remain host-owned.

`reconfigure` validates every retained position before replacing a board. It
refuses shrinking or closing occupied cells; it never discards or auto-sorts.
Version-1 snapshots preserve insertion order, footprints, placements and payloads.
Restore rejects duplicates, overlaps, closed cells, corrupt dimensions, missing
coordinates, nonfinite numbers, cycles and non-JSON payloads. Copy boundaries stop
external mutation from corrupting occupancy or saved data. Restore is a fresh
instance; failure cannot partially replace a live inventory.

Internally a contiguous `Int32Array` resolves cell reads; slots are reused after
removal. `at`, `canPlace` and `move` create no result objects or temporary item
lists. Insert, remove, snapshot and transfer intentionally allocate ownership
copies. This is not a claim that the JS engine makes zero internal allocations.

Evidence: 3000 generated original-game transitions across four boards, including
`World.moveBagItem`, plus independent transaction, mask, aliasing, overlap and
malformed-save tests. Every reference transition includes a JSON save roundtrip.
Original undefined fields are observed through JSON; source functions are never
used to manufacture SDK expected results. Strict invalid-input rejection is an
intentional boundary improvement over unvalidated original helper calls.

The game adapter currently delegates casting/timed-effect arithmetic. Its bag
arrays still remain native. An inventory adapter must route every write through
one owner before retaining this index; caching a directly mutable game bag would
be unsafe. Stash paging, overflow recovery, equipment and container policy are
separate pending contracts.
