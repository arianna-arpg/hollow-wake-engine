# Verification and reproduction

The internal complete-character integration has maintained checks for save
admission, inventory preparation, bare-gem delivery, scene lifetimes and typed
host ports. Run `npm run test:character-world` after building. Its focused checks
complement `test/complete-inventory.test.mjs`, which runs in the normal unit suite.
The installed character-build course also covers explicit learned replacements
and support compatibility with rolled choices. The maintained 343-group
integration course and eleven original-only fixture generators now run through
`test:character-composition` and `reference:character-composition`. Passive
action ordering and Godot bundle checks are also maintained. See
[composition qualification](character-composition-qualification.md) and
[the integration boundary](character-world-integration.md) for their limits.

Historical Unity evidence uses source and compiled output from the same immutable
release. `scripts/evidence-source.mjs` rebuilds historical TypeScript in memory
with its recorded compiler version and checks the original accepted hashes.
It does not read today's `src` or `dist` for that rebuild, create a worktree, or
install another dependency tree. The Unity archive workflow runs the compiler
and isolation checks after fetching the required release commit.

The shared crafting implementation retains the public constructor and v1–v4
save formats. `test:crafting-session-package` runs 22 installed/browser checks
and positive/negative public type checks. `test:crafting-session-faults` checks
16 deliberate faults against a temporary installed package, restores it, and
removes that installation. `reference:crafting-session-formats` reproduces four
frozen saves from the retained pre-refactor SDK implementation in two fresh
processes. These checks preserve the crafting API; they do not publish the
separate complete-character/world-delivery candidate or qualify new devices.

The [durable character builder](character-builds.md) has 25 installed and
browser contracts, thirteen negative type cases and seventeen deliberate runtime faults.
Its installed Node GC course releases preceding skill investment while the
current build remains usable after both cold opening and trusted adoption, with
a deliberate retention fault and restored controls. `reference:character-builds`
reproduces 98 original-only observations across three courses in fresh processes.
`test:character-builds-package` checks the separate default-content factory,
installed original-game comparisons, eighteen adoption checks around actual
running casts, and restored controls.
Both commands are included in their respective full verification suites.

The [challenge targeting comparison](challenge-targeting-performance.md) adds
eighteen installed/browser targeting cases and five deliberate faults. The
non-timed `test:challenge-targeting` command compares seven public update courses
against the retained published predecessor, checking every one of 120 frames per
course. It runs in `verify` and the dedicated Windows/Linux workflow. Original-game
fixtures remain unchanged. Timings are a separate `benchmark:challenge-targeting` run.

The optional [challenge continuation](challenge-continuation.md) adds 31
installed/browser-bundle contracts, eight negative type cases and twelve package
faults. `reference:challenge-continuation` reproduces thirteen frozen original
observations. `adapter:challenge-continuation` adds five private scenarios, thirty
stages and six integration faults. `adapter:challenges-composed` includes these
cases in the complete game assembly and retains the paired 25-episode comparison.

The optional [challenge controller](challenges.md) adds twenty installed/browser
contracts, eight negative type cases and sixteen deliberate package faults.
`reference:challenges` repeats 61 accepted original checkpoints in fresh processes;
`adapter:challenges` repeats them through an installed archive and requires six
source-admission guards, six runtime/adapter faults and a restored control.
The package and reference commands include these checks. The dedicated
Windows/Linux workflow also runs the composed game comparison.

The optional [sequence continuation](sequence-continuation.md) adds 26 contracts,
nine negative type cases and ten deliberate package faults. Its four frozen original
courses reproduce 28 observations. Installed game checks add twelve private contexts,
seventy stages and 22 integration faults. The complete adapter compares 25 paired
episodes against a frozen predecessor controller. Run `test:sequence-continuation-package`,
`reference:sequence-continuation`, `adapter:sequence-continuation` and
`adapter:sequence-continuation-composed` in that order. Package and reference/installed
checks are included in the full verification commands; the dedicated Windows/Linux
workflow also runs the composed comparison. `reference:verify` creates its own
package verification receipt before the installed continuation check. It does not
depend on a prior `verify` run or files produced by a different CI job.

The [guard disciplines](guard-arts.md) add 42 installed/browser contracts,
public types and 37 deliberate package faults. `reference:build-lifecycles`
reproduces 62 accepted guard/companion rebuild and continuation records and 16 original guard
assertion groups in two fresh processes. `adapter:guard-arts` checks the typed
installed game binding, guarded installation and runtime/binding faults.

`test:stat-fork-package` verifies complete private stat context through installed
and browser contracts, public types and deliberate faults. The immutable original
`reference:build-context` course independently reproduces fourteen actual rebuild
and paid-cast checkpoints in two fresh processes. `adapter:build-context` verifies
eleven private ordinary builds through an installed package and five deliberate
faults without changing those accepted observations. See [build context](build-context.md).

The optional [account/character binding](account-character-binding.md) adds
installed and browser contracts for explicit selection, canonical investment
writeback, strict item addresses and prepared transaction rollback. Run
`test:account-character-binding-package` after building; deliberate faults must
fail and restored controls must pass. `reference:account-character-binding`
independently reproduces the twelve frozen original adoption/authority records.
Original migration and strict SDK admission are distinct contracts.

The optional [companion lifecycle](companion-grants.md) adds fourteen independent
contracts, fourteen deliberate package faults and installed/browser/type checks.
Its original-only reference contains 28 courses and 83 lifecycle observations.
The installed game replay compares companion-only and composed build adapters
against frozen companion, account, contribution and live-casting courses, then
requires runtime/binding fault detection and restored controls. Full commands
are listed in the capability document; device and native companion acceptance
remain separate work.

The optional [typed account relic boundary](account-relic-items.md) adds twelve
contracts, installed/browser/type checks and ten deliberate runtime faults.
`reference:account-relic-build` reproduces 27 original-only checkpoints in two
fresh processes; the typed package round-trips their account bodies and board
order. Companion observations establish a future extraction baseline, not
companion-runtime parity for the new owner.

`npm run test:workshop-character-package` qualifies v2 source-context ownership
through installed/browser consumers, public types, thirteen contracts and ten
deliberate faults. Its 78 frozen original attribute comparisons cover source
retention and recomputation, not full character restoration or native v2
admission. See [workshop character context](workshop-character.md).

`npm run test:build-contributions-package` qualifies the complete contribution
phase through installed/browser consumers, deliberate faults and frozen original
class/container and live-casting courses. Pass `-- --catalogue` to include the
18,773-observation worn-equipment course. See [build contributions](build-contributions.md)
for the preserved publication order and remaining durable context boundary.

`npm run test:workshop-build-package` qualifies transactional private-build
continuation through installed and browser consumers, types and eight deliberate
faults. Its diagnostic grants exercise save ownership; they do not establish
new authored-content parity or live actor publication.

`npm run test:equipment-skill-draft-package` checks private build preparation
through packed/browser consumers, deliberate faults, public types and the
frozen original continuity course. See [equipment drafts](equipment-skill-draft.md)
for the copy-service contract and remaining publication boundaries.

