# Verification and reproduction

Version 0.31 adds `reference:banks`, `adapter:banks-source`, `adapter:banks`
and `benchmark:banks -- --previous-adapter <retained-v0.30-game>`.
The immutable original baseline was committed before implementation: 57 courses
and 292 transitions, reproduced twice from the frozen original and byte-equal
to retained v0.30. The separate `gauge-namespace-refresh/v1` decision specifies
six diagnostic corrections without replacing those original fixtures.
The installed comparison checks exact bytes for banks and applies only that
independent decision to gauge expectations; sixteen deliberate faults exercise
the installed runtime and host bindings. Thirty-three focused tests cover the
new host boundaries, including failures, isolation, detached identity and cache
refill after emptying. The source overlay guards all inputs before writing and
preserves unrelated members and condition policy in both newline styles.
The packed bank/gauge consumer demonstrates the separate sampling and decay
phases with stat values `[2, 5, 5, 1]`. Separate 3 KiB/5 KiB allowances increase
the combined package bound from 448 to 456 KiB; prior module/core bounds remain
fixed. See [banks](channel-banks.md) and [gauges](actor-gauges.md) for contracts.
The compact implementation passes the full verifier's 416 tests, 138 deliberate
faults and 23 packed consumers. Its installed comparison detects all sixteen
new faults; all 159 predecessor runtime files are unchanged. The new entries
are 2,575 and 4,262 bytes of unminified JavaScript. The
[implementation evidence](../evidence/milestone-thirty-six/runtime-verification.json)
records those checks and the separate repeated CPU/retained-heap decision.
Broader game, renderer, managed and hosted acceptance is recorded separately;
these checks alone do not complete any additional system family.

Version 0.30 adds `reference:continuation`, `adapter:continuation-source`,
`adapter:continuation` and `benchmark:continuation -- --previous-adapter <retained-v0.29-game>`.
The original baseline was committed before implementation: 60 courses and 269
transitions, reproduced twice from the frozen original and byte-equal to retained
v0.29. The new installed comparison matches all observations and detects twelve
behavioral faults. Thirty-two independent tests cover ordering, authority, aim
identity, failures and isolation; a packed 3D consumer runs request through delivery.
The full verifier passes 383 tests, 138 runtime faults and 22 packed consumers.
The new module is 7,857 bytes within a separate 10 KiB allowance. The combined
448 KiB bound is unchanged; all 156 predecessor runtime files remain unchanged.
See [the continuation contract](casting-continuation.md) for host obligations.
The [implementation evidence](../evidence/milestone-thirty-five/runtime-verification.json)
includes the direct four-way benchmark, its initial-control reproduction patch,
the measured ongoing-update improvement and the small complete-cycle tradeoff.
The [M35 acceptance](../evidence/milestone-thirty-five/verification.json) records
15 installed comparisons with 83 detected faults, 19 candidate native probes and
11 renderer checks. Six request-stage outcomes match retained v0.29 byte-for-byte.
Managed continuation and dispatch comparisons, game/launcher/sim types and smoke
passed while preserving all unrelated files and four pre-existing bounty methods.
All final runtime files match the optimized verifier and benchmark candidate.
The final documentation archive has separate clean-consumer evidence. Eleven of
thirteen families remain partial; native-engine and target-device acceptance
remain outstanding.

Version 0.29 adds `reference:dispatch`, `adapter:dispatch-source`,
`adapter:dispatch` and `benchmark:dispatch -- --previous-adapter <retained-v0.28-game>`.
The unchanged original baseline contains 88 courses and 104 transitions accepted
before implementation. The installed dispatch comparison is byte-exact and detects
ten deliberate faults. The SDK verifier passes 351 tests, 138 faults and 21 packed
consumers. Dispatch has a separate 24 KiB JavaScript allowance within the 448 KiB
combined bound; its implementation is 18,619 bytes. The 153 predecessor runtime
files remain unchanged. See [the dispatch contract](skill-dispatch.md) for ordering,
host obligations and the separately documented scramble failure-recovery change.
Two controlled desktop runs retain equal gameplay receipts but reverse all four
timing directions; no repeatable speed change or device acceptance is claimed.

