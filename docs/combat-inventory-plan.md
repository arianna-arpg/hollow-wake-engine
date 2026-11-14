# Combat and Inventory SDK completion plan

Status: resumed by the user on 13 November 2026, starting with milestone 1. The combat and Inventory boundary below supersedes the earlier open-ended completion interpretation. Optional quest, account, persistence and world-event expansion remains outside this delivery.

## Deliverable

Deliver one independently installable combat and Inventory-facing character SDK, with separate authored content, a coherent character-to-combat interface, one complete isolated reference integration compatible with the intended 3D Hollow Wake host, and reproducible correctness and performance evidence.

The central product is the theorycrafting loop: items, the passive tree including Vocations, skills, supports, the Reliquary and skill awakenings combine into distinctive builds whose actual combat matches their rules and previews. The goal is to carry that system into the evolving game without taking over its foundations or generation work.

A consuming game can create a character, edit its build, execute combat, award character progress and exchange admitted character data without adopting Hollow Wake's quest campaign, account model, save layout, database, or world-event framework.

Completion applies to the explicitly recorded source/content baseline and required capability list. Future changes to the original game do not silently expand the release. Original-game upgrades receive separate compatibility decisions.

## Required and optional boundaries

| Layer | Required for this delivery | Host or optional responsibility |
| --- | --- | --- |
| Combat | Statistics, conditions, resources, cast lifecycle, cooldowns, damage and defenses, statuses, procs, auras, skill-driven summons/companions and the effect families used by the agreed content baseline | Input, navigation, physics, spatial queries, entity spawning, rendering/audio, general AI, networking and world/campaign consequences |
| Character and Inventory | Attributes, build derivation, items/equipment, supports, mutators/skill trees, skill awakenings, passives, vocation selection/investment, learned and granted skill bars, Reliquary/relic contributions, containers, relevant crafting and inspection rules | Account identity, campaign unlock policy, vendor/quest orchestration, persistent storage and multi-character account services |
| Progression | Validated operations for XP, point budgets, rewards and vocation grants, with explicit host authorization and ownership | Why a reward is earned, which quest is available, campaign order and account-wide policy |
| Content | Versioned authored definitions, validation, compiled runtime packs, coverage of executable rules and stable identifiers | A database editor, external content services, new campaigns and automatic adoption of future game content |
| State | Clear ownership, detached inspection, validated character/build data import and export, safe application to live combat | SQL/filesystem operations, automatic saving, historical account migrations, distributed transactions and whole-World restoration |
| Events | Combat inputs, results and ordered signals needed for rules such as procs | A general event bus, world events, scripted campaigns, event persistence and scheduling unrelated to combat |

Character data import/export is a boundary a host may use for saving. It does not choose the host's save architecture. Complete live-combat replay/save restoration is a separate capability unless the agreed integration requires a specific existing continuation contract.

Quests, persistence, shared accounts and world-event extensions may call public character/combat interfaces. Required character/combat modules must not import those extensions. A minimal consumer must work with those extensions physically absent. Extension policies cannot become hidden default restrictions on a game that does not install them.

## Preservation and present state

- Preserve the public repository and all existing releases, evidence, authored content, adapters, branches and unfinished work. Do not delete or rewrite history to enforce the new scope.
- The published checkpoint is `d88a386ce479bbdd58665643dc9a6bb3057a015c`.
- The preceding 55-file final-vocation candidate is preserved. Its first full verification ended at an ambiguous deliberate-fault selector, before the reference phase. The selector correction passes the existing 17-fault ownership course; the original failure and source hashes are retained. A full regression rerun includes this correction and the new scope checks, without expanding quest features.
- Preserve the separately qualified 92-step vocation journey, new-save creation and original World payout comparisons as optional integration work. They do not become prerequisites for the core SDK release.
- Preserve the save-upgrade draft separately. It has type evidence only, no behavioral qualification, and a known aggregate-versus-record budget concern. Do not use it on real saves or expand it as part of this delivery.
- Keep current public APIs compatible while introducing the simpler supported composition. Existing optional packages remain available with their actual qualification levels.
- Preserve the original game checkout. The approved 3D integration receives an explicit adapter; this task does not automatically modify campaign, account or world systems.