The [workshop skill book](workshop-skill-book.md) adds installed-package, browser,
public-type and deliberate-fault checks via `npm run test:workshop-skill-book-package`
(also included in `npm run verify`). Its opt-in embedded entry has a separate
32-step course and a qualified Windows native reproduction script. Neither is
a physical-device qualification or an expanded live equipment package.

The [equipment catalogue course](equipment-catalogue-boundary.md) captures original
worn-item derivation in two fresh processes. It records authored modifier output,
ordered stat sources, skill grants, worn supports and cast preservation before
expanding the live adapter. Numeric comparison and catalogue coverage do not
qualify complete effect execution or native package support.

The [equipment skill derivation course](equipment-skills.md) compares a packed SDK
inside the pinned game against 96 original lifecycle observations and the complete
equipment catalogue. Independent ownership/failure contracts and deliberate installed
faults supplement parity; native admission and device performance remain separate.

The public [Unity equipment preview](unity-shared-equipment.md) preserves the
qualified candidate runtime, passes actual editor/player and compatibility
courses, and rebuilds byte for byte on hosted Windows and Linux. The release
contains checksums and its hosted qualification report.

The [Unity shared-account package checkpoint](../evidence/unity-shared-account/README.md)
adds exact archive rebuilds, the documented example, shared save publication,
five lifecycle courses, standalone storage, retained gameplay regression and
ten deliberately broken save coordinators. It qualifies Unity 2021.3.6f1
Windows x64 Editor and Mono player for the selected packaged capabilities;
physical-device and complete-SDK acceptance remain separate.

The [shared account course](shared-account.md) compares 30 original-game steps
and independent multi-character ownership/continuation contracts. Both the
original fixture and its documented socket correction remain reproducible.
Package qualification adds installed/browser consumers and deliberate authority
faults; it does not establish the new composition's native-engine/device support.

The [Unity account/storage boundary](unity-account-storage.md) composes account
and workshop saves with private candidates, atomic revision checks and one
committed view. Its current evidence checker is separate from the unchanged
progression release, which can be checked against its pinned source using
--source-ref 67fa07a50a58380af22fc52e354f0091a9009b55.

The [grouped-save native checkpoint](../evidence/grouped-saves/README.md)
adds bounded atomic transactions across existing records, with six independent
process-restart cases, compatibility in both library/consumer directions and
twelve deliberate store faults. Actual engine coordination and physical-device
budgets remain separate gates.

The [Unity progression checkpoint](../evidence/unity-progression/README.md) adds the shared account
contract and an imported memory-discovery/checkpoint example. Its actual
editor/player course checks 104 steps, retired-handle isolation and complete
JSON/RNG continuation. Current package evidence is kept separately from the
published live-equipment checkpoint; the latter can be checked at its pinned
release source with `--source-ref 03eb2d504a9fe410b97d3959a76d4a494c5d3541`.
Ignored compiled outputs still require their accepted byte hashes.

The [native idle-collection checkpoint](../evidence/native-idle-collection/README.md)
adds an explicit development C operation with no automatic engine integration.
Six repeated 450-reply courses, native boundary injections and seven
deliberate faults qualify Windows and Linux, with a complete Linux sanitizer
replay. Peak memory decreases in
the measured configuration schedule while ending retention increases; no timing
or physical-device improvement is claimed.

The [live-equipment checkpoint](../evidence/live-equipment-adapter/README.md)
connects selected worn items to running Unity combat only after a durable commit.
Original courses, native replies, actual editor/relocated player runs and deliberate
publication faults are source-bound separately from the unchanged public archives.

The [Unity workshop checkpoint](../evidence/unity-workshop/README.md) adds ordinary-JSON access to the shared crafting,
equipment, learned-skill/support and vestige rules. Its native replay must
match the original 56 workshop replies in both editor and relocated player,
alongside the retained combat and pouch courses. Typed-profile checks cover
large IDs, automatic next-ID selection, isolation, refused cross-profile
commands, complete save/RNG continuation and disposal. The scene sample's
checkpoint is in memory. The optional [Unity storage package](unity-storage.md)
adds durable workshop publication and restart continuation; combat-build
synchronization remains separate integration work. Its real Unity course covers
plain storage and the combined gameplay installation, Package Manager sample
import, a relocated player, exact SQLite records, pending-save lifecycle cleanup
and deliberate early/failed-publication defects.

The [fresh Godot package checkpoint](../evidence/fresh-godot-package/README.md)
qualifies the normal builder through the full workshop bundle and extracted
Windows player. Capability fault tests run inside the crafting builder; the
inventory verifier requires exact crash recovery, current background/inlay/
station courses, and the existing delivered workflow fault tests. This
checkpoint is followed by [fresh Linux qualification](../evidence/fresh-linux-package/README.md):
an empty-dist build, editor and relocated exports, and runtime-only replay.
Both SQLite journal modes recover exact saved owners at all three crash
boundaries; actual lost/premature-commit exports are rejected. Neither
checkpoint establishes physical-device performance.

The [background-save boundary](background-saves.md) adds a bounded native worker
and asynchronous inventory publication. Its independent barrier/fault tests,
empty-project SQLite checks, relocated player/restart courses and existing
inventory workflows are recorded in [the checkpoint](../evidence/background-saves/README.md).
The standalone addon's evidence is separate from full game content.

The [cold-import qualification](../evidence/godot-cold-import/README.md) verifies
the full workshop without a supplied editor cache on Windows and Linux. It checks
automatic extension discovery, existing inventory courses and freshly exported
players. Cached and missing-library installs must fail. Long-path cleanup has
success/failure coverage; this does not establish physical-device support.

`test:crafting-session-package` runs 18 owned-session contracts against an actual
offline package installation and a browser bundle with ambient RNG and host
globals disabled. `test:crafting-session-faults` requires fourteen injected identity,
custody, continuation, view ownership, field order, station price and admission faults to change an assertion, then restores
both the test installation and its accepted predecessor. Full SDK verification
includes both checks. See [owned crafting sessions](crafting-session.md);
native/editor and physical-device acceptance remain separate work.

The `reference:status-delivery` and `test:status-delivery-observer` commands
freeze caster-side siphoning and Impale recall before extraction. Two original
captures and the installed predecessor match all 88 courses; 52 source faults
are detected. Real returned-spear travel, exact-instance retirement and nine
callback interruptions are included. See the [boundary](status-delivery-boundary.md)
and [evidence](../evidence/status-delivery/baseline-windows.json).

Hosted Windows native replay at `69729a1` failed at the experimental 256 KiB
stack guard, although local Windows and hosted Linux replay passed. The later
[repair and hosted replay](native-stack-investigation.md) retain that guard;
the earlier failure remains part of the evidence. Local replay alone is not
evidence that a hosted configuration passes.

