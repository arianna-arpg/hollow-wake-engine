# Verification and reproduction

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

## Cross-runtime numerical policy

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
