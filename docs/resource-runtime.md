# Charges and skill gauges

Version 0.18 adds three optional entries: `resources/charges`, `resources/gauges`
and `resources/content`. Charge banks, decay/drain, passive regeneration, equipped
timed taps, charge admission/payment and skill gauge arithmetic execute independently
of the original game. World event selection, support/tree resolution and delivery
remain explicit host responsibilities. This capability is not the held-cast mode
also named “charge,” nor the separate use-charge/reload system.

## Ownership and timing contract

`ChargeRuntime` attaches three distinct host-owned maps: charge counts, clocks and
last synchronized modifier counts. It keeps those identities, binds synchronous
ports once, and owns a reusable set for tree-clock cleanup. Every actor needs its
own state and runtime. Content may be shared. Reads must be coherent, pure and
finite; sinks must not throw, reenter or change the observed input during a call.
The host remains responsible for event delivery, actor time scaling, equipped
skills, admitted sockets/tree ranks, toggles and channel ownership.

The update order is decay accrual; whole-unit drain/decay and modifier sources;
passive regeneration; gauges; timed skill taps; retired tree-clock cleanup; reset
walked distance. Updates commit these phases in order and are **not atomic**.
Invalid public numeric arguments fail before writes. Malformed borrowed data or
a meter exceeding 65,536 iterations aborts at that meter, retaining earlier phase
commits. The limit is per meter, not a whole-frame deadline. Hosts must bound their
loadouts and elapsed time. No wall clock, asynchronous work or random source is read.

The game adapter observes live registries on every call. Immutable SDK content
instead precomputes ordered definition tuples once. The core entry does not import
the optional resource modules or content. Unknown counters may use custom borrowed
ports; the owned content pack requires declared charge references.

Gauge functions borrow the skill's state. They preserve unrelated fields and
object identity. The caller supplies resolved need/gain/lockout/cap terms and
content tuning. `gaugeSpend` and `chargePayment` compute payment, not authorization:
the host applies admission before accepting a press. Fractional/negative legacy
bank states are preserved where the original produces them.

## Preserved behavior

- Capacity rounds the combined skill and named bonuses. A gain through a smaller
  cap can lower the existing bank. Only a positive actual gain refreshes idle or
  emits an event. The shared gain-event queue stops accepting charge events at 64.
- A drain's presence blocks gains, even with a zero rate. Starting a drain does
  not immediately synchronize drain-only modifiers; the next update does.
- Decay crossing its delay charges the entire frame. Whole-unit decay can push
  a fractional positive bank below zero. Spending floors the remainder at zero;
  a negative payment receipt can therefore clear that legacy overdraw.
- Regeneration takes at most one sample per update and keeps extra time debt.
  Even an update of zero seconds may consume an existing sample. A spender gate
  controls definition-baseline regeneration, not invested regeneration bonuses.
- Modifier sources refresh when their effective count changes. Editing a borrowed
  definition while keeping the same count does not force a refresh.
- Innate/support taps share a `(charge,event,skill)` clock. Tree taps use the
  original serialized specification key; rank duplicates retain their original
  behavior. Only unused tree clocks are retired. Each movement tap reads the same
  walked distance. Channel taps use matching skill definition identity and the
  channel/guard mode; the original held flag is not an extra gate here.
- Gauge lockout consumes the beginning of a frame; regeneration sees only its
  remainder. Partial and overflow payment, cooldown shaving and over-cap signed
  gain receipts retain the original arithmetic.
- Optional charge costs bypass admission. A minimum can require a bank without
  consuming it. Numeric costs quote the smaller of held and requested charges;
  `all` quotes the whole bank. Damage scaling only applies to positive consumption.

These choices are compatibility decisions, not general recommendations for a new
game's time model. The frozen traces permit a later intentional policy revision
without disguising it as an optimization.

## Content and a standalone host

`npm run resources:build` produces a separately packable
`@hollow-wake/resource-content` directory. It contains 23 charge definitions,
56 original stat definitions, four gauges across 27 resource-bearing skills,
nine supports and 25 tree resource payloads. Every original skill/support/tree
cost is cross-checked against the frozen original resolver. Gauge definitions
also agree with an independently captured original gauge fixture.