The `reference:hit-aftermath` and `test:hit-aftermath-observer` commands
cover the remaining damaging phase and the complete common continuation of a
hit. Two original captures and the installed predecessor agree across 260
courses, with independent outcome/order/identity assertions and detection of all
101 deliberate source faults. Earlier sweeps exposed a masked story-filter case
and a sharing-ceiling case constrained by the native stat cap. The repaired
native recovery interaction is part of the accepted trace. Normal verification
does not rewrite accepted fixtures; source faults use a disposable copy.
See the [aftermath contract](hit-aftermath-boundary.md) and
[baseline evidence](../evidence/hit-aftermath/baseline-windows.json) for scope,
reproduction and retained failures. The runtime has separate
`test:hit-aftermath-package`, `test:hit-aftermath-mutations`,
`adapter:hit-aftermath-source`, `adapter:hit-aftermath` and
`adapter:hit-aftermath-faults` checks. The package and runtime faults also run
under `verify`. The installed runtime comparison matches all 260 courses;
1,300 SDK tests, 22 broader game checks, Node 22 and native replay pass. The
17 installed fault detections are a documented composite of 16 valid detections
and a repaired World-forwarding fault with a fresh control. The original broad
phase-disable fault raised an unrelated observer error and is not counted.

`benchmark:hit-aftermath -- --previous <previous-location> --location <current-location>`
compares 12 active sharing/spread/splash workloads, including independently checked
hit counts, damage and status state. Add `--verify-only` for an untimed audit or
`--control` to run the current game in all three worker slots. Run an audit before
`test:hit-aftermath-benchmark-observer`, which requires all six deliberate native
helper faults to violate the outcome assertions. Each run retains its own receipt;
the root verification filenames are only latest-run pointers. Timings exclude
snapshots, IPC and explicit GC, but include equal state reset and observation
counters. Retained heap does not measure allocation volume or a device budget.
The [measurement contract](hit-aftermath-performance.md) documents the workload
and interpretation limits; [runtime evidence](../evidence/hit-aftermath/runtime-windows.json)
retains checks, timings, controls and development failures.

`reference:hit-reactions` checks 136 original full-resolver courses covering the
29-statement reaction phase after sustain. `test:hit-reactions-observer` checks
55 deliberate source faults, including live buff/actor iteration, zero-tier and
zero-tuning defaults, captured versus live hit values, nested hits and partial
callback failures. The original and installed predecessor agree before runtime
replacement. See [landed-hit reactions](hit-reactions-boundary.md) for ownership,
observer repairs and remaining integration scope.

The optional reaction runtime is covered by 32 independent tests, 54 runtime
faults and 66 source integration controls. `test:hit-reactions-package` verifies
an independent installation, generic host types and a browser build;
`test:hit-reactions-mutations` is part of the full SDK verifier. The installed
`adapter:hit-reactions` check matches the 136-course frozen trace.
`adapter:hit-reactions-source` rejects changed source boundaries and collisions;
`adapter:hit-reactions-faults` requires ten installed runtime/binding faults to
change observations without unrelated exceptions or rewriting expectations.
The [runtime evidence](../evidence/hit-reactions/runtime-windows.json) records
1,265 passing SDK tests, all 22 game checks, Node 22 independent/installed checks
and exact native original-versus-installed replay. Raw logs retain the initial
type and package-accounting failures and their repairs. Paired timings include
an identical-input control; they do not establish a performance improvement.

`reference:hit-sustain` checks 98 frozen original courses covering siphon,
nearby sharing, life bonds and tree storage. Two original runs, the installed
predecessor and Node 22 agree. `test:hit-sustain-observer` checks 38 deliberate
source faults, including borrowed modifier identity and live recipient changes.
This baseline predates runtime extraction; see the [sustain boundary](hit-sustain-boundary.md).

The optional sustain runtime passes 1,233 SDK tests, 24 independent contract
tests, 38 runtime faults, 14 source controls, six installed faults and the same
98-course frozen trace. `adapter:hit-sustain`, `adapter:hit-sustain-source` and
`adapter:hit-sustain-faults` reproduce the integration; the full SDK verifier
includes its clean consumer and runtime mutations. All 21 game checks and the
native full-game replay pass. The [runtime evidence](../evidence/hit-sustain/runtime-windows.json)
retains raw logs, Node 22 checks and both identical-input and predecessor timing
runs. Timing is inconclusive; dedicated active-sustain and device workloads
remain open.

`benchmark:hit-sustain -- --previous <location.json> --location <location.json>`
adds 21 real-game sustain workloads with native healing and independent arithmetic
checks. Use `--verify-only` to check outcomes, `--control` for identical inputs,
and `test:hit-sustain-benchmark-observer -- --location <location.json>` to check
four deliberate common-worker faults. The reference CI job runs the outcome and
fault checks, not timing thresholds. See the [measurement contract](hit-sustain-performance.md)
for warmup, timing inclusions, preserved trials and the unadopted binding prototype.

The [stat context cache](stat-context-cache.md) adds 74 frozen original courses,
18 independent tests, 22 runtime faults, eight original-observer faults, 12 source
controls, and four installed-game faults. `reference:stat-context`,
`test:stat-context-observer`, `adapter:stat-context-source`, `adapter:stat-context`
and `adapter:stat-context-faults` reproduce the boundary. `verify` includes its
clean package, types/browser checks and runtime mutations. Paired hit timing has
an identical-input control and an independent established gameplay observer.

`reference:hit-landing` checks 112 original courses with positive assertions for
native outcomes, state and callback effects. `test:hit-landing-observer` checks
48 deliberate source faults without accepting unrelated exceptions. Two original
captures, the installed predecessor and Node 22 agree. The optional runtime is
checked by `adapter:hit-landing`, its source and installed-fault commands, and
independent contract/fault/package tests in the SDK verifier. See
[hit landing](hit-landing-boundary.md) for observer repairs and ownership limits.

`reference:hit-preparation` checks 122 original courses from fuse admission
through shell interception. `test:hit-preparation-observer` verifies 37 deliberate
source faults, including definition capture, borrowed payloads, partial writes,
strict thresholds and interception order. Two original captures and the installed
predecessor agree. See [hit preparation](hit-preparation-boundary.md) for the
corrected tier-zero observer gap and the extracted runtime contract.
`adapter:hit-preparation` repeats those courses through the installed package;
35 source controls and six installed faults guard integration. The full SDK
verifier includes 28 independent tests, 35 runtime faults and a clean consumer.

`reference:hit-effects` compares 107 original ordered hit-effect courses.
`test:hit-effects-observer` checks 26 deliberate original-source faults across
all sixteen dispatch branches, live effect lists and hook ordering. Accepted
expectations are immutable. Two original captures and the previous installed
adapter agree; this baseline predates the extracted loop. `adapter:hit-effects`
checks the installed archive, runtime identity and the same trace. Independent
tests, runtime faults and an installed consumer also exercise the new optional
service. See [hit-effect dispatch](hit-effects-boundary.md) for the discovered
cross-story coverage gap, ownership contract and scope limits.

`reference:hit-status` compares 369 frozen original hit/status courses without
rewriting expectations. `adapter:hit-status` verifies archive/install identity,
the same trace, and unchanged game/package files. `adapter:hit-status-source`
rejects 21 source faults/collisions. Six installed runtime faults must change
the trace without introducing an unrelated exception. The full SDK verifier
includes 22 independent tests, 25 runtime faults and a clean package consumer.
See [hit/status policy](hit-status-boundary.md) for phase ordering and limitations.

