# Status siphoning and Impale recall

The original behavior is frozen before extraction in `baseline/status-delivery`.
Two original runs and the installed predecessor produce identical bytes across
88 courses. Independent assertions check the outcomes; all 52 deliberate source
faults change the trace without introducing unrelated exceptions. This checkpoint
does not yet ship a reusable status-delivery runtime.

The source is the two complete `executeSkill` branches for `siphonStatus` and
`recallImpales`, plus the returned spear's exact-instance association used by
`clearTreeFields`. Their statements and identity boundary are recorded with
source hashes. The authored Draw Corruption, Spear Recall, Rending Extraction
and Crossing Steel definitions remain unchanged.

## Boundary and observable behavior

The future capability owns selection, ordered status removal, healing and burst
policy, returning-spear identity and selective retirement. It composes the
existing transplant and damage capabilities. The host supplies actor membership,
geometry, shared mitigation, actual projectile flight, death and presentation.
Extracting a spawn instruction alone would leave the identity lifecycle incomplete.

- Siphoning iterates live actors and reverse status order. It skips the caster,
  dead or hidden actors and all constructs, applies the requested team filter,
  and includes the body's exact radius edge. It has no additional story filter.
- Transplant is attempted before removal, modifier cleanup, counting and optional
  healing. A declined transplant still removes and counts the source status.
  Remaining duration and the skill's display name reach the transplant service.
  Healing reads current contextual healing power separately for every status.
- Recall uses the host's enemy query, excludes breakable constructs and includes
  the body's radius edge. A status needs both a discharge definition and a
  positive bank. Removal and modifier cleanup precede bank capture and mitigation.
- The recalled burst retains its elemental damage type. The returning spear is
  physical. Explicit zero damage or spear shares remain zero. Shields can absorb
  the burst without preventing bank consumption or projectile creation. The
  original raw burst path also affects an invulnerable target; this baseline
  preserves that observation rather than silently changing it.
- Ordinary spears reuse the caster's cache at the effective skill level. Tree
  overrides create a distinct instance for each occurrence and retain the exact
  granting instance. Refunding one tree removes its flights while another tree's
  and ordinary cached flights survive. Three courses run actual projectile travel.
- Callback-visible writes, nested delivery and nine deliberate callback failures
  retain the original ordering and partial state. Live callbacks can affect later
  levels or shares; already captured bank values remain captured.

## Reproduction and limits

Run `npm run reference:status-delivery` against the pinned original. Use
`node scripts/run-status-delivery-reference.mjs --game <installed-game>` for an
installed comparison. `npm run test:status-delivery-observer` tests the positive
control and 52 source faults in a private original-source copy. These commands
read accepted fixtures; they never regenerate them.

The [baseline evidence](../evidence/status-delivery/baseline-windows.json) retains
the capture receipts, fault results and observer-development corrections. The
work does not establish an external content schema, persistence transaction,
performance improvement or physical-device/native-package acceptance.