The [M34 acceptance](../evidence/milestone-thirty-four/verification.json) records
14 installed comparisons with 71 detected faults, 19 candidate native probes and
11 renderer checks. Six request-stage outcomes match retained v0.28 byte-for-byte.
Managed dispatch and preflight comparisons, all game types and smoke passed while
preserving unrelated files and four pre-existing bounty methods. Only declaration
parameter names changed after the broad installed/benchmark checks; all executable
and source-map bytes stayed identical. Final types and consumers were rechecked.
The final documentation archive has separate clean-consumer evidence. Eleven of
thirteen tracked families remain partial.

Version 0.28 adds `reference:request`, `adapter:request-source`, `adapter:request`
and `benchmark:request -- --previous-adapter <retained-v0.27.1-game>`. The original
baseline contains 68 courses and 71 transitions accepted before implementation.
The installed request comparison is byte-exact, with seven deliberate faults.
The SDK verifier passes 314 tests, 126 faults and 20 packed consumers. Request
preflight has an 8 KiB JavaScript allowance inside the retained 424 KiB combined
bound; its runtime is 5,191 bytes. See [the request contract](skill-request.md).

The [M33 acceptance](../evidence/milestone-thirty-three/verification.json) also
records 13 installed suites with 61 detected faults, 19 candidate native game
probes, 11 renderer checks, and managed-game types and smoke. All 153 runtime
files match the tested installation; the 150 predecessor files are unchanged.
The final archive is checked separately after documentation, with clean general
and request consumers. Two controlled request benchmarks retain exact gameplay
receipts and report the early-refusal/toggle overhead as well as cast-start gains.
Eleven of thirteen tracked families remain partial; these checks do not establish
full-runtime native engine packages or hardware acceptance.

`scripts/test-skill-request-ui.mjs --game <game> --dist <build> --electron <exe>`
runs six mounted player-intent stages for trigger/replenishment toggles and seal
priority. The harness explicitly seeds skill level, support and account awakening
eligibility, then uses native learning, tree purchasing and request dispatch.
It does not establish physical input or device acceptance. Use the existing
isolated UI builder before running it against a new installation.

Version 0.26 adds `reference:admission`, `adapter:admission-source`,
`adapter:admission` and `benchmark:admission`. Its optional entry has a 12 KiB
JavaScript allowance; the combined bound is 412 KiB, retaining all earlier
module/core limits. See [skill-admission.md](skill-admission.md) for live state,
lazy bank mutation and the distinction between actor queries and host authority.

Version 0.27.1 adds `benchmark:support-admission` and an empty-observation fault.
The complete verifier passes 294 tests, 115 faults and 19 packed consumers.
The support consumer additionally checks empty admission and live graft changes.
See [support admission cost](support-admission-cost.md) for measured tradeoffs.

## Normal package checks

CI uses explicit Ubuntu 24.04/Windows 2025 labels and immutable revisions of the
official checkout, Node, .NET and artifact actions. They use the supported Node 24
action runtime; the SDK remains tested on Node 22 and 24. Checkout credentials are
not retained for test commands. Hosted image patches and toolchain patch releases
still vary: receipts record the actual versions. This is not a bit-reproducible OS image.

```sh
npm ci
npm run verify
npm run example
npm run example:lifecycle
```

Verification builds the strict, host-independent TypeScript package, runs behavior
tests, checks production imports and host-API use, tests deliberate faults in
temporary copies, packs the package, and installs it into an isolated temporary
consumer. The consumer disables browser globals, network calls and `Math.random`.

The package archive includes runtime output, selected content, license and
documentation. It excludes baseline evidence, the original game and development
dependencies. Current gates cap unminified runtime JS at 96 KiB and selected
content JSON at 64 KiB. Version 0.4 keeps the 96 KiB core gate and adds a separate
64 KiB optional item-module gate (160 KiB combined). The item catalogue is a separate
data package. These are scoped bounds, not promises about a full engine.
Version 0.6 adds a separate 32 KiB optional passive JS gate (192 KiB combined)
and a 1 MiB unpacked bound for its separate content package. It preserves the
existing core, item and selected-content bounds.
Version 0.7 includes grant execution within that same 32 KiB bound and adds a
separate 1 MiB grant-data package bound. These bound package size, not live memory.
Version 0.9 adds a 16 KiB optional live-inventory module bound while retaining the
192 KiB combined runtime bound. It does not increase the total package budget.
Version 0.10 adds a 16 KiB optional storage-policy bound within that same combined
192 KiB runtime bound.
Version 0.11 adds a 32 KiB optional container/seat-rule allowance and raises the
combined bound to 224 KiB for that new capability; earlier core/module limits
stay unchanged. Its separate container content package has a 64 KiB unpacked
bound. Both immutable content and live rule ports use the same tested arithmetic.
Version 0.12 adds a 16 KiB optional relic-custody bound within the same 224 KiB
combined allowance. Container content 0.2 retains its 64 KiB bound and adds
explicit progression/storage tuning consumed by the same offline consumer.
Version 0.13 adds a 16 KiB optional action-module bound within that same 224 KiB
combined allowance. No earlier module allowance increases.