`reference:status-effects` compares the 263-course frozen original World status
fixture without rewriting it. `adapter:status-effects` checks archive identity,
installed runtime equality and the same observations through the game adapter.
`test:status-effects-package` and `test:status-effects-mutations` run in the full
SDK verifier. See [status effects](status-effects.md) for scope and phase order.

The [status lifecycle](status-lifecycle.md) has a frozen 217-course baseline from
two original runs and the previous installed adapter, covering all 152 authored
definitions and a separately identified synthetic taper. Independent tests and
runtime/installed fault injection verify the new boundary. The
[checkpoint evidence](../evidence/status-lifecycle/windows.json) records actual
completed checks; complete World status execution and device performance remain
open. The browser-check build tool is now an explicit pinned development
dependency, following a clean Steam Runtime failure that exposed ancestor-package
resolution in the earlier local setup.

One broader affliction-cue probe remains red in the pinned original, prior
adapter and status candidate at the same `terrain statuses stay quiet` assertion,
after 53 matching checks. The checkpoint records that baseline failure rather
than treating the complete rendering probe as passed.

The [shared damage service](damage-pipeline.md) matches 119 original Actor courses
including state writes, query order, random draws and callback failures. Its fresh
adapter reproduction passes game/launcher/simulation types, six combat probes,
114 attack-course checks, 12 attack-content projections and 25 smoke episodes.
The full attack course also passes through the native driver and shared library
with exact original-versus-installed native output. Independent arithmetic,
packed consumer, browser build and deliberate-fault checks cover the new service.
Device measurements and complete actor/native-engine packaging remain open.

All 1,048 SDK tests and both original-reference gates pass for this checkpoint.
Nineteen runtime faults and six installed-package faults are detected. All 225
predecessor outputs remain unchanged; the optional module adds 32,770 bytes of
unminified JavaScript. The separate 33 KiB growth limit is a packaging guard,
not a performance result. [Raw-backed evidence](../evidence/damage-pipeline/windows.json)
retains the successful runs, initial package-accounting failures and Linux
original-game comparison review.

The [native full-game attack course](native-attack-course.md) verifies 114 actual
gameplay checks and 150,608 numeric observations through the pinned native driver
and shared library on Windows x64. Original and installed native results match
exactly; two facing-angle observations differ from Node by less than `5e-16`.
The proc subclass repair passes all 1,025 SDK tests, 150 installed proc courses,
18 installed faults, full game types, 114 sequence checks, 12 content projections
and 25 smoke episodes. The existing native session still passes its 60 requests
and 609 numeric comparisons. No native package completeness or device performance
claim follows from these results.

The [attack-sequence controller and content](attack-sequences.md) checkpoint passes
1,024 SDK tests, 114 complete original gameplay checks (7,264 events and 2,733
random draws), 12 direct original content projections, all 49 recovery courses,
the existing bank/lifecycle/proc regressions and 25 smoke episodes. Twenty runtime
faults, five source guards and eight installed faults are detected. Independent
package/type consumption and browser build pass. All 216 previous outputs are
unchanged. [Raw-backed evidence](../evidence/attack-sequences/runtime.json) records
the type-only correction and the content-observation gap found and closed during
verification. Native engine exposure, dedicated renderer and device performance
acceptance remain open.

The sequence recovery checkpoint passes 1,005 SDK tests (28 focused), 49 frozen
original courses, 114 actual Cleave checks with original-identical output, 25 smoke
episodes and the existing 35/44/75 bank/lifecycle/proc courses. It detects 16
runtime, nine source-guard and seven installed faults. Independent package/type
consumption and a browser build pass; all 213 previous runtime outputs remain
unchanged. The optional module adds 2,131 bytes of JavaScript. Its
[contract](sequence-recovery.md) and [raw-backed evidence](../evidence/sequence-recovery/runtime.json)
record preserved reentrancy and partial writes. Geometry, complete attack-sequence
execution, new native-host exposure and measured optimization remain open.

The ready-only refund bank checkpoint passes 977 SDK tests (24 focused), 35
frozen original courses, 44 existing lifecycle courses, 75 existing proc cases,
25 game smoke episodes and 21 existing cooldown renderer stages. It detects
16 runtime, nine source-guard and seven installed-game faults. Its independent
package/type consumer passes; all 210 previous runtime outputs remain unchanged.
The optional module adds 1,896 bytes of JavaScript. See its
[contract](ready-cooldown-bank.md) and
[raw-backed evidence](../evidence/ready-cooldown-bank/runtime.json).
Those initial renderer stages cover existing cooldown regressions. A subsequent
[dedicated display checkpoint](../evidence/ready-cooldown-bank/renderer.json)
matches 23 refund-bank states and actual paint observations against two original
captures and detects five deliberate SDK/paint faults. Its public shell capsule
rebuilds the isolated renderer without a local game checkout. Complete Assault
extraction, new native-host exposure and measured device optimization remain open.

The optional cooldown lifecycle development checkpoint passes 953 SDK tests
(30 specific to this module), 44 frozen original lifecycle courses, the 75
existing proc-cooldown courses and the 21 existing renderer stages. It detects
17 runtime, 16 source-guard and 10 installed-game faults. Its installed game
passes all type checks and 25 smoke episodes. The six functions add 3,656 bytes
of JavaScript while preserving all 207 predecessor runtime outputs. See the
[lifecycle boundary](cooldown-lifecycle.md) and
[runtime evidence](../evidence/cooldown-lifecycle/runtime.json) for the exact
scope, retained failures and reproduction commands. Broader lifecycle renderer,
native-host, performance and physical-device acceptance remain open.

