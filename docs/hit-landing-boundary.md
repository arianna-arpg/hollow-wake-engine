# Hit landing baseline

This checkpoint freezes damage admission and the first eighteen statements of the
damaging-hit branch in the original `World.resolveHit`, ending after damage-pool
feeding. It precedes extraction of this orchestration. The installed game still
owns these statements in `continuePreparedHit`; the SDK already supplies the
underlying damage, preparation, status and effect-dispatch capabilities.

## Source and observations

The [source boundary](../baseline/hit-landing/source-boundary.json) records the
exact original statements, hashes, positions and next statement. The
[acceptance record](../baseline/hit-landing/acceptance.json) pins the observer and
compressed expectations. Two original captures, the installed predecessor and
Node 22 agree byte-for-byte across 112 scenarios. Normal verification cannot
regenerate accepted expectations.

The observer runs the complete original resolver and real damage implementation.
Its simulation tap only retains identities and records results. It does not
substitute outcomes or mutate gameplay records. Explicit host-callback cases
exercise nested hits, live mutations and five intentional failures. Other cases
use native block, evasion, immunity, damage pools, consumable buffs, healing,
account deeds and mimic capture. Recorded state includes query and random order,
borrowed identities, account/actor state, cues and committed partial changes.

Positive assertions separately prove that named scenarios reached their intended
outcomes. Forty-eight deliberate source faults distinguish admission, captures,
deed eligibility, refusal termination, reaction order, identity and pool entry
snapshotting. An unrelated exception fails a fault check; it is not counted as
evidence of detection.

## Behavioral boundary

Damage admission uses the definition captured by hit preparation or the explicit
force flag. Delivery effects alone do not admit damage. A target-specific skill
replacement can therefore supply a different packet while the incoming definition
continues to determine admission.

For a damaging hit, player deed binding happens before life, hidden state and
panic are captured. Assault packet mutation follows those snapshots, then native
damage executes. Self-damage accounting floors overkill at zero. Critical state
is captured before account bookkeeping; total damage is captured later, after
refusal handling and mimic capture. These capture points must remain distinct.

Evasion and passive block each terminate the complete hit after their ordered
rewards and reactions. Block thorns precede charge taps, healing, recent-event
stamps, buff consumption, procs and triggers. Only depth exactly zero taps block
charges. A seeping block can kill, but its healing and triggers precede the death
check. An immune contact knocks fixtures with the captured tone and a false
wounding flag before returning.

A landed zero-damage contact is distinct from a refusal. Received amounts may
still cause a struck reaction, while recent-hit/hurt stamps and damage pools
require positive captured damage. Struck/hurt reactions borrow the same received
amounts. Positive damage stamps both actors, then critical stamps, then hurt
reactions. Pool feeding snapshots packet entries after those callbacks; later
banking callbacks cannot change the values already selected by that snapshot.

Mimic capture occurs only for a player recipient and enemy source after refusal
handling. The existing watch/capture implementation retains its own content,
study, capacity and deduplication policy. This boundary owns the occurrence and
ordering of that call, not a replacement mimic implementation.

The eventual portable service must use explicit synchronous ports, borrowed
records and invocation-local state. Active player identity and time remain live
host reads. Host callbacks can reenter, change state or throw; already committed
changes remain. Shared scratch frames and delayed callback batching would violate
this contract. A continuation may carry scalar results into the remaining hit
path without an additional result wrapper; that design still requires independent
tests and measurement when implemented.

## Observer repairs before acceptance

The first draft set block chance to one, but the original sheet caps it at 0.6.
Several named block scenarios therefore did not block. Explicit controlled random
draws now select the intended native outcome, and positive assertions verify
block results, depth gates, buff consumption and healing before death checks.

The pool fallback draft supplied an undefined raw amount before native damage,
producing a non-finite life result. It now supplies a valid zero amount to damage
and changes that entry during the hurt callback before banking. Every scenario
is checked for finite actor life, and the exact ordered bank values are asserted.

Removing the assault callback initially exposed a dependency in the observer:
later callback courses accessed packets retained only by that removed hook. The
read-only hit tap now retains packets independently. Original trace bytes are
unchanged by that repair. Only the explicitly skipped intentional failure is
permitted when its invoking source statement is removed.

## Reproduction and limits

Run `npm run reference:hit-landing` against the preserved source capsule and
`npm run test:hit-landing-observer` for a control plus 48 disposable source faults.
The reference runner also accepts `--game <path>` for an installed game copy.
The observer checks full native outcomes before comparing immutable trace bytes.
CI runs both commands and retains reports and diagnostic logs.

The [checkpoint evidence](../evidence/hit-landing/baseline-windows.json) records
completed checks, draft failures, source/runtime preservation and raw receipts.
This checkpoint changes no runtime or game adapter. Its validation is the new
original-source baseline and unchanged compiled output, not a new performance
measurement. The existing package/native results remain predecessor evidence.

The remaining hit path, sustain, threat, world reactions, delivery, death,
underlying host verbs and complete Unity/Godot/Unreal packages are separate work.
Physical Steam Deck and older-mobile acceptance remains open. Content authoring
can use the [storage pipeline](content-storage.md); database queries do not belong
inside this per-hit phase. No storage or hot-path optimization is claimed here.