## Reconstructing the original

```sh
npm run reference:prepare -- /path/to/arpg-game-world
npm run reference:install
npm run reference:verify
```

Without a source checkout argument, preparation verifies and unpacks the tracked
`baseline/source.tar.gz`, applies the tracked byte overlays, and verifies every
source hash. This capsule is necessary because the captured local commit was not
available from upstream when checked. Reconstruction requires no network or
original checkout. Development dependency installation still requires an npm
cache or network. Existing `.reference` files are verified before reuse.
The original source checkout is only read.

The original lockfile cannot pass a clean `npm ci`: optional Windows-signing
dependencies are absent. Its exact bytes remain preserved. `reference:install`
instead installs a separate locked development-tool environment containing the
original exact TypeScript, tsx, Node types, Electron types and Vite versions.
The installer checks those versions against the original lock and links only
the new reference's `node_modules`. Electron's binary/install scripts and release
packaging tools are unnecessary for these type checks and headless simulations.
This is not a reproduction of the game's release build.

Reference verification copies the independent exporter into the reference's
`balance` directory, runs it using the reference's `tsx` development tool,
and compares generated results with accepted JSON. Expected calculations come
from the original game; the exporter never imports this SDK.

`--export-only` writes unaccepted results under `.artifacts/reference` for review.
`--initial-capture` refuses to overwrite existing accepted fixtures.
Normal CI and tests never regenerate accepted expected values.

To rerun the game baseline itself, execute `npm run check` and
`npm run sim -- run --suite smoke` inside `.reference`. The original game's full
browser boot and Inventory UI have not been migrated or claimed by this milestone.

## Evidence files

| File | Meaning |
| --- | --- |
| `baseline/source-lock.json` | Commit, overlay and exact source hashes |
| `baseline/dependency-inventory.json` | Static import evidence and boundary paths |
| `baseline/authored-selection.json` | Full raw selected content, including fields outside current capability |
| `baseline/stat-catalogue.json` | Full original exported stat registry |
| `baseline/first-path.json` | Original build, preview/cost and ordinary contact observations |
| `baseline/arithmetic-contacts.json` | Original mixed numeric/contact observations |
| `baseline/stat-transitions.json` | Original source/condition/gauge transition observations |
| `evidence/` | Recorded milestone receipts and performance samples |

`scripts/analyze-reference.mjs` can regenerate the dependency inventory from the
hash-verified reference. Static reachability is not a list of everything to extract:
runtime callbacks, mutations and initialization order require behavioral tracing.

Negative controls alter the damage multiplier formula and omit cache invalidation
in temporary built copies. The same behavioral tests must reject both with
assertion failures. Syntax/import failures do not count as successful detection.

Milestone two adds `reference:lifecycle`, a real installed-package game adapter,
two more behavioral mutants and one actual-game wiring mutant. See
[milestone-two.md](milestone-two.md) for the clean reconstruction sequence.
The adapter check also compares every installed runtime/declaration file with
the current build, so testing a stale packed version cannot pass unnoticed.

Milestone three adds `reference:inventory`: 3000 original inventory transitions
and a full export of 20 authored registries. The accepted catalogue uses lossless
gzip storage. `verify` now checks inventory contracts, both packed packages,
SQLite roundtrips, two inventory fault injections and completion-evidence paths.
SQLite is development tooling only; use a current Node 22 or Node 24 toolchain
with `node:sqlite`. It is not imported by the SDK runtime.
`benchmark:inventory` compares actual original queries to the cell index;
`benchmark:catalogue` compares retained JSON records to SQLite point reads.
See [content-storage.md](content-storage.md) for workload/residency limitations.

Milestone four adds `reference:items`, `items:build`, `benchmark:items` and the
offline item-to-inventory-to-equipment-to-hit consumer. Item fixtures are compressed
losslessly and independently re-exported. Two more deliberate faults test local
item math and affix source order. The optional import graph is checked explicitly.