## Milestones and acceptance

### 1. Lock the package boundary and remaining work

Produce a required-capability matrix from the existing completion inventory and installed exports. For each capability, identify its current implementation, original-behavior evidence, public entry point, live integration gap, native binding gap and exact remaining task. Reclassify optional work instead of treating every historical remaining entry as a release blocker.

Record the source/content baseline and primary host contract. The identified game is `D:/Games/Hollow-Wake`; its client uses Godot 4.7.2. Its documented combat integration is `D:/Games/Vesperwild-Combat`, with a Node host deciding combat and a Godot client drawing host state. Read and map the existing contact/delivery/wire contracts before implementing a new adapter. The bridge and SDK use different original-game captures, so compare the accepted semantics explicitly; do not assume their version labels establish compatibility.

Catalogue every required skill/support/item/passive/awakening/relic effect family; importing a definition is not proof that it executes. Select the representative performance workloads and capture starting measurements before fixing budgets.

Build a dependency check and minimal installed consumer that constructs a character and executes a cast with quest, account-save, SQLite and world-event packages absent. Audit existing account coupling and specify a host-supplied entitlement/relic projection where character rules need those inputs.

Exit: every required capability has a finite remaining task and acceptance case; optional dependencies are absent from the minimal consumer; the existing host contract and initial measurement plan are explicit. No open-ended instruction to extract the rest of World remains.

### 2. Finish the character-to-combat composition

Reuse the extracted implementations behind one documented composition interface. Provide character creation/admission, build and item inspection, Inventory actions, skill/support/mutator and awakening investment, passive/vocation investment, Reliquary contributions, direct host-authorized progression, and detached character data exchange.

Close the known integration gaps around equipment-granted skill editing, granted bar admission, account-supplied projections and applying build changes to current live actors. Reconcile identities and retired effects while preserving valid ongoing casts, cooldowns, resources and effect state. The host controls when an accepted change is published; a database acknowledgement must not be required by the core path.

Exit: a memory-only installed consumer can create, equip, invest, preview, cast, rebuild during combat, grant XP/points/vocation, unequip and reconstruct character data. Refused actions preserve owned state; malformed data and invalid grants are rejected. It runs without a quest book, account record or persistence coordinator.

Use at least three contrasting, fully composed builds to verify cross-system interactions, including worn items, passive/Vocation choices, supports, Reliquary contributions and awakenings. Compare derived stats, legal choices, preview results and resulting combat with the accepted prototype. These build courses complement, rather than replace, per-family coverage.

### 3. Close the required combat and content gaps

Use the milestone-one matrix to finish missing execution and host bindings for the agreed combat families. Reuse the current casting, hit, status, proc, aura, guard and companion implementations and their original-game comparisons. Separate general AI, geography and campaign death consequences from the combat cleanup needed for correct gameplay.

Validate every required content family against its implementation and host services. Unsupported operations must fail explicitly at admission or setup rather than appear to work. Preserve source ordering and random continuation where they affect accepted behavior.

Exit: every required matrix row executes through the composed public SDK and matches its accepted original behavior, with meaningful invalid-input, ownership and lifecycle checks. The package runs without original game source, hidden registrations or session-local test files.

### 4. Deliver one complete reference integration

Build the first complete reference adapter in the SDK's own examples/adapter area, against the identified Node combat-host/Godot-client split. Reuse and map the documented Vesperwild Combat seams; do not create a competing ground, delivery, server or campaign framework. Keep combat authority in the host and map input, spatial queries, spawned entities, combat signals and Inventory views through explicit services.

The reference scene supplies small deterministic ground/entity providers. It must work without a generated world, the Foundation repository, world streaming, campaigns or account services. Layered terrain reaches combat through the host's derived facts; the SDK does not import terrain generation or decide the game's geography. The real game can later replace these providers without changing build/combat rules.

Deliver a small reference scene that creates a character, changes equipment/supports/passives, previews resulting values, casts into host-confirmed contacts, advances timed effects and demonstrates the required effect families. Its default mode uses memory only. A second host-owned data-storage example shows replacement of storage policy without modifying SDK rules.

