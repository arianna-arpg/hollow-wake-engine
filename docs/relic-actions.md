# Relic and personal-storage actions

Version 0.13 adds the optional `@hollow-wake/engine/inventory/actions` entry.
`RelicActions` applies account relic placement, bag exchange, reserve deposit,
withdrawal, release, enable/disable, attunement, restoration reconciliation and
personal-locker transfers. It uses the existing custody, container and storage
policies. Content remains in the separate item/container packages.

## Boundary and call order

The host supplies trusted observations: local hosted account ownership, feature
ownership, fallen/casting state, station reach and nearby combat. These are
inputs from the authoritative host, not credentials validated by the SDK.
`relicCanManage` and `relicEquipmentRefusal` preserve the original refusal order.
Storage access and equipment changes have different rules. Equipped withdrawals
can work away from the Oracle; ordinary storage needs the Oracle. The initial
seating lesson bypasses calm/casting restrictions but still requires the local
host, a living actor and an available board. Personal lockers do not require
the Reliquary feature. Calm time uses the original inclusive boundary.

Each operation receives the current host-owned account and carry records. Item
bodies remain canonical objects. Destination geometry and exchange capacity are
planned before ownership changes. Geometry does not spread or clone item payloads.
`RelicActions` retains policy scratch, but no actor, account, context or item index.
One instance may serve sequential calls for multiple accounts. Nested calls to
that instance are rejected; scratch is always released after an error.

Successful actions return `changed`, optional `lessonCompleted`, or a keyed
refusal. The adapter then performs the original actor/notification/save effects:

1. Report a refusal when present. Do not treat `changed: false` as an exception.
2. For successful equipment/storage changes, apply lesson completion if reported,
   then recalculate the actor.
3. Call `sync` to mirror the bag and board into account selection references and
   reconcile reserve addresses, then save through the host's persistence layer.

Do not issue another ownership action between a successful action and this
completion sequence. `sync` is deliberately separate because the original actor
callback runs before the selection references change. Release/attunement need
account persistence without actor recalculation; personal-locker changes mark
character metadata dirty. Toggle-off follower retirement and life-ratio preservation
remain in the game adapter. The SDK does not invent entities or retire summons.

The records must satisfy the custody/live-inventory contracts: unique session UIDs,
canonical account references, consistent selection lists, valid boards and trusted
content. Restore untrusted saves through the established restore policy first.
Read ports must be pure and nonreentrant. Identity ports have the custody contract's
nonthrowing obligation during mutation. Exceptions from host actor/save callbacks
are not rolled back. Synchronous ownership updates do not provide a durable,
cross-process or crash-safe transaction.

One observed refusal can create an empty Reliquary container view before refusing
an invalid item. This harmless view creation is retained; `changed` describes the
gameplay action, not a universal guarantee of byte-identical state on refusal.

The Hollow Wake adapter replaces eleven guarded World methods. Its seat access
bindings are weakly held per World and read current state lazily. They do not cache
authorization results, account identity, combat state or content tuning. An existing
helper/property, changed owned method, duplicate method or binding file stops the
installer before writes. Unrelated World edits and LF/CRLF styles survive.

## Evidence

Two identical original exports preceded implementation. The accepted fixture has
eight Worlds, 2,048 access queries representing 512 distinct near/far combinations,
and 264 complete action transitions, including intermediate callback order and
canonical object positions. The capture decision records a coverage expansion
before acceptance; ordinary verification never rewrites the fixture.

Independent tests cover identity-preserving exchanges, full destinations,
recovery refusals, stale replay, lesson exceptions, exact destinations, reentrancy,
and avoiding unrelated payload reads during placement. The packed offline consumer
connects real authored items and container content to custody, action transfers
and numeric statistics without importing the game. Deliberately removing account
authority and bag insertion must fail tests. A separate installed-package authority
fault must alter the actual game's traces.

Reproduce with `npm run verify`, `npm run reference:relic-actions`,
`npm run adapter:relic-actions-source`, and `npm run adapter:relic-actions` after
preparing the frozen reference and isolated game. The installed fault check must
run alone with respect to consumers of that package installation.

## Measured cost

The benchmark uses actual World methods in the original, M14 and M15 games,
including actor recalculation and save callbacks. Node has no durable browser
storage. Setup and receipt serialization are outside timing; complete account,
bag, board and life states agree after every batch. Three warmups precede fifteen
samples with rotating implementation order. Values below are median milliseconds
per batch on Windows, Node 24.9.0, Intel i9-10900K.

| Work per batch | Original | M14 | M15 |
| --- | ---: | ---: | ---: |
| 2,048 access-query pairs | 5.3795 | 5.5779 | 5.9572 |
| 256 unchanged toggles | 0.0682 | 0.0722 | 0.1451 |
| 16 withdraw/deposit cycles, 1 reserve item, empty bag | 3.5924 | 4.1569 | 4.2375 |
| Same, nearly full bag | 8.1022 | 4.1399 | 3.9965 |
| 16 cycles, 96 reserve items, empty bag | 63.3368 | 15.0639 | 14.6474 |
| Same, nearly full bag | 67.3443 | 14.9202 | 14.8013 |

Most gains over the original already came from the preceding storage/custody
work. Small actions still regress. An earlier per-call binding implementation
took 11.0572 ms for the query batch and 0.4453 ms for unchanged toggles; the retained
before/after samples motivated reusable lazy bindings. Timing variance prevents
attributing every difference between runs to that change.

Use `npm run benchmark:relic-actions -- --previous-adapter <retained-M14-game>`;
the runner verifies the control's version, original action bodies, unchanged
earlier runtime modules, current adapter and installed package bytes. This is
desktop action timing, not a Steam Deck/mobile, allocation/GC or full-frame result.
The optional action module remains within 16 KiB unminified JS and the total
runtime within the existing 224 KiB allowance. Package bytes are not live memory.

Broader equipment/trading policy, account services, durable transactions, earning,
combat effects and full Unity/Godot/Unreal packages remain separate acceptance work.