Version 0.5 adds host-owned item ports and actual-game item delegation. The extra
`reference:item-bridge` and `adapter:items` commands cover shared RNG/uid interleaving,
legacy save migration, explicit content refresh and a compiler wiring fault in the
installed package. CI reconstructs the game and runs its item/relic regression
probes. The captured Escape-path failure remains recorded in [item-adapter.md](item-adapter.md).
Its explicit repair, revised NPC/player-close assertion and failing original-order
control are documented in [inventory-ui-adapter.md](inventory-ui-adapter.md).

Version 0.6 adds `reference:passives`, `passives:build` and `benchmark:passives`.
The original World policy observations, independent graph/economy checks, two
additional behavioral mutants and packed engine/content consumer are described in
[passive-policy.md](passive-policy.md). Grant execution and game delegation remain
explicitly outside this milestone's proof.

Version 0.7 adds `reference:passive-grants`, `passives:grants`,
`adapter:grant-source`, `adapter:passive-grants` and `benchmark:passive-grants`.
It checks 4,103 original character rebuilds, 162,246 numeric queries, eight live
content revisions, two additional behavioral faults, an installed-game wiring
fault and an offline policy-to-grants-to-statistics consumer. See
[passive-grants.md](passive-grants.md) for renderer checks and retained host duties.

Version 0.8 adds `reference:policy-host`, `adapter:policy-source`, `adapter:policy`
and `benchmark:policy-host`. The actual game policy path matches 9,699 commands
and 42 complete host transitions, including intermediate callbacks and live
summon stats. Two further runtime faults and an installed point-debit fault must
be rejected. The packed consumer checks both state-ownership modes. The renderer
runner accepts `--policy` for mounted-editor link/deletion coverage. See
[passive-policy-host.md](passive-policy-host.md). Installed-package fault checks
must run sequentially with other consumers of that installation.

Version 0.9 adds `reference:inventory-host`, `adapter:inventory-source`,
`adapter:inventory-host` and `benchmark:inventory-host`: 1400 original cases,
three live footprint revisions, 19 complete World states and the existing 3000
inventory transitions. Two more runtime mutants and an installed occupancy fault
must be rejected. The game renderer runner accepts `--host --tabs` to include
mounted inventory/container previews and the original tab course. See
[inventory-host.md](inventory-host.md) for the capture correction, ownership
contract, measured small-workload regressions and verification limits.

Version 0.10 adds `reference:stash`, `adapter:stash-source`, `adapter:stash` and
`benchmark:stash`. It checks 400 original repairs, 3000 storage commands, 18
legacy-shape/repeated-UID cases, complete game transfers, two additional mutants
and an installed planner fault. `test-game-item-ui.mjs --storage-only` runs the
Oracle course with its documented navigation revision, including page purchase,
drag, reload and death persistence. The revised course passes on both M11 and
M12; `--baseline-storage-ui` retains the original failing course for comparison.
See [stash-policy.md](stash-policy.md) for host responsibilities, strict boundaries,
address ownership and the measured gains and regressions.

Version 0.11 adds `reference:containers`, `containers:build`,
`adapter:container-source`, `adapter:containers` and `benchmark:containers`.
It checks 81 ladders, 1006 unlock combinations, 2000 landings, 600 neighborhoods,
2816 power cases, 12 World transitions and 16 live content revisions. Two further
behavioral mutants and an installed first-unlock fault must be rejected. A sixth
packed consumer connects item generation, container seating and stat contributions.
See [container-policy.md](container-policy.md) for state ownership, explicit
boundary decisions, measurements and the remaining host responsibilities.

Version 0.12 adds `reference:relics`, `adapter:relic-source`, `adapter:relics` and
`benchmark:relics`. It checks 240 restores, 600 investments, 2520 custody
transitions and 160 experience folds, two further runtime faults, and an installed
tombstone fault. The container consumer now includes canonical ownership, bounded
investment, save restoration, death and stale-save replay. See
[relic-custody.md](relic-custody.md) for host obligations and measured regressions.

Version 0.13 adds `reference:relic-actions`, `adapter:relic-actions-source`,
`adapter:relic-actions` and `benchmark:relic-actions`. It checks 2,048 original
access queries and 264 full World action transitions with callback order, two
further runtime faults and an installed authority fault. The offline container
consumer now completes authorized custody transfers. See [relic-actions.md](relic-actions.md)
for host completion ordering, the reusable binding measurement and remaining scope.