The v0.38 development restoration candidate passes 850 SDK tests, including 211
focused restoration checks and three fault-selector checks, and preserves all
195 predecessor compiled files.
All 218 native observations match through the installed package, including full
cue/event payloads, timed World updates, reservations, callback order and partial
failures. Twenty-three runtime faults, 222 source-guard faults and eighteen
installed-game faults are detected. Installed faults touch only newly copied
source and package files. The public preparation path reproduces the same 997
game source files and 201 SDK outputs from the pinned capsule.
Twenty restoration renderer stages also match two independent native captures,
including reservation bands, feeding cues, recharge/poise arcs, real World clocks
and earned proc glyphs. `adapter:restoration-ui` checks a matching full game build
against the frozen observations using a verified deterministic browser clock.
See the [renderer checkpoint](../evidence/milestone-forty-three/renderer-checkpoint.json).
The restoration benchmark also passes 16 analytic and cross-graph workload
checks plus four Actor-release checks before timing. Its accepted plan pins the
helper and complete outcomes; `benchmark:restoration` measures the real game
entry points in separate processes and verifies every sample against those
outcomes. See the [validation record](../evidence/milestone-forty-three/performance-validation.json)
and reproduction commands in the restoration contract.
Both initial timed runs now preserve those outcomes. All four retained-memory
medians match, but shield gains and large ordinary-poise batches show repeated
CPU regressions. The [full samples](../evidence/milestone-forty-three/restoration-initial-performance.json)
are retained for the profiling and optimization decision; passing outcome checks
does not imply performance acceptance.
The [immutable-export experiment](../evidence/milestone-forty-three/restoration-immutable-export-experiment.json)
adds two reversed three-version comparisons and all 2,400 timing samples. All
behavior and cleanup checks passed, but 22 fixed performance gates failed. Its
patch applies to the published baseline and reverses exactly. The
[rollback verification](../evidence/milestone-forty-three/restoration-immutable-rollback-verification.json)
confirms all 201 initial runtime outputs are restored. The syntax-tree fault
selector and callable-metadata checks remain; no speed improvement is accepted.
An [identical-code diagnostic](../evidence/milestone-forty-three/restoration-measurement-diagnosis.json)
then validates eight fresh processes and 1,200 samples across the first six
workload/count cases. Both helper variants type-check and reproduce accepted
outcomes. Seven of twelve ordinary pairs exceed five-percent median differences
despite identical code; the coarse CPU counters do not establish a cause. This
records a measurement limitation and keeps performance acceptance open. See the
restoration contract for the frozen plan, calibration and reproduction commands.
The [restoration contract](resource-restoration.md) separates these checks from
performance, managed-game and public-main acceptance, which remain open.
Its [initial adapter checkpoint](../evidence/milestone-forty-three/adapter-checkpoint.json)
records archive identity and gameplay regressions. No hardware or native-engine
compatibility claim follows from these desktop checks.

Version 0.37 uses `reference:life-recovery`: 101 frozen native
cases covering recovery/refill, all five loaded heal procs and representative
World delivery. Two original runs and one published-v0.36 run agree exactly.
A three-case addendum checks method selection before callbacks; thirteen further
cases capture the actual cue pulses missed by the earlier display-override field.
Four additional cases preserve native invocation for customized or wrapped heal
functions. Original and installed-game reproduction now cover 121 cases. Seventy-four focused SDK tests, seventeen
deliberate runtime faults and an independently installed package check the new
optional modules. The guarded adapter rejects 188 source faults and preserves
993 other game source files. Game/launcher/simulation types, simulation smoke and
the prior effect/delayed/buff comparisons pass. Seventeen installed faults are
detected in a copied graph, including the formerly unobserved zero-result cue
and accidental reads of a callable's custom `.call` property.
See [the boundary](life-recovery.md) and [acceptance record](../evidence/milestone-forty-two/verification.json)
for the isolated managed-game checks and final package verification.
Fifteen renderer stages match two independently captured native runs, including
actual life-orb painting, floating heal numbers, native casts and recovery under
paused/slowed clocks. `adapter:recovery-ui` preserves its source, installed
package, bundle and frozen expectations. The preceding fourteen buff, ten proc
and nine delayed renderer stages also pass. The controlled block event and host
refill are explicitly distinguished from physical input; delayed observations
retain their existing ambient-random scope.
A function-layout proposal was rejected after two comparisons against
both native v0.36 and the corrected candidate. Its 1,350 timings, 168 heap
observations and source patch remain available in the
[measurement record](../evidence/milestone-forty-two/recovery-notification-performance.json).
No targeted positive-healing workload improved by the required amount in both
runs, and refill batches exceeded the regression threshold. The selected runtime
is restored byte-for-byte to the corrected checkpoint; no performance change is
adopted. Physical-device measurements remain outstanding.
The recovery runtime passes the complete `npm run verify` gate with 636 tests, including
the prior package consumers and fault checks. All 189 predecessor runtime outputs
remain byte-identical; the recovery modules add six compiled outputs.

Version 0.36 adds `reference:buffs`, `adapter:buff-source`, `adapter:buffs`,
`adapter:buff-ui`, `test:buff-package`, `test:buff-mutations` and `benchmark:buffs`.
The [buff contract](buffs.md) and [M41 evidence](../evidence/milestone-forty-one/verification.json)
record 562 SDK tests, forty original courses, eight additional host cases,
112 source-guard faults, 31 runtime faults and 22 installed faults. One synthetic
independent-consumption course has four explicitly repaired fields; the other
39 courses remain unchanged. All 183 predecessor runtime files are unchanged.
The two optional modules total 16,383 bytes within their 18 KiB allowance.

The selected runtime passes fourteen byte-equal buff renderer observations,
ten prior proc stages and nine prior delayed stages. The delayed comparison keeps
its previously specified ambient-random limitation. None is pixel-equivalence or
physical-input evidence. Eleven managed-game checks include six read-only
installed comparisons, full types, native defenses and cues, smoke, and an audit
of original work. The managed copy retains all 1,866 other tracked files, its four
existing bounty methods and its independent prior dependency tree. Its older
source differs from the capture game; that relationship is recorded explicitly.
Concurrent original-game UI edits are observed and preserved separately, without
claiming byte identity for files actively edited elsewhere. No game is pushed.

Use `adapter:buffs -- --location <location.json>` for a read-only comparison.
Fault injection requires `--faults` on a disposable candidate; retained controls
and source/package aliases are rejected. Six order-varied comparisons retain
5,200 timed samples and 672 heap observations across three experimental stages.
The selected reentry implementation saves 96 retained bytes per used Actor versus
the first extraction. A timer experiment failed its prespecified threshold and
was restored; its four regression tests include 510 expiry-position combinations.
Remaining native-versus-SDK overhead is explicit. Allocation volume, general FPS,
physical Steam Deck/mobile results and full native-engine packages remain open.

Version 0.35 adds `reference:delayed-effects`, `adapter:delayed-source`,
`adapter:delayed`, `adapter:delayed-ui`, `test:delayed-package` and
`benchmark:delayed`. The [contract](delayed-effects.md) and
[M40 evidence](../evidence/milestone-forty/verification.json) record 520 SDK tests,
48 original courses with six separately specified repairs, four additional host
cases, 100 source-guard faults, 24 runtime faults and 17 installed faults.
All 180 predecessor runtime files are unchanged. The optional delayed module is
8,136 bytes within its unchanged 8 KiB allowance.

The measured package passes 13 renderer checks, including nine delayed-effect
stages, and ten managed-game checks with independently installed dependencies.
Renderer comparison preserves every accepted gameplay/paint field and the first
eight random draw counts. The last post-departure ambient count is diagnostic:
an unchanged original repeat also varies there. This is not raw-byte or pixel
equivalence. Managed checks include five read-only installed comparisons, full
game/launcher/simulation types, native defenses and proc cues, smoke and original
preservation. The four existing bounty methods and 1,865 other tracked files
remain unchanged; the game checkpoint is local only.

Use `adapter:delayed -- --location <location.json>` for a read-only comparison.
Fault injection requires explicit `--faults` on a disposable candidate; retained
controls and their aliases are rejected. Four order-varied performance runs
record 2,700 timed samples and 168 paired retained-heap observations. Waiting
drains improve 8.9–14.3% over the initial extraction but remain 9.1–24.3% slower
than v0.34; other rankings vary. No general speed, allocation-volume, physical
device or FPS claim follows. Eleven of thirteen system families remain partial.

