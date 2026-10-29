# Ordered hit-effect dispatch: original boundary

This checkpoint freezes the original behavior of the effect loop inside
`World.resolveHit`. It adds an extraction contract and reproduction tools;
the loop itself still executes in the game. The separate
[hit/status policy](hit-status-boundary.md) already handles its authored-status
branch. Complete hit, death and spatial delivery remain separate work.

The observer calls the real original hit resolver, damage service and effect
verbs. Two independent original runs and the installed predecessor agree on
107 courses. The fixture preserves random draws, stat queries, actor and status
identity, effect identity, callbacks, committed state, spawned actors, resource
orbs, player possession, text and flashes. Ten neighboring actors exercise the
default spread cap of eight and an explicit cap of nine.

The sixteen branches are heal, cleanse, buff, rupture, status, knockback,
grab seize, possess, pull, absorb, restore, ward, siphon orb, birth, status spread
and status transfusion. Enemy, ally and self targets are exercised, with additional
gate, ordering, reentry and failure cases. This is dispatch coverage, not a claim
that every authored skill or every underlying host verb has been extracted.

## Required ordering and ownership

- Run the challenge's `beforeEffects` hook before reading `instanceEffects`.
  The hook can replace the instance's effect array.
- Without delivery-added effects, iterate the original live effect array.
  A synchronous callback can append another effect that runs in the same hit.
  With delivery-added effects, the original implementation merges into a new
  array; subsequent appends to the authored array do not enter that hit.
- Borrow effect objects and status records. Forwarding an equivalent clone
  changes their identity and can lose live changes made by callbacks.
- Keep the hit's previously captured definition, duration scale, dealt damage,
  recursion depth, damage multiplier, tags and modifiers. Actor fields remain
  live at their original read points. Do not introduce a shared current-hit slot.
- Preserve synchronous callback order and partial writes. A buff grant that
  throws leaves its earlier grant committed without writing the bond. A failed
  transfusion can leave some recipients changed while retaining the donor statuses.

Status spread snapshots the selected status references, visits eligible enemies
in host order, checks the victim's story and body-edge distance, and increments
the recipient count after all carried statuses transfer. The default limit is
eight; zero is a real limit. Its flash requires at least one recipient.

Transfusion snapshots donor references and its recipient list, transfers every
selected status to every recipient, then removes donors by identity. The source
modifier is removed with each donor. Splash selection uses the scaled radius;
the presentation radius uses the authored value without that scale. Empty donor
selection emits the original refusal. These differences are observed behavior.

Ward, siphon and birth have different gates. Per-hit ward requires positive
damage and a living caster. Siphon requires positive damage, top-level depth and
a non-construct caster, but does not use the same death gate. Birth additionally
requires the authored `onHit` flag. Siphon uses the owner's identity when present.
Pull excludes constructs, anchored, leaping and dormant targets; stun can still
apply when the target is already close enough to need no movement.

## Planned SDK boundary

The extracted service will own dispatch, admission gates, ordering, recipient
iteration and donor cleanup. Explicit synchronous ports will provide the
underlying heal, cleanse, buff, rupture, status, grab, possession, absorption,
restoration, birth and orb operations. Existing SDK services can satisfy those
ports without duplicating their policies.

The host retains authoritative enemy selection, spatial observations, directions,
positions, dormancy and presentation. The contract must permit opaque host
positions and directions so a three-dimensional engine need not mimic the game's
two-dimensional coordinates. The adapter must preserve the original distinction
between borrowed orb positions and copied birth/flash positions.

The service will operate on trusted runtime records. A content compiler and an
untrusted-input parser are separate responsibilities. No database lookup belongs
in this per-hit dispatch path. Content storage can change independently once
validated records preserve these runtime contracts.

## Observer controls and reproduction

The first draft missed a spread-story fault: the upstream hostility filter had
already removed cross-story actors. Two additional courses enable the game's
existing rim-duel setting, assert that native enemy selection includes a
cross-story actor, and exercise the local spread and transfusion story gates
independently. The failed draft is retained in the checkpoint evidence.

The negative controls change 26 original-source behaviors across all sixteen
branches, list liveness and hook order. Each must alter the trace without adding
an unrelated exception. The only intentional exceptions are the buff and
transfusion failures described above. Faults run in a disposable original-source
copy, restored after each run; accepted expectations are never regenerated.

```
npm run reference:hit-effects
node scripts/run-hit-effects-reference.mjs --game <prepared-game>
npm run test:hit-effects-observer
```

The source lock, statement/branch hashes, compressed original observations and
acceptance metadata live under `baseline/hit-effects`. The observer is
`reference/export-hit-effects.ts`. The original capture precedes any implementation
of the new dispatch service. Runtime, adapter and independent consumer validation
must follow it before an extraction is accepted.

This baseline makes no performance claim. Whole-hit CPU time, allocation volume,
retained memory and physical Steam Deck/mobile measurements remain separate
acceptance work. Reusing live arrays where the original does so is necessary for
correctness; replacing required snapshots with shared scratch storage would risk
changing callback and nested-hit behavior.