Version 0.14 adds `reference:equipment-actions`, `adapter:equipment-source`,
`adapter:equipment-actions` and `benchmark:equipment-actions`: 824 complete original
World transitions, live authored slot edits, callback and ground-delivery ordering,
two further runtime faults and an installed equipment-level fault. The offline
item consumer now applies the separately packaged slot policy before character
modifiers. See [equipment-actions.md](equipment-actions.md) for trusted-state
requirements, refusal ordering, the strict recovery boundary and measured regressions.

Version 0.14.1 adds `benchmark:rebuild` and independent shared-copy contracts. The
full verifier now has 140 tests and 28 behavioral fault controls. No accepted
original fixture changes. See [rebuild-optimization.md](rebuild-optimization.md)
for the rotating three-implementation workload and preserved construction semantics.

Version 0.15 adds `reference:progression`, `progression:build`,
`adapter:progression-source`, `adapter:progression` and `benchmark:progression`.
It checks 4,096 original curve levels, 744 XP transitions, all 39 classes,
ordered callbacks, party/possession/downed behavior and seven live content revisions.
The full verifier now contains 145 tests, 30 behavioral fault controls and seven
isolated packed consumers. The new consumer earns and spends points for every class.
The installed adapter must reject an omitted point-credit fault. A guarded overlay
preflights both source files before changing either and preserves unrelated work.

Run `node scripts/test-progression-ui.mjs --game <isolated-game> --dist <built-game>
--electron <electron-executable>` for XP-earned points through real tree choice,
stat rebuild, Font refund and reselection controls, with isolated profiles/saves.
The new optional module has a 12 KiB allowance and raises the combined bound from
240 to 252 KiB; no earlier individual limit increases. Its separate content bound
is 128 KiB. See [character-progression.md](character-progression.md) for host
obligations, operation limits and measured gains/regressions.

Version 0.16 adds `reference:skills`, `skills:build`, `adapter:skills-source`,
`adapter:skills` and `benchmark:skills`. The original fixture contains 2,376 purchase
sequences, 6,336 restorations, 5,148 resolver states and 4,461 World transitions.
Four new faults cover budgets, aura ranks, paid levels and donor ranks, both at
runtime-test and installed-game boundaries. A standalone content consumer and
mounted Inventory/Font course cover complete use paths. See
[skill-progression.md](skill-progression.md) for reproduction, strict input decisions,
borrowed references, complete workload timings and remaining execution scope.

Version 0.16.1 adds seven attribute-rebuild contracts and a duplicate-base-read
fault. All 99 compiled runtime files remain unchanged from v0.16.0. The rejected
optimization candidates and complete comparisons are documented in
[rebuild-vectors.md](rebuild-vectors.md). `benchmark:rebuild-vectors` compares the
original game, retained v0.16 and an isolated candidate with guarded source controls.
The full verifier contains 168 tests, 35 behavioral faults and eight packed consumers.

Version 0.17 adds `reference:supports`, `supports:build`, `adapter:support-source`,
`adapter:supports` and `benchmark:supports`. Four original-only captures preserve
435,978 compatibility pairs, 954 numeric resolver states, 301 changed compositions
and 35 World transitions. Five runtime faults and five installed-game faults cover
tag closure, levels, scaling, custody and crew updates. See
[support-rules.md](support-rules.md) for the separate content consumer, mounted
Inventory course, callback/ownership contract and unextracted effect execution.

Version 0.18 adds `reference:resources`, `resources:build`,
`adapter:resource-source`, `adapter:resources` and `benchmark:resources`. Five
original-only fixtures cover charge banks, all authored timed taps, skill gauges,
real World resource courses and every authored payment row. Six new SDK faults
and five installed-game faults must be detected by behavioral assertions or
trace differences. The separate resource pack is exercised by a clean offline
consumer and a strict TypeScript consumer. See [resource-runtime.md](resource-runtime.md)
for state ownership, phase ordering, bounded meter work and explicit host duties.

Version 0.19 adds `reference:resource-events`, `adapter:resource-events-source`,
`adapter:resource-events` and the shipped event example's package check. Original
filter observations include explicit random draw sequences, and installed faults
must alter behavior. The renderer course uses ordinary player-intent polling to
kill controlled monsters with actual projectiles, fund a partial gauge press and
check lockout. See [resource-events.md](resource-events.md) for scope and timing.

