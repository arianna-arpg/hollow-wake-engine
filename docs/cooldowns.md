# Cooldown proc effects

This optional development slice extracts the cooldown proc's clock transition.
It retains the original content and synchronous behavior over host-owned state.
It is part of the v0.38 development candidate; it does not complete the SDK or
promote the restoration candidate's still-open performance acceptance.

```js
import {applyProcCooldown} from '@hollow-wake/engine/combat/cooldowns';
import {compileProcCooldownEffect} from '@hollow-wake/engine/combat/cooldown-content';

// Load once. The compiled record and its selector arrays are owned and frozen.
const effect = compileProcCooldownEffect({
  type: 'cooldown', seconds: 1, fraction: 0.25, tags: ['movement'],
});
const actor = {
  cooldowns: new Map([['dash', 8], ['unslotted', 4]]),
  skills: [{def: {id: 'dash', tags: ['movement']}}],
};
const changed = applyProcCooldown(actor, effect); // dash: 5; unslotted: 4
// The host now emits its normal gain cue if appropriate, then runs proc riders.
```

The shipped `examples/cooldowns.mjs` also demonstrates isolated simulations and
an explicitly selected unslotted clock. Native Maps implement the small
`CooldownClocks` interface; another synchronous iterable store can implement it
without importing a renderer or changing authored string IDs.

## Preserved rules and ownership

The operation snapshots all initial clock entries before writing. Each selected
entry computes `remaining - seconds - remaining * fraction`, in that order.
Reset takes precedence. Nonpositive results delete the clock; signed finite
amounts may extend it. Reassociating the arithmetic changes large-number results.

Skill IDs and tags intersect. An empty ID selector selects nothing. A tag selector,
even an empty one, requires the first matching action-bar instance. All selected
tags must be present in that instance's definition. Explicit IDs can match clocks
whose skills are no longer on the bar. The original source comment describes
that last case too narrowly; the accepted observations follow actual execution.

Selectors, the bar, trigger definition, destination store and its methods remain
live during the operation. A nested call cannot change the outer snapshot's
values. Newly inserted clocks are not visited by that outer call. A deleted
entry can be written again from the snapshot. Replacing the actor's map redirects
later writes; replacing a method preserves normal JavaScript receiver semantics.

The returned boolean means a selected entry *computed* a reduction, including
when a custom write method behaves differently. It is not a count or a measurement
of the final map. The function does not gate on death or emit cues itself. The
original host applies its death/announcement/cue rules after the map transition,
then runs riders. A thrown iterator, selector or write stops the operation;
earlier writes remain. A later cue/rider failure also retains earlier commits.

The host still owns proc admission and its internal cooldown, power resolution,
elapsed/tagged recovery, timeflow, skill cooldown stamping, the distinct
`reduceCooldowns` skill effect, casting, presentation and persistence. Ordinary
elapsed ticking uses live iteration in the game and must not be silently replaced
with this proc operation. The ten native frame courses deliberately exercise
those surrounding phases, including Time Dilation, as integration constraints.

## Content contract and cost

The compiler accepts only the `cooldown` discriminator, optional finite `seconds`
and `fraction`, optional `reset: true` and `exceptSelf: true`, and optional dense
string arrays `skills` and `tags`. Optional `undefined` fields are omitted.
Empty arrays, order, duplicates and negative zero retain their meaning.
Unsupported fields, false flags, accessors, sparse/custom arrays and nonfinite
numbers are rejected without invoking ordinary data accessors. Records may have
a null prototype. Proxies are not an isolation boundary for executing host code.

`COOLDOWN_CONTENT_LIMITS` exposes the serialized-input limits: 4,096 entries per
selector and 256 UTF-16 code units per nonempty identifier. IDs belong to the host;
loading content does not require a currently slotted skill or a global registry.
The low-level operation trusts its resolved inputs and does not validate per call.