Verify fresh installation and a packaged/exported reference player. Install only the SDK distribution and chosen content; the consuming project must not need the source game or repository test workspace. Provide the mapping and adoption instructions for the real game without editing its changing foundations or another session's combat bridge. No communication with other sessions is implied by this plan.

Exit: the full required matrix is available through this adapter and the reference scene works in a clean consumer. Actual installation into the evolving `D:/Games/Hollow-Wake` game is a later adoption step when that project is ready, not a dependency for SDK completion. Existing Unity, Godot and Unreal previews retain their documented status; simultaneously completing all three ecosystems is not a condition of this first delivery.

### 5. Measure and optimize the composed workloads

Measure the same accepted outcomes before and after each optimization. Include ordinary character construction, mixed combat with many actors/effects, proc/summon-heavy combat, populated Inventory inspection, equipment/support/passive changes, and repeated create/dispose cycles. Record exact workload sizes, content, seeds, runtime versions and hardware.

Report CPU median/p95/p99, action latency, allocation rate, retained and peak memory, startup/content loading, and resource release. Include native/host costs where present, and separate SDK measurements from renderer costs. Run timing courses without competing heavy verification jobs.

Set numerical acceptance budgets after the first representative measurements and before optimization passes; retain those limits and the starting results. Fix measured bottlenecks rather than adopting SQL, a new language, ECS or a data layout merely by reputation. Retain the current editable-content/compiled-runtime separation. No database query belongs in the default per-hit path.

Exit for engineering release: reproducible workloads meet the recorded budgets on the available reference platform, and important regressions are either fixed or explicitly limit the supported workload. Steam Deck performance qualification requires an actual Deck run. Older phones/tablets remain a separately named-device optimization target, not an unlimited compatibility promise.

Hardware access is an external dependency. If it is unavailable, deliver an accurately labelled engineering candidate plus the runnable measurement package; do not call it Steam Deck/mobile qualified or keep expanding features while waiting.

### 6. Package and release the bounded SDK

Deliver versioned engine/content archives, the complete reference adapter and scene, a concise quick start, host-service contracts, API examples, a compatibility table and release evidence. Keep optional quest/account/persistence extensions in distinct documented entry points or packages. Do not silently stabilize internal diagnostic APIs.

Run the required repository verification and original-reference gates, installed-consumer tests, dependency-absence checks and selected engine player checks. Preserve the frozen accepted observations. Maintain applicable regression checks for existing supported packages without making unfinished optional features release requirements.

Exit: a clean project installs the SDK, exercises the complete agreed combat/Inventory capability matrix and can choose its own campaign, account and storage designs. Publish the qualified artifacts to the already-authorized public GitHub repository. No package-registry publication or relicensing is implied.

## Completion rule and progress reporting

This delivery is complete when milestones 1–6 pass for the agreed baseline and primary host, with the hardware qualification status stated separately. Quest campaigns, general event orchestration, whole-game saves, account migrations and additional complete engine adapters are follow-on projects. New features in those areas cannot be added as hidden completion requirements.

Each implementation update will state the current milestone, the remaining required capabilities, evidence passed/failed, any external dependency and any proposed scope change. A milestone closes with a usable artifact and its acceptance result. Test volume alone is not completion.

The user resumed milestone 1 on 13 November 2026. Continue using this plan and its bounded capability inventory. No automatic continuation should resume the old broad interpretation merely because the stored goal objective still says standalone gameplay SDK.

Host references inspected for this plan: `D:/Games/Hollow-Wake/README.md`, `client/project.godot`, the game charter and status, and `D:/Games/Vesperwild-Combat/README.md` plus `docs/00-contract.md`. They establish the current integration direction; this plan changes none of those projects and takes on none of their broader server, generation, campaign or record-keeping obligations.

## Retained workspace

No new worktrees or dependency trees are required for this plan. Retain these existing worktrees because they contain active or separately preserved work:

- `D:/Games/Claude/hollow-wake-engine`
- `D:/Games/Claude/ARPG Game - World/.claude/ownership.engine-m2`
- `D:/Games/Claude/ARPG Game - World/.claude/ownership.engine-native-stack`

The already-running verification owns temporary output under the active SDK's `.artifacts` directory. Keep active outputs until completion; remove only proven owned temporary directories afterward. Preserve evidence and unfinished sources.