Version 0.20's charged casting checks compare original press/update/payment and
payload traces, then verify the installed game's delegation. A packed consumer
executes the shipped two-actor example through `casting/charged`. Its authority
and timing limits are documented in [charged-casting.md](charged-casting.md).

Version 0.22 adds `reference:ammunition`, `adapter:ammunition-source`,
`adapter:ammunition` and `benchmark:ammunition`. Its original fixture contains
46 courses, 223 transitions and all nine native banks plus three support grafts.
The complete verifier has 236 tests, 75 behavioral faults and 14 packed consumers.
The installed game must detect five ammunition faults; renderer acceptance earns
round spending and reloads through ordinary input. See [ammunition.md](ammunition.md)
for ownership, lazy admission, fractional legacy banks and bounded work.

The skill-admission baseline adds `reference:admission`: 126 actor courses
and 11 native World courses, 243 observations in total. Accepted outputs match
two original runs and the retained v0.25 installation byte-for-byte. The runner
reproduces them without replacing fixtures. Version 0.26 adds
`adapter:admission-source`, `adapter:admission` and `benchmark:admission`.
Its installed comparison retains state/results and meaningful host call ordering,
with explicitly instrumented forwarding-trace projection. Thirteen independent
policy tests, two comparison tests, six runtime faults, six installed faults and
a clean packed consumer cover this extraction. The complete SDK verifier passes
273 tests, 103 runtime faults and 18 packed consumers. Local acceptance also covers
the managed game, seven prior casting/payment comparisons, seven native probes,
simulation smoke and seven renderer/boot regressions. Exact-commit CI is recorded
separately. See [skill-admission.md](skill-admission.md) and the
[original boundary](skill-admission-boundary.md).

Version 0.27 adds `reference:intent`, `adapter:intent-source`, `adapter:intent`
and `benchmark:intent`. Three original-only fixtures contain 278 observations
of queries, seals, temporary-instance ownership and actual request dispatch.
Sixteen independent policy tests, four comparison tests, eleven runtime faults,
six installed faults and a nineteenth packed consumer cover the new boundary.
The complete verifier passes 293 tests, 114 runtime faults and 19 packed consumers.
Identity and request observations compare byte-for-byte; only explicitly named
original diagnostic query forwarders are projected. Earlier admission queries
receive the same narrowly scoped treatment while their actual request checks
remain intact. See [skill-intent.md](skill-intent.md) for ownership, lazy query
behavior, reproduction commands and retained host responsibilities.

The renderer course is `scripts/test-skill-intent-ui.mjs --game <game> --dist
<build> --electron <executable>`. Its normal player-input polling must earn combo
steps, selected mimic casting, reload and seal refusal. Explicit bank seeding
does not claim to reproduce earning a mimic capture. Target-device validation
remains separate.

## Cross-runtime numerical policy

Version 0.25 adds `reference:resource-payment`,
`adapter:payment-source`, `adapter:resource-payment` and
`benchmark:resource-payment`. The accepted original fixtures contain 47 courses
and 216 transitions across Actor arithmetic/timers and native World loan use.
Six SDK tests include independent arithmetic, invalid arguments and nested blood
observers. Six runtime faults and six installed-game faults cover reservations,
whole-price borrowing, shield spending, deadline inclusion and blood observers.
The source overlay guards the full regeneration phase and retires the exact
earlier ordinary-payment shortcut. A clean packed consumer uses the shipped
two-actor payment example. See [resource-payment.md](resource-payment.md) for
phase placement, unchecked-payment behavior and remaining host responsibilities.

`npm run native:verify` builds the experimental C ABI with the local C toolchain
and runs C, C++ and .NET 8 consumers. It requires tools beyond the JavaScript-only
`verify` command and has separate Windows/Linux CI jobs. `npm run native:pack`
then validates a standalone extracted archive in clean C++ and C# consumers.
See [native-lifecycle.md](native-lifecycle.md) for scope, allocation measurement,
original traces, strict arithmetic, invalid-buffer obligations and negative controls.

The current contract uses binary64 arithmetic, relative/absolute comparison
tolerance `1e-12`, and exact discrete results and random consumption. This is not a
claim of cross-platform lockstep determinism. Native bridges must run the same
fixtures and report differences before adopting a different numerical policy.
