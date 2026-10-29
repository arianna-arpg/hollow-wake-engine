# Actor status lifecycle

`@hollow-wake/engine/statuses` exposes `createStatusLifecycle` and pure bank,
baseline-damage, rupture-radius and ailment-chance helpers. The optional service
owns application, immunity and relay admission, stacking, buildup conversion,
strongest refresh, banking, pop debt, fixed fuses, modifier publication, ticking,
expiry, cleansing, silent removal, flight derivation and status queries.

Construct a service per simulation with explicit definition lookup, randomness,
skill context and pop-presentation callbacks. Operations borrow actor records and
return synchronously. The host implements the structural `StatusActor` contract;
it can retain additional fields on actors, definitions and status instances.
No engine objects, runtime dependencies, ambient random, clock, shared content
registry or shared scratch buffer are required. The root entry does not import
this capability. It is not yet a complete standalone actor or native command API.

## Ownership

The service binds its callbacks and copies/freezes relay IDs at construction.
Definitions, stat reads, status arrays and callback effects stay live. Ordinary
modifier arrays and fickle-window tuples retain their identities. The host owns
the definition lifecycle and must pass trusted valid definitions, compatible
actor records, finite frame durations and random draws in `[0,1)`. These types
are integration contracts, not a parser for saves or untrusted content.

`applyStatus` deliberately calls the actor's virtual `isWet` and, for buildup,
its virtual `applyStatus`. An adapter must delegate these methods to this service
while retaining any intended host overrides. Reentry is supported. Exceptions
preserve preceding writes; there is no automatic transaction or rollback.

The original ailment tuning is supplied as deeply frozen defaults. A caller may
pass a separate tuning record to `tuneAilmentChance`. The game adapter passes its
live original `AILMENT_TUNING`, preserving legacy retuning. Wet status IDs retain
the three original rules: wading, swimming and soaked; virtual wetness can extend
them. Rendering, spatial effects, death propagation, brood spawning, bank
discharge and source attribution beyond the recorded payload stay host-owned.
Importing all 152 definitions does not establish execution of every World effect.

## Ordering that matters

- Hostile immunity precedes relay and crowd-control admission. Forbidden raw
  casting tags clear the cast before duration and modifier publication.
- Independent source and challenge-field lanes create separate instances, but
  the original `status:<id>` modifier source remains shared. It is removed when
  the final matching status leaves. Strongest power and stack power combine in
  their original order.
- Authored banks use the strongest application as their capacity ruler. Fixed
  fuses retain their timer, including a zero rupture value until the original
  accumulation rule clears it. Buildup can remove a record before later payload
  writes are applied to that same retained object.
- Status clocks decrement before damage curves are evaluated. An expiring
  effect still pays the entire frame's damage. Chrono statuses use the raw clock
  for remaining duration and simulation time for damage.
- Ticking iterates the live array in reverse. Callback changes to leech, pop
  debt, definitions or the status array affect subsequent work immediately.
  Pop presentation occurs before the damage-type lookup for that pop.
- Chrono-only expiry neither pays damage nor recalculates flight. Ordinary
  ticking derives flight after expiry. Explicit removal and cleanse do not add
  expiry payloads. Fractional cleanse counts preserve the original comparison.

The adapter replaces the earlier burning-only bridge with the complete policy.
Its source guards explicitly recognize the original and reviewed predecessor
forms; the old two-function burning import is removed. Actor tag queries now
delegate to status policy; the separately exported skill-admission compatibility
API remains available. Original status definitions and generated stat-registration
side effects stay in place.

## Reproduction and limits

Before implementation, two original-game runs and the prior installed adapter
produced identical 217-course traces covering every authored status. A synthetic
taper definition is labeled separately because the pinned content contains no
authored taper. The fixture records state and retained object identity, queries,
modifiers, random draws, callbacks, presentation events and three deliberate
partial failures. Routine verification never regenerates this fixture.

```sh
npm run verify
npm run reference:statuses
node scripts/test-status-overlay.mjs
npm run adapter:prepare
npm run adapter:statuses
node scripts/test-game-status-faults.mjs --location .artifacts/adapter-location.json
```

Independent arithmetic/order tests, deliberate runtime mutations, installed
mutations, declaration consumption and a browser build exercise the public API.
The module has a separate 16 KiB unminified JavaScript growth limit, preserving
all predecessor limits. Size is not a speed or allocation result. No Steam Deck,
mobile, complete native-package or whole-game performance claim follows.

See [checkpoint evidence](../evidence/status-lifecycle/windows.json) for the
completed checks and raw records. Remaining system families stay tracked in
`completion.json`.

The broader `probe_afflictioncues.ts` has an existing failing expectation:
`terrain statuses stay quiet`. The pinned original, prior adapter and this
adapter each pass the same 53 preceding checks and fail at that assertion.
This checkpoint preserves those observations. It does not claim the complete
affliction rendering suite passes; its remaining checks and visual acceptance
are still open.