Version 0.34 added `reference:proc-effects`, `adapter:effects-source`,
`adapter:effects` and `benchmark:effects`. The [effect contract](proc-effects.md)
and [M39 evidence](../evidence/milestone-thirty-nine/verification.json) record 478
SDK tests, 1,096 original observations, seven extra native hook/cue cases,
13 runtime faults, 110 source-guard faults and 15 installed effect faults.
The optimized package passes 12 renderer checks and nine managed-game checks.
Earlier broad coverage is explicitly attributed to the retained initial package;
the current targeted reruns and unchanged runtime/source hashes are separate.

The effect module is 2,394 bytes inside its 4 KiB allowance; all 177 predecessor
runtime files are unchanged. Two controlled eleven-workload comparisons and two
supplemental longer-warmup frame runs retain matching outcomes. Authored scaling
is about 24% faster than the initial extraction, with residual overhead against
v0.33 documented. This is not a device, allocation-volume or general FPS result.
Use `adapter:effects -- --location <location.json> --read-only` to compare an
existing integrated game without fault injection. The default mutating checks
require disposable candidates and reject retained controls and source/package
aliases. Eleven of thirteen system families still have work remaining.

This extraction began with [bounded original observations](proc-effects.md).
`npm run reference:proc-effects` type-checks five capture helpers and compares
1,096 observations with immutable original fixtures: 22 native branch examples,
1,036 magnitude-fold observations, 15 ward/delayed-resolution edges and 23
resource-callback/metadata-copy observations. The native
executor includes `birth` beyond the 21 catalogue shapes. These are baseline
observations; they add no standalone effect capability or performance claim.

Version 0.33 adds `reference:procs`, `adapter:procs-source`, `adapter:procs`,
`content:procs` and `benchmark:procs`. The [proc contract](proc-runtime.md)
documents the event paths, exception behavior, content ownership and reproduction
commands. The [M38 acceptance](../evidence/milestone-thirty-eight/verification.json)
records 468 SDK tests, all 150 unchanged original proc courses, 42 source-guard
faults, 18 installed proc faults, 21 native probes and 12 renderer checks. The
renderer compares ten proc observations against two retained v0.32 executions;
its new ward course earns the effect through an actual frame update. The earlier
eight cue courses partly invoke the native executor directly.

Two controlled seven-workload comparisons retain matching receipts. The native
ID-view cache improves changing grants by 17–21% against the retained earlier
candidate, while that workload remains 0.7–3.2% above v0.32. The headless ward-frame
workload remains 4.5–5.3% above v0.32; active, ungranted and pulse paths also retain
overhead. Three optional proc modules total 21,462 bytes inside their 24 KiB
allowance; all 168 predecessor runtime files are unchanged. This is not evidence
of device performance, allocation volume or a whole-game speedup.

The managed adapter has independent dependencies and preserves its four existing
bounty methods and every other tracked file. Final package consumers and hosted
checks are distinct gates. Eleven of thirteen families remain partial, including
execution of all 22 native proc effect branches and full native-engine packages.

Version 0.32 adds `reference:conditions`, `adapter:conditions-source`,
`adapter:conditions` and `benchmark:conditions -- --previous-adapter
<retained-v0.31-game>`. The original baseline contains 49 courses, including seven
re-entry diagnostics retained unchanged. The installed comparison checks 42
courses and nineteen recovery/dead-sweep cases; only the separately specified
condition recovery and existing gauge recovery decisions may change observations.
The fourteen-case recovery contract was committed before implementation.

The recency refactor passes 444 SDK tests, 148 deliberate faults and 24 packed
consumers. Twenty-three focused tests cover the 154 unchanged original sampling
observations, recovery, distinct recency windows and one-pass feedback. Two
four-way comparisons retain identical gameplay receipts; gains over the initial
extraction and remaining overhead against v0.31 are both recorded in
[the condition contract](actor-conditions.md). The 7,331-byte module remains
within its 8 KiB allowance; the combined bound is 464 KiB, with all prior module
and core limits unchanged.

The [M37 acceptance](../evidence/milestone-thirty-seven/verification.json) records
17 installed comparisons with 109 detected faults, 21 native probes and eleven
renderer checks. Six request-stage outcomes match retained v0.31 byte-for-byte.
Managed condition and bank/gauge comparisons, all game types and smoke passed
while preserving all 1,862 other tracked files. All 168 runtime files match the
measured and verified implementation; all 165 predecessor files are unchanged.
The final documentation archive has separate clean-consumer evidence. Eleven of
thirteen families remain partial; native-engine and device acceptance remain
outstanding.

Version 0.31 adds `reference:banks`, `adapter:banks-source`, `adapter:banks`
and `benchmark:banks -- --previous-adapter <retained-v0.30-game>`.
The immutable original baseline was committed before implementation: 57 courses
and 292 transitions, reproduced twice from the frozen original and byte-equal
to retained v0.30. The separate `gauge-namespace-refresh/v1` decision specifies
six diagnostic corrections without replacing those original fixtures.
A separate two-course, ten-transition original-only addendum was accepted before
the sparse status/reserve count repair. Its raw observations match exactly;
present invalid numbers remain rejected. The existing admission suite also
passes its 137 courses and 243 observations against the corrected installation.
The installed comparison checks exact bytes for banks and applies only that
independent decision to gauge expectations; eighteen deliberate faults exercise
the installed runtime and host bindings. Thirty-eight focused tests cover the
new host boundaries, including failures, isolation, detached identity and cache
refill after emptying. The source overlay guards all inputs before writing and
preserves unrelated members and condition policy in both newline styles.
The packed bank/gauge consumer demonstrates the separate sampling and decay
phases with stat values `[2, 5, 5, 1]`. Separate 3 KiB/5 KiB allowances increase
the combined package bound from 448 to 456 KiB; prior module/core bounds remain
fixed. See [banks](channel-banks.md) and [gauges](actor-gauges.md) for contracts.
The compact implementation passes the full verifier's 421 tests, 138 deliberate
faults and 23 packed consumers. Its installed comparison detects all eighteen
new faults; all 159 predecessor runtime files are unchanged. The new entries
are 2,575 and 4,479 bytes of unminified JavaScript. The
[implementation evidence](../evidence/milestone-thirty-six/compatibility-repair/runtime-verification.json)
records those checks and the separate repeated CPU/retained-heap decision.
The [M36 acceptance](../evidence/milestone-thirty-six/verification.json) records
16 installed comparisons with 101 detected faults, 19 native probes and 11 renderer
checks. Six request-stage observations match retained v0.30 byte-for-byte. Managed
bank/gauge and continuation comparisons, game/launcher/sim types and smoke passed
while preserving unrelated source and four existing bounty methods. All final
runtime files match the measured and verified compact implementation. The final
documentation archive has separate clean-consumer evidence. Eleven of thirteen
families remain partial; native-engine and device acceptance remain outstanding.

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

The [retained Windows evidence](../evidence/native-attack-course/windows.json)
includes raw comparisons, failed discoveries and the constructor negative control.