`ResourceContent` detaches and deeply freezes input, checks references, schema,
finite numeric values, event names, positive meter intervals and authored rate
constraints, and indexes definitions and tree payloads. Schema version and
capability are explicit. Compiler output has a content hash; that hash is an
identity, not a runtime cryptographic verification mechanism. Event filters and
tree projections are data; they do not implement spatial tests or graph admission.

See [the shipped resource-cycle example](../examples/resource-cycle.mjs) for an explicit
game-owned actor using the package. A clean installed consumer executes wisp
regeneration, frenzy bonuses, bloodlust drain, a tree-fed life flask, charge
payment and partial gauge spending/lockout. It also checks all 240 original
payment states and separate actor ownership, with ambient randomness, network
and browser globals disabled. An independent TypeScript consumer checks exports.

There is no database query in the update path. An authoring database can feed the
compiler, while gameplay uses indexed resident data. This follows the established
[content/storage boundary](content-storage.md); database conversion alone is not
evidence of faster simulation. The content archive has a 48 KiB unpacked budget.
Resource code has a separate 40 KiB unminified JavaScript allowance; the existing
core remains bounded at 96 KiB. The combined optional-runtime bound is 372 KiB.

## Verification and remaining boundaries

`reference:resources` reproduces five accepted original captures: 321 bank
transitions, 299 timed-tap transitions, 2,808 gauge transitions and 32 edge cases,
54 full World transitions, and 240 payment states. World courses include real
movement, stasis/slow, proc consumption, credited kills and skill use. Normal tests
never overwrite those fixtures. Capture decisions retain the controlled attribute
qualification and fractional-bank findings.

`adapter:resource-source` tests guarded overlays for Actor, gauge and World with
LF/CRLF, collisions, conflicting bodies and preservation of unrelated reads.
All three files and the new bridge are preflighted before writes.
The Actor overlay retains the charge module's original initialization position:
its stat registration order is observable by earlier catalogue/grant consumers.
`adapter:resources` type-checks the game, launcher and capture helpers, compares
installed outputs to the original bytes, then injects five behavioral faults into
the installed package and restores every file. Unit mutation checks additionally
reject a zero-interval validation fault.

`node scripts/test-resource-ui.mjs --game <isolated-game> --dist <built-game>
--electron <electron-executable>` runs the mounted renderer through ordinary
player-intent polling. It checks empty-bank refusal, equipped regeneration, a
tree-fed flask, draining and a partial gauge press. The fixture supplies qualifying
attributes/mana and waits for the existing ultimate cinematic freeze to expire.
It seeds the gauge's already-credited feed total; headless World courses separately
verify real credited kills. Inventory support controls and boot smoke provide
renderer regression coverage. Profiles and saves are isolated.

`benchmark:resources -- --previous-adapter <retained-v0.17-game>` compares guarded
original, previous and current implementations. Its workloads are 64 actors with
six resource skills over 180 updates, and a real World with a resource loadout over
720 frames. Five warmups and 25 rotating samples compare full derived outputs.
Desktop CPU timing does not establish allocation, dense-combat frame budgets,
Steam Deck, older mobile, Unity, Godot or Unreal performance.

Three retained desktop runs put the resource-only batch approximately 8–12% above
v0.17 and 12–18% above the original. The real World median ranges from roughly 3%
below to 2% above v0.17, so no whole-world speedup is claimed. A generator-based
decay subset was rejected: it increased resource-batch overhead to about 38% over
v0.17 in its trial. The compatible extraction retains the simpler live-registry
scan. This is an explicit optimization target, not evidence of a completed
low-end hardware budget. The immutable standalone content avoids per-call registry
entry construction, but its target-device performance still needs measurement.

The original game's resource state is transient. This capability does not claim
a durable save/migration protocol. Version 0.19's optional
[resource event entry](resource-events.md) supplies equipped feed filtering,
explicit chance consumption and ordered charge/gauge awards. The host still
owns event occurrence, geometry and elite classification. Resource proc execution
and broader combat need further extraction. Native engine wrappers must run the
same behavior fixtures before claiming equivalent support.
