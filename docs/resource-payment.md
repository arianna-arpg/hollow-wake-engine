# Resource payment and repayment

Milestone 29 / version 0.25.

The optional `@hollow-wake/engine/resources/payment` entry provides a stateless
`ResourcePayment` policy. One immutable binding may serve many actors. Balances,
reservations and the two optional loan records remain actor-owned and borrowed;
there is no global actor registry, retained scratch state or per-frame receipt.
The shipped [two-actor example](../examples/resource-payment.mjs) demonstrates
admitted spending, shield substitution, both loans, blood observers and repayment.

## Contract

- Costs must be finite and nonnegative. Frames must have finite, nonnegative
  duration; supplied raw life regeneration must be finite. These arguments are
  validated before mutation. State and port results are trusted, finite game
  observations, not an untrusted save format. Readers are synchronous, pure and
  coherent for their call. Loan contexts may be borrowed but must remain valid
  until that phase finishes. Hosts resolve modifiers and raw loan specifications.
- `canAfford` is a resource query, not cast permission. In particular a zero-life
  actor can afford a zero price. The host checks death, downing, cooldowns,
  ownership, skill gates and target legality.
- `pay` deliberately does not recheck affordability. Call `canAfford` immediately
  before it without intervening mutations for an admitted payment. Direct
  underfunded calls retain original partial spending; they are not transactions
  and do not return a success receipt. Finite negative life can result from an
  unchecked blood payment. No rollback is promised after a throwing host callback.
- Mana spends first, then the usable energy-shield fraction. That fraction limits
  availability; the spent amount is subtracted directly from shield. Remaining
  mana price borrows headroom, bounded by both debt capacity and shared mana
  reservations. Life prices must leave positive life to spend blood; otherwise
  an active life loan borrows the whole price, bounded by its debt headroom.
- New debt mirrors into reservations, clamps the current pool to its available
  ceiling, then restamps the live repayment delay—even when an unchecked call
  books zero. Pool-paid costs do not restamp. Actual blood loss is committed
  before `lifeSpent` is invoked, once, with the amount of positive life spent.
  That callback is terminal and may make nested payments: there is no shared
  mutable scratch state to corrupt. Read ports may not perform nested mutations.
- `advanceDebt` belongs after the host's life/mana regeneration and before shield
  regeneration. The host supplies raw life regeneration sampled before healing
  modifiers and diversion. The host checks living/not-downed at entry to its
  regeneration phase, without introducing an extra check after healing callbacks.
- Repayment visits mana then life, advances idle clocks even at zero debt, and
  samples live context per lane. It uses early-flow modifiers before the deadline
  and full flow once the deadline is crossed. The entire crossing frame counts;
  there is no subframe proration. Freed capacity fills on later regeneration.
- Mana recovery is outstanding debt times recovery fraction plus flat recovery.
  Life recovery uses raw regeneration, life factor, attack speed and a recovery
  modifier queried with base one. Signed finite stat results preserve the original
  arithmetic; the policy does not invent clamps or change authored balance.
- A missing raw loan specification gives zero new headroom but an existing loan
  still uses original repayment defaults: delay 2.5, mana fraction .15, flat 2,
  life factor .75. This tolerates borrowed legacy records; it does not authorize
  creating unsupported loans. Aura activation and admission remain host-owned.

`availableMana` and `lifeCeiling` share the original reservation helpers (minimum
zero mana, minimum one life). They are also used by the actor's regeneration and
UI. `headroom` resolves capacity from the raw loan specification and live context.

## Adapter and acceptance

The Hollow Wake overlay replaces only the guarded Actor payment methods and
repayment block. It retires the exact earlier ordinary-payment shortcut and its
obsolete imports. The headroom wrapper becomes a public read-only diagnostic
facade; all arithmetic belongs to the SDK. The full surrounding regeneration
phase is source-guarded so an upstream ordering change requires review.
Existing World cost-ward observations, aura installation and
teardown, duplicate-lane refusal, unlearning locks and debt UI remain host-owned.
Ordinary, charged and channel casting reach the same Actor payment method.

Original primitive and native World observations are captured independently of
the SDK. Fixtures must be accepted before comparing extracted behavior. Tests
must include actual callbacks, live modifiers, reservation contention and native
ward/unlearning effects; arithmetic-only examples cannot prove the adapter.

The extracted runtime passes all 47 accepted courses, six installed
behavioral faults, all six existing installed casting regression suites, native
loan/cost/cue probes and simulation smoke. The rendered payment course learns
the real gems and uses ordinary player-intent polling to activate both loans,
borrow, test debt locks, wait for repayment and remove a repaid loan. It seeds
current pools explicitly but never seeds debt or repayment progress. Three
captured screens were inspected. This is a local automated renderer check,
not physical-controller, Steam Deck or mobile acceptance.

The package verifier retains the 96 KiB core and 400 KiB combined JavaScript
limits, and gives this optional module an 8 KiB limit. Earlier module limits
remain intact. The fixed two-lane traversal avoids an explicit temporary lane
array in the SDK.
That is a code-shape observation, not an allocation or speedup claim. Context
allocation and stat-read overhead still need profiling; complete timer timings
are recorded below.
No database queries belong in this per-frame calculation. Authoring storage and
validated runtime content remain separate concerns.

Unity, Godot, Unreal, Steam Deck and mobile acceptance remain unfinished. This
JavaScript capability does not establish native packaging or device performance.

## Preliminary desktop measurements

Two corrected runs compare the pinned original, retained v0.24 and the candidate
with identical derived results and all 135 earlier runtime files unchanged. Each
run uses five warmups and 25 rotating samples per implementation, across 32 real
actors with 96 operations each. Costs are resolved from native skills on every
operation; admission, payment, actual blood observers and World cost wards execute.
The second course adds complete Actor timers and native loan records with live
Controlled Burn modifiers. Native aura admission is tested separately.

| Course | Original medians | v0.24 medians | Candidate medians |
| --- | --- | --- | --- |
| Priced pool/shield payments | 36.77 / 37.07 ms | 37.76 / 37.10 ms | 37.38 / 36.59 ms |
| Payments, wards and actor timers | 59.42 / 58.14 ms | 62.37 / 60.31 ms | 63.90 / 61.85 ms |

These are whole-workload durations, not single-frame budgets. The candidate's
timer course is approximately 2.5% slower than v0.24 in both runs. Pool/payment
differences are small and do not establish a general speedup. No allocation,
whole-renderer-frame or target-device claim follows. The first investigation
run was excluded because its shield subgroup used a life-priced skill; the
corrected workload independently asserts shield spend, blood spend, both loan
balances and refusal activity before accepting a timing receipt.