The optional status-delivery entry adds independent contracts, runtime faults
and a clean package consumer to `verify`. The consumer checks host-specific
3D positions, quaternion directions and extended records through the public
types and a browser bundle. `adapter:status-delivery-source` verifies guarded
replacement and preservation of unrelated imports. `adapter:status-delivery`
compares the installed archive with all 88 frozen original courses, and
`adapter:status-delivery-faults` requires observable changes for fifteen faults
across runtime, binding and World forwarding. The fault runner restores and
checks the installation's full source and package maps. See the
[status-delivery boundary](status-delivery-boundary.md) for ownership and limits.

The dedicated native status runner is `node scripts/test-native-status-delivery.mjs
--location <installed-location> --amalgam-dir <pinned-source>`. It runs all 88
frozen courses through C, C++ and .NET, checks exact observations and disposal,
and requires two behavioral faults to reach their specific wrong outcomes in
every consumer. Node reconstruction must first match the original frozen bytes.
The embedded-host workflow runs this separately from full-attack replay and
retains execution metrics, outputs, build commands and managed build logs.

The complete proc dispatcher/payload boundary has two separate checks:
`npm run reference:proc-delivery` type-checks and replays the real original game
against frozen observations; `npm run test:proc-delivery-observer` applies
63 scoped source faults in a disposable original copy. Every focused positive
control must first match its row in the complete 328-course capture. Syntax
failures and new exceptions do not count as detection. Both commands preserve
accepted files, and the reference runner also checks source, compiled runtime
and any installed package maps for changes. See the
[proc-delivery boundary](proc-delivery-boundary.md).

The `Verify proc delivery baseline` workflow runs each command in its own fresh
job on Windows and Linux with Node 24, using the pinned source capsule and
reference tool versions. It retains observations, logs, fault traces and verification
receipts. This is an original-behavior gate, not evidence that a new proc runtime,
native extension or physical-device performance target has been accepted.

The optional `combat/proc-casting` candidate extracts payload casting and held
selection from that boundary. Its 27 independent tests and 32 runtime faults
join `verify`; its packed consumer also checks public 3D/quaternion types and a
standalone browser build. `adapter:proc-casting-source` guards both complete
source methods. `adapter:proc-casting -- --location <location>` replays all 328
frozen courses through an installed archive, while `adapter:proc-casting-faults`
checks eight runtime/binding/forwarding faults and restores the installation.
See [proc casting](proc-casting.md) for exact ownership and remaining scope.

The optional `combat/proc-delivery` entry runs the whole admitted effect and
rider sequence. `adapter:proc-delivery` compares all 328 courses with the frozen
original. `test:proc-delivery-package` exercises the installed browser and typed
consumers. `test:proc-delivery-mutations` checks 54 runtime faults and
`adapter:proc-delivery-faults` checks 17 installed faults with 15 focused
controls. `adapter:proc-delivery-source` checks source guards, failed writes
and retry behavior. The proc content package check also runs the authored ward
example with two independent actors sharing one set of definitions.

The [native replay](../scripts/test-native-proc-delivery.mjs) runs every course
through C, C++ and .NET and records response hashes and allocator counters.
The [summon census benchmark](../scripts/benchmark-proc-census.mjs) compares
identical answer sets across six roster sizes and densities. The embedded
version uses the verified native replay driver. See [proc delivery](proc-delivery.md).

Pass `--world` to either census benchmark to measure the ordinary array visitor
in the Hollow Wake binding. The [native stack comparison](proc-native-stack.md)
checks all original observations and exercises the first formerly failing cast
at a controlled diagnostic limit.

## Unlock and memory candidate

The 0.44 candidate adds memory rewards, the unlock lifecycle, validated content,
package prerequisite data and deterministic rune presentation. The normal tests
include independent compatibility-repair assertions. The full verifier installs
the SDK and three content archives into a separate consumer, replays the frozen
policy/purchase/reward observations, checks public types and browser bundling,
rejects 68 deliberate faults, and checks guarded adapter installation.

The reference verifier reproduces the original unlock/memory goldens and the
separately timestamped content, key, initialized-catalogue and repair-edge
supplements. These raw observations remain separate from approved repairs.

After adapter preparation, the adapter:unlocks command checks actual game delegation,
23 save/load transitions and previous class, continuity and gate observations.
Actual Vault interaction, native/editor packaging and device measurements remain
separate acceptance gates. See [unlocks and memory rewards](unlock-lifecycle.md).

## Progression session and Godot package

The 0.45 candidate adds fourteen session contracts, an isolated installed consumer,
strict public types, four installed faults and archive safety/compatibility tests.
The Godot course exercises the actual wrapper in a fresh editor project and its
relocated release, including disk persistence and RNG continuation across native
hosts. `godot:progression-package` and `godot:progression-replay` reproduce that
path; both target jobs are wired into the existing Godot workflow. Local Windows
acceptance does not stand in for hosted Linux/Windows or physical-device runs.
See the [session contract](progression-session.md) and retained evidence.

## Crafting and salvage candidate

`reference:crafting` reproduces the immutable original policy and real-World action
observations, verifies helper/declaration hashes and type-checks the observers.
`test:crafting-observer` checks deliberate source faults in a disposable copy,
after fresh unchanged controls match both fixtures. The 0.46 verifier additionally
installs the runtime, item and crafting archives in a fresh consumer, checks
numeric/action/ownership contracts, public types and browser bundling, applies
deliberate runtime faults, and exercises guarded two-file adapter installation.
`adapter:crafting` replays both original fixtures against a selected installed
game. `test-crafting-installed-faults.mjs --location <location.json>` checks that
the actual game path detects deliberately broken installed rules and actions,
then restores the package and repeats clean controls. See
[the extraction boundary](crafting-boundary.md) for composition and remaining gates.

After correctness checks, `benchmark:crafting` runs five isolated installed
consumers with shared validated definitions, explicit random values and checksum
controls. It records load costs, retained heap after GC and price/roll/menu batches.
It is desktop evidence; it does not establish a speedup or a device budget.

## Gem residence and item restoration candidate

`reference:gem-residence` compares the original pack/unpack, grant restoration,
bag queries and item migration with the immutable pre-extraction observations.
`test:gem-residence-observer` checks deliberate faults in disposable original
source, with clean before/after controls and copied-versus-borrowed identity
assertions. The source helper also refuses ambient random draws after boot.
See [the persistence boundary](gem-residence-boundary.md) for the distinct loose
and granted-skill rules, native UID ordering and the remaining owned-session
work. The 0.47 runtime adds an isolated consumer with 12 contract tests, the same
contracts through a browser bundle under hostile globals, public TypeScript
checks, 30 runtime faults and guarded two-file installation to `verify`.
`adapter:gem-residence` compares the actual installed game with the frozen trace;
`adapter:gem-residence-faults` checks eight broken installed behaviors and restores
the clean package afterward. Native/session and device acceptance remain open.

## Compiled immutable content

The 0.49 candidate adds nine transport/ownership contracts, all fourteen existing crafting-session contracts using compiled content, a fresh installed consumer, hostile-global browser replay, public types and nine deliberate fault checks. `test:content-table-package` and `test:content-table-faults` are included in `verify`. The separate Windows native replay compares 56 requests with the accepted 0.48 package, including two loaded profiles and complete crafting lore. The paired benchmark records load/course time, tracked bytes and allocation calls. See [the format and reproduction commands](content-tables.md); device and editor acceptance remain separate.

