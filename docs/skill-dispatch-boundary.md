# Complete skill request dispatch: original boundary

This boundary continues the ordered request policy introduced in v0.28. It moves
the remaining `World.useSkill` orchestration through creation of a running cast
or immediate delivery. Spatial queries, effect execution, updates to running
casts, persistence and presentation remain explicit host responsibilities.

The [accepted baseline](../baseline/milestone-thirty-four/acceptance.json) observes 88 courses and 104 transitions in the frozen
original and retained v0.28 installation. The source remains pinned to
`88e135e6c85d301ee7c0c3641f9fc2f92be0e140` with its preserved overlay. No new
runtime implementation is evidence for these expected results.

## Extraction unit

The original `World.useSkill` contains 66 top-level statements. Its first sixteen
are already delegated to `SkillRequest`. The remaining fifty cover:

1. Check every reserve price, then spend all payable reserves.
2. Determine whether this press pierces a running action; resolve a combo redirect
   or repeated host step before changing the aim.
3. Apply status-driven fumble and scramble rules, including exact random draw
   order and recursive entry through the complete request boundary.
4. Release or ignite aura, summon, strobe, Hexbrand and following curse toggles.
5. Prepare Spirit Totem conversion or resolve targeting, including a second target
   query after promoting a lightweight enemy into a full actor when applicable.
6. Commit ammunition and the combo cursor, then prepare channel persistence or
   gathered casting.
7. Pay ordinary costs, spend the gauge, record press time and cooldown, consume
   combo charges, and notify the attack-sequence hook in order.
8. Construct concentration, guard, charged, overcharged, timed, perfect, multitude
   or ordinary cast state; an instant cast delivers immediately and stamps recovery.

The retained adapter contains 49 statements because earlier modules already own
the preflight prefix, ammunition commitment and several cast-duration calculations.
The new dispatcher must reuse those tested capabilities. It must not resurrect
the original inline copies or undo their contracts.

## Proposed public and host contract

One dispatcher belongs to one simulation. Its request operation accepts borrowed
actor and skill instances, an aim value and an explicit seat-press flag. It runs
the existing preflight first, then the remaining ordered policy. It returns the
original boolean: a handled toggle is successful even when no cast begins.

Host ports provide immutable authored definitions, live numeric observations,
authority and identity lookup, random draws, targeting, effect delivery and
synchronous feedback. Aim and facing types remain host-defined. Copying an aim
must yield a distinct owned value suitable for retaining in a cast; the SDK must
not silently flatten a 3D aim or assume a renderer's angle convention.

Actor-owned balances, cooldown maps, toggles, combo cursors and cast records retain
their identities and ownership. One dispatch does not snapshot the whole actor,
serialize across a bridge, or query a database. Definition validation belongs at
the content boundary. Runtime state reads stay live where original ordering makes
that observable. Internal redirect calls re-enter the full host request entry.

The scramble latch is shared by recursive requests within one world, never by
independent simulations. No generic busy guard may reject legitimate combo,
conversion or scramble recursion. The temporary scramble pool preserves bar order
followed by AI instance order, including duplicate references where present.

## Observed invariants that constrain refactoring

- Reserve checking and spending are separate passes. A later short pool prevents
  all reserve spending at that check. A named zero price overrides a default price.
- Actor admission treats a positive vent stamp as closed until the sweep clears
  it. An already-active aura can reach the World reserve check, which instead
  compares the deadline with world time and admits equality. Keep these distinct.
- Reserve fuel is already spent when later targeting or concentration fails.
  A combo redirect may spend both the host's and the selected step's reserve
  prices. Refusal of that step does not refund the host's earlier spend.
- A combo window includes its end. Repeated host steps retain the same instance.
  Recursive combo steps clear `seatPress`; conversion/mimic/scramble do not share
  that omission. Successful redirects advance the cursor; refused ones do not.
- A fumble can spend reserve fuel and apply stun without spending ordinary mana.
  Scramble excludes reflexes, aura stances, the original id and trigger-equipped
  candidates, then checks each candidate's actual admission. Latch scope and draw
  count must remain observable in the complete path.
- A pierced reflex preserves the prior cast, aim and facing, and uses reflex
  recovery. A permitted instant hold-combo preserves those same running-action
  fields but uses ordinary instant recovery. Bar-growing conversions are skipped.
- Strobe and Hexbrand releases require a seat press. They refund reservations
  without another ordinary payment. Following curse cleanup expires the zone
  before removing its indexed entry.
- Channel starts consume combo charges while deferring ordinary mana and gauge
  spending. The channel-persistence conversion pays at press instead. Ammunition
  commitment and combo advancement occur before this choice.
- A concentration request without a quarry can already have paid mana, spent its
  gauge and combo charges, recorded its press/cooldown, and opened the attack
  sequence. Preserve the original result and partial side effects.
- Primed-pour eligibility is read after payment. A life cost can turn an initially
  eligible full-health flask into an ordinary pour. Do not cache that answer at
  admission.
- Guard state exists before guard callbacks. Timed markers consume random draws
  only in their selected modes. Cast duration, paid cost, target identity and
  bank-derived multipliers are captured at the original points.

Callbacks are synchronous. Original partial mutations are not a transactional
rollback guarantee. Error and re-entry behavior require independent policy tests;
ordinary successful captures do not prove recovery from every host exception.

## Evidence scope and remaining acceptance

Courses execute original methods with forwarding observers. They record request
results, meaningful call order and call-time state, random draws, cast records,
resources, toggles and selected downstream effects. Per-run skill-instance tokens
preserve identity relationships. Non-finite numbers are tagged instead of being
silently collapsed to JSON null.

Attributes, banks, statuses, construct flags and held states are explicitly seeded.
Synthetic definition combinations are labelled, including targeting added to Seize
to exercise the request-time promotion branch. Native Seize itself has no innate
targeting declaration. A real lightweight enemy is promoted through the original
World implementation. These fixtures do not establish every authored effect,
rendered input, physical controls, device performance or engine-package installation.

Before adopting an implementation: add independent precedence/identity/error tests,
behavioral mutations, a guarded source overlay, a clean packed consumer, installed
original comparisons, relevant native game and renderer regressions, and complete
request benchmarks against retained v0.28. Keep prior accepted archives intact.
