# Equipment publication into live combat

This is a boundary contract and original-game baseline. The existing public
Unity packages still keep the workshop and combat actors separate. No connected
equipment package or performance acceptance is implied.

## Original observations

The [frozen course](../baseline/live-equipment/README.md) starts from real World
equipment commands, not an already compiled item summary. Two fresh processes
produce the same 12 courses and 74 observations.

- Equipping a common Lapis Ring during Ruin raises maximum mana from 117 to
  131, while current mana stays at the already paid balance of 109.
- Equipping a Coral Ring raises maximum life from 68 to 80 without filling it.
  Removing it after filling life clamps the current balance to 68.
- Equipping the Opal Amulet updates attributes and preview values. The active
  cast retains the same skill object, paid cost, elapsed time and total time.
- Replacing or swapping worn rings preserves the active cast. Reseating an item,
  refusing its level requirement or failing an exact-cell unequip does not
  restart the cast or refund its payment.
- Gear recalculation leaves unrelated cooldowns and recovery intact. The
  reference advances only the casting-progress phase, not all Actor timers.

World.text consumes a random draw for horizontal placement, including equipment
success messages and failure notes. The raw course preserves those draws.
Standalone combat and workshop already have separate explicit random states;
the adapter must preserve that isolation. It must not advance combat randomness
to imitate a visual cue. The original game adapter retains its existing host
presentation calls. Comparing those modes requires an explicit presentation
boundary; aggregate legacy global draws are not a mechanical parity claim.

Actual projectile-launch/contact sampling, status effects during the pending
write and broader equipment content remain separate acceptance cases.

## Transaction and ownership

The workshop remains authoritative for item custody, slot eligibility and item
identity. Combat receives a validated projection of the complete equipped set.
That projection must identify its content and supported behavior. Unknown
modifiers or unimplemented item effects must fail explicitly before persistence;
silently dropping them is not an acceptable conversion.

Prepare the candidate gear and validate its combat projection before starting
the durable write. Neither the committed inventory nor the actor changes during
that preparation. A locked writer, revision conflict or failed write keeps both
committed views. A successful write publishes inventory and the prepared gear
together at a documented host simulation boundary.

Combat can continue while storage is busy. Publication must use the actor's
current life and mana at that boundary, clamping them to the new caps. It must
not restore resource values, cast state, cooldowns, target state, effects or
random state captured when the save began. A cast may have completed, paid for
another input, or the actor may have died in the meantime.

The preparation must also protect against a competing structural build change.
For the first adapter, serialize loadout-changing operations while a candidate
is pending and continue allowing simulation ticks. Dynamic conditions and
gauges must remain current. A revision token alone does not make an old actor
snapshot safe to restore.

Ownership follows the existing storage/workshop lifecycle: close pending work,
retire prepared handles exactly once, and leave a reopenable committed save.
Native allocation failure is a host failure boundary, not a promised gameplay
rollback. Handle invalidation and recovery must be tested explicitly.

## First complete integration path

Begin with the three common, unsocketed items in the raw course and the selected
Magician/Ruin combat capability. Item admission must explicitly describe that
scope. Expand accepted content through actual behavior tests, not by assuming
that the presence of stat modifiers proves all unique/proc/socket effects work.

Acceptance requires:

1. The raw original mechanical observations reproduced through the connected
   SDK projection, including removal, replacement, swaps and refused changes.
2. Exact snapshots before and after refusal; a real active cast, unrelated
   cooldown, timed effect and combat random continuation preserved on promotion.
3. Time advancing while a save is blocked, then successful publication clamping
   the latest balances without reviving a finished cast or a dead actor.
4. Stale and failed writers leaving inventory and combat unchanged; deliberate
   early publication, stale resource restoration and random rewind rejected.
5. A real Unity editor and relocated player consuming actual packaged assets,
   reopening the saved loadout and producing the expected next combat result.
6. Work and allocations measured at preparation/publication. No database query,
   full-inventory serialization or loadout rebuild added to each combat tick.

The database remains useful for durable content records and paired snapshots.
It is not required in the simulation loop. This connection needs a precise
publication contract before it needs a different storage engine.