## Godot crafting and progression

See [the installation and reproduction guide](godot-crafting.md). In addition
to the SDK verifier, run both Godot replays, the installed progression faults
and the archive controls. Node compares the 56 observed engine replies with
the frozen reference after each play. The precision vectors additionally read
the actual Godot double bits, including the smallest subnormal, and format
independently supplied bits back into portable decimal text. Neither the Linux
workflow configuration nor a desktop allocator result is device acceptance.

The [Steam Runtime session verification](steam-runtime.md) builds the two
capabilities into one Linux addon and exercises both full courses from that
archive in the SDK and in the matching Platform. The portable device runner
checks the same exported files and observations before accepting each sample.

The [inventory workshop checks](inventory-workshop.md) exercise that archive
through rendered controls and process restarts, comparing the database and
restored game view to the original checkpoint. The runtime-only Linux replay
also checks the extension paths loaded by the shipped game.

## Bonded companions and attribute inheritance

`reference:companion-mechanics` replays the accepted 170 original assertions in
two fresh processes, checking exact logs and source hashes. `adapter:companion-bonds`
compares an installed SDK with the original across those assertions and 40
existing rebuild observations, then checks effect ownership and deliberate
runtime/binding faults. All four replacement modules are checked before any
installation writes, preserving reviewed inputs, newlines and appended host code.

`test:companion-bonds-package` runs 53 independent contracts through the installed
exports and a browser bundle with forbidden ambient services, checks public
types against both installed declarations and direct source, and requires 31
selected runtime faults to fail before restoring a clean
control. The three optional exports have their own package bounds. These are
behavior, packaging and ownership checks; target-device performance and full
native engine exposure are separate acceptance work. See
[the contract](companion-bonds.md).

The copy-lifetime original course adds eight frozen observations to the shared
lifecycle verifier. The companion game adapter checks four private contexts and
fifteen paired stages, including active native casts, growth and actual revival;
five additional faults qualify copying and payload ownership. Its explicit graph
fixture does not implement the complete authored private-build provider.

## Guard continuation ownership

The guard package course now exercises 42 contracts and 37 deliberate faults,
including cast-time power, private callback ownership, logical aliases and
installation into an empty host-owned controller. The original lifecycle course
also replays the fourteen frozen guard continuation observations. The game
course checks three real-actor continuation contexts and eleven paired stages,
retaining the world's fixed controller identity and proving that private steps
leave the live guard unchanged. Its explicit fixture graph is not a generic
World copier or the full authored private-build provider. See
[guard disciplines](guard-arts.md).

## Body levels

`test:body-levels-package` checks sixteen independent contracts through installed
and browser consumers, installed and direct-source public types, and ten
deliberate faults with a restored control. `reference:body-levels` replays 23
frozen original checkpoints in two fresh processes. `adapter:body-levels`
checks installed body and companion modules together, source installation guards,
six runtime/binding faults, the original body and copy-lifetime courses, and
four private companion contexts with fifteen stages. Complete spawn/World and
device acceptance remain separate; see [body levels](body-levels.md).

## Companion recovery

`test:companion-recovery-package` checks eighteen independent contracts through
installed/browser consumers, installed/direct-source types and twelve deliberate
faults. `reference:companion-recovery` replays 25 frozen original checkpoints in
two fresh processes. `adapter:companion-recovery` composes installed recovery,
body and companion modules, checks eighteen installation guards and eleven
runtime/binding faults, and retains body/copy-lifetime observations plus four
private companion contexts and fifteen stages. See [recovery](companion-recovery.md).

## Aura retirement

`test:aura-retirement-package` checks twenty contracts through installed and
browser consumers, installed/direct-source types and thirteen deliberate faults.
`reference:aura-retirement` replays twenty-six retirement and five actual-contact
checkpoints in two fresh original processes. `adapter:aura-retirement` combines
installed aura, recovery, body and companion modules; it checks twenty-three
installation guards, four runtime/binding faults, eighty-seven original
observations and four private companion contexts with fifteen stages. These
prepared courses do not qualify aura activation, a complete private build, native
engine exposure or physical-device performance. See [aura retirement](aura-retirement.md).

## Aura ledgers

`test:aura-ledgers-package` checks twenty-eight installed/browser contracts,
public/direct-source types and sixteen deliberate runtime faults.
`reference:aura-ledgers` replays forty checkpoints in two fresh original
processes. `adapter:aura-ledgers` composes eight installed modules and checks
forty-two rendering/installation guards, eight runtime/binding faults, 127 original
observations and four private companion contexts with fifteen stages. Both Actor
and World are preflighted before either file is installed. These prepared courses
do not qualify full activation/scheduling, complete private graphs, native engines
or physical-device performance. See [aura ledgers](aura-ledgers.md).

## Aura activation

`test:aura-activation-package` checks thirty-eight installed/browser contracts,
public/direct-source types and thirty-two deliberate runtime faults.
`reference:aura-activation` replays thirty-eight checkpoints in two fresh original
processes. `adapter:aura-activation` composes nine installed modules and checks
thirty rendering/installation guards, eight runtime/binding faults, 165 original
observations and four private companion contexts with fifteen stages. Full World
scheduling, complete private graphs, native engines and physical-device acceptance
remain separate. See [aura activation](aura-activation.md).

## Aura ticking

`test:aura-ticking-package` checks 48 installed/browser contracts, public and
direct-source types, and 33 deliberate runtime faults. `reference:aura-ticking`
replays 63 original observations in three courses and two fresh processes each.
`adapter:aura-ticking` composes ten installed modules and checks 34 rendering and
installation guards, 12 runtime/binding faults, 228 original observations and four
private companion contexts with fifteen stages. Full game scheduling, complete
private graphs, native engines and physical-device acceptance remain separate.
See [aura ticking](aura-ticking.md).

## Summon birth and offspring

`test:summons-package` checks 56 installed/browser contracts, public/direct-source
types and 35 deliberate faults. `reference:summons` replays 117 frozen original
observations in seven courses and two fresh processes each. `adapter:summons`
checks 62 installation guards, 345 original observations, four private companion
contexts with fifteen stages and ten integration faults. `adapter:summons-composed`
qualifies the complete adapter assembly and paired combat. These courses do not
prove a complete body factory, private build graph, native API or target-device
performance. See [summon services](summon-birth.md).

## Body factory

`test:body-factory-package` checks 27 installed/browser contracts, 27 deliberate
faults and eleven negative type examples. `reference:body-factory` reproduces
4,834 accepted original observations across 1,184 loaded definitions and focused
ordering cases. `adapter:body-factory` checks 5,179 observations, thirteen installed
modules, eighteen integration faults and nineteen factory installation guards.
`adapter:body-factory-composed` compares the normal adapter assembly with the same
assembly retaining only original body construction, including 25 paired combat
episodes. Private graph, native-engine and device acceptance remain separate.