The compiler is a separate optional import. A database can author or store these
records; load and compile them before simulation. The existing `content:procs`
exporter already contains all twelve effects in its `@hollow-wake/proc-content`
package. Select its cooldown definitions and compile their effect fields; no
duplicate catalogue or registry is introduced here. No database, network, ambient
clock, randomness or other runtime dependency is consulted by this operation.
The initial emitted modules occupy 1,484 bytes for execution and 3,612 bytes for
content loading, unminified, below the prospective combined 8 KiB package budget.
That size bound is not a throughput, allocation or hardware performance result.

The snapshot remains proportional to the number of running clocks, as in the
original game. Shared scratch buffers or cached maps/skill selections would break
nested/live behavior. A different owned-state layout needs its own explicit
contract, comparison and measurements before it can replace this path.

## Reproduction and evidence

`baseline/cooldowns/acceptance.json` accepts 75 original scenarios: 31 rule/failure
courses, 22 live-state courses, all 12 initialized authored effects, and ten native
World courses. Ten deliberate failures retain their exact preceding state. Each
original capture ran twice with identical bytes and passed the game type check.
Four typed original-source negative controls reject superficially simpler loops,
empty-tag handling, lookup order and arithmetic. Discovery-phase wording in raw
fixtures is retained unchanged; the acceptance record records their promotion.

The focused SDK suite has 73 tests, including original-state comparisons and
content ownership/validation. Twenty-two runtime/content mutations must fail
their named tests. The packed consumer checks real export/type resolution,
synchronous mutation types and isolation with ambient host services disabled.

```sh
npm run verify
npm run reference:verify
npm run reference:cooldowns
npm run adapter:prepare
npm run adapter:cooldowns
npm run adapter:cooldowns-faults
```

Adapter preparation checks 60 source faults across LF/CRLF and rejects reapplying
the transform. It replaces only the cooldown proc branch and adds one import;
the other 21 branches, method prelude/tail and other class members are preserved.
The installed comparison replays all 75 original scenarios through the actual
packed SDK. Fourteen additional faults target that installed module and the
call/cue/rider boundary on disposable copies, leaving the supplied game untouched.
These checks join CI and retain their comparison records and failure logs.

The previously accepted 201 runtime outputs are preserved byte-for-byte; the two
optional modules add six emitted files. Device measurements, full native-host
exposure and the remaining cooldown lifecycle extraction remain open. Existing
Godot/Steam Runtime evidence covers its documented selected session surface,
not automatic exposure of this module.

## Renderer integration

Twenty-one actual game renderer stages match the native cooldown implementation.
Two independent native runs established the expected observations before the SDK
renderer was built. The comparison covers actual hotbar shade geometry against
the original stamped total, reset readiness, filtered and unslotted changes,
clamping after signed extensions, silent effects, cue glyphs and expiry.
Time Dilation and Quickstep run through native player-intent polling. Controlled
resolved attack contacts earn Stalwart Rhythm and exercise its internal cooldown.

Full-world pause holds both skill clocks and cues. At half speed, eight 25 ms
frames advance skill clocks by 0.1 seconds while cues age by 0.2 seconds. The first
discovery incorrectly expected cue ageing during full pause; its failed capture
and harness are retained. No original behavior or accepted rule fixture changed.

The runner checks the source, installed SDK, complete built bundle and frozen
expectations before and after execution. Three disposable built-game faults
must be rejected: omitted SDK fraction arithmetic, altered cooldown-shade style and
halved cue opacity. Supplied game, package and bundle files remain unchanged.

```sh
node scripts/test-cooldown-ui.mjs --game <isolated-full-game> --dist <built-game> --electron <electron-executable>
node scripts/test-cooldown-ui-controls.mjs --game <isolated-full-game> --dist <built-game> --electron <electron-executable>
```

`baseline/cooldowns/renderer-acceptance.json` records the original observations
and scope; `evidence/cooldowns/renderer.json` records the installed comparison.
Canvas calls and state traces are compared as complete recorded JSON bytes;
screenshots are separate inspection evidence. These software-rendered desktop
checks do not establish physical input, cross-platform pixel equality, GPU/FPS
performance or Steam Deck/mobile acceptance.
