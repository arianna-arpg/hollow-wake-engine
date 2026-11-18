# Prototype parity revision

This document records the November 16 mechanics baseline. The same release also
includes the separately captured [November 17 Inventory revision](prototype-revision.md),
which records the final source cutoff, updated inspection content and Decoy tag
change. Measurements below describe the November 16 payload unless stated otherwise.

This revision advances the combat and Inventory source capture from October 20
to November 16. The matched engineering release is
`combat-inventory-v0.2.0-preview.1`; published artifacts carry exact source,
package and verification identities. The October preview remains preserved.

The owner authorized this revision on November 17, 2026, before 3D integration
and major performance engineering. Source: prototype `main` at
`f1fc73a52abbe7055e60971ed15b8a0b38a97a23`. Later prototype commits require another
explicit review; unfinished working files remain with their owners.

## Preservation and audit

The SDK worktree is reused on `codex/sdk-prototype-parity`. Existing release
archives, October fixtures, original checkout, other worktrees and the Godot
project are preserved. The new source capsule is separate under
`baseline/prototype-parity`; it contains source and verification material, no
dependency install, saves or build outputs. Its extracted reference reuses the
already locked reference dependencies through a junction.

`audit.json` compares every captured path with the original source-lock's actual
hashes, including its working overlay. It records 512 changed files, 276 under
`src`, and the intervening 165 non-merge commits touching captured paths.
`declarations.json` expands mixed files into declarations. File classification
does not establish behavioral parity. `boundary-review.json` assigns all 820
changed declarations to a source-derived implementation, maintained SDK port,
host responsibility or optional system, with source/evidence hashes. Its
qualification status is separate from that review.

## Required work and acceptance

| Group | Required behavior | Acceptance |
| --- | --- | --- |
| Common rules | Independent status stack clocks, typed vulnerability, resistance-neutral ailments, attributed life payments, interception, single death, summon capacity grouping | Original-versus-SDK numerical and lifecycle courses |
| Archer and cast cycles | Held recruitment, arrival attacks, cap-qualified release, independent completed-cast cycles, mortars and elemental arts | Full/early/interrupted/exhausted release; supports, respec and death |
| Mage | Commanded rites, balanced selected schools, reconstruction and soul clocks, spell echo/relay limits, supported auxiliary kits | Commands, death/anchor, live support edits, captured-copy retirement |
| Warrior | Rally/pursuit, shield contacts, wound interception, relief, spectral heirs, cadence, marks, assassins and spellswords | Cohort ownership, attribution, cap rounding, no feedback loops |
| Bone Golem | Fighting/protective frames, life-paid hits, commands, reconstruction credits, shell direction, Reknit and terminal protection | Paid contribution once, cancellation/death/respec, active kit compatibility |
| Firebolt and projectile arts | Satellite/ignition trees, actual equipped-item count, orbit/emission/expiry, ailment attraction and recovery | Live limits, source identity, no catalogue mutation, supported payloads |
| Timing and devices | Composed strike timing, ground trap contact and arming, mine commands, rooted movement struggle | One timing attempt, actual movement segments, no teleport contacts |
| Vocations and inheritance | Gravebinder pacts, five tactical trees, choices, family changes and Sylvan stat inheritance | Trusted grants without quests/accounts; point legality and retirement |
| Character/Inventory | School choices and node actions, previews/support census, Relic sale/salvage semantics, bounded Echoing Might | Memory-only round trip, preview/commit equality, live combat continuity |
| Shared fixes/content | Current monster damage/mana/skills, targeting and cooldown fixes, portable effect identities | Classified rule deltas and representative encounter courses |

General NPC planning, world generation, campaign, accounts, persistent save
transactions, menus and renderer implementations remain host-owned or optional.
Combat-driven summon tactics and required effect state are not excluded under
the general-AI or presentation labels. Existing optional APIs remain available.

## Verification and publication

Capture new expected observations from the pinned prototype independently of
the SDK. Do not overwrite October recordings to obtain a pass. Compile current
content and execute it through the SDK's public character/combat owner, with
quest and persistence modules physically absent. A current tree in JSON alone
is not acceptance. Run the maintained old regressions, relevant new prototype
courses, installed-consumer/type checks, and the required full SDK/reference
gates before publishing a newly versioned matched package set.

Performance measurements follow functional parity, using the same workloads and
outcomes. No native/mobile or new performance claim is made by this revision.

## Verification evidence

The installed November package now passes 58 public combat courses and 52,533
exact state/detail comparisons in each of two fresh processes. This includes
the revised Archer, Conclave/Lich, Sentinel/Duelist/Spellsword and Bone Golem
paths; projectile arts, device clocks, composed strike timing, layers, pacts,
doctrines and Sylvan inheritance. Supplementary courses assert that Burial
Ground creates its waves and Packwarden commands a successfully tamed companion.
The corpse-rite and workshop-relocation additions independently create a corpse,
consume it with Bone Offering, and reposition both Flame Totem and Ballista
Sentry repeatedly without resetting device health, lifetime or clocks. They
caught and now guard missing cast-target metadata and a disconnected command
identity map. These are deterministic courses, not exhaustive combinations or
general AI.

The current catalogue smoke course exercises 1,035 authored skills with no
execution failures and 17 explicit refusals for missing host services. This
is assembly coverage, not independent original-equivalence evidence. The owner
inventory follows lexical bindings, verifies the current service graph and
rejects a deliberately removed relocation identity map. October's runtime
courses continue to exercise its original content profile.

Eight character/Relic courses compare 20 checkpoints. Installed consumers also
replay 12 character commands and portable school-choice round trips. The current
five-package installation passes strict public types and adapter inspection with
66 optional quest/account/persistence files physically removed.

Three additional installed courses route timing input, mine commands and Bone
Golem dismissal through the Node adapter's input queue, matching 1,020 recorded
post-update states per fresh process. The timing observer's original 300 ms
setup is applied directly; its subsequent timing input uses the adapter's
bounded live frames. Trusted environment services also reach the combat owner.

Summon observer revisions are retained. Revision 1 mishandled native empty
sockets, cast recovery, command selection and safe-hub pact input. Revision 2
enabled unrelated ambient scene spawning. Revision 3 isolated the pact's combat
zone input. Revisions 4 and 5 isolate optional loot generation and its XP toast;
the latter's cosmetic jitter consumed a random draw. Combat death, corpses,
credit, pacts and doctrines remain original. The selected `summons-v5` fixture
is independently reproduced in two original processes, never edited expectations.
The empty-room test adapter matches the original scenery sweep's 1e-7 movement
threshold; combat assertions still use exact values, with no numeric tolerance.

`layers-v2` corrects an observer that returned a physical pose without applying
it to the original actor. The original layer recording remains preserved.

The first `rules` observer incorrectly set `flying` without `flyingBase`, so the
prototype grounded the supposedly flying target on its first timer tick. That
input differed from a native SDK flying body. Preserve that recording and use
the separate `rules-v2` observer, which sets both flags as original monster
creation does. Expected combat outcomes were not edited to fit the SDK.

The original `packSkillGemPayload` omits `summonSchools`; its live instance keeps
them. The SDK intentionally preserves admitted live choices in portable skill
and grant data. `character-v2` detects action changes from the live instance;
the first observer incorrectly inferred acceptance from the incomplete original
export. Both recordings are retained. Character tests compare all other data
exactly and compare portable choices to the independent live observation.

Current character JSON measures 8,481,219 bytes versus 8,372,770 bytes for October
(+1.30%, before the trailing newline). The November profile has an explicit
8.25 MiB content gate; the October gate remains 8 MiB. This is a content-size
measurement, not a claim about resident memory, frame time or mobile readiness.

The minified character browser IIFE closure is 267,021 bytes with October content
and 274,816 with November content; the installed ES module closure is 274,857.
The maintained rule changes already put the
October closure above the old 256 KiB limit. The explicit new bound is 272 KiB;
this records the increase rather than describing it as an optimization.

The engine archive contains 1,874,702 raw JavaScript bytes. The separately
reviewed shared-rule additions account for 15,298 bytes across 32 modules,
bounded individually and at 16,768 bytes combined in `package-growth.json`.
Statistics add 316 bytes under a separate 512-byte allowance. Historical
component ceilings still apply to the remaining bytes; package reports label
this accounting and retain actual whole-archive totals. Combat and character
composition retain their existing separate whole-module ceilings. These raw
code figures exclude the authored content and do not measure resident memory.

Clean cross-platform verification caught two compatibility details. Reproduction
now checks the accepted compressed archive hash and exact decompressed content
separately, because gzip output can differ across platforms and zlib versions.
Accepted recordings remain unchanged. Status creation and refresh add optional
metadata only when used, preserving October's absent properties even inside
synchronous host callbacks. Stronger effects clear existing visual state without
creating empty fields. Its individual code-growth
allowance is 2.5 KiB; the combined rule allowance remains 16,768 bytes.

The legacy Godot workshop bundle measures 105,657 bytes. Portable school choices
and optional Relic retirement require a separate 2 KiB addition to its prior
102 KiB ceiling (104 KiB combined). Its four variants must still replay the same
56 original commands; private-property renaming and wire-field rules are unchanged.

The old sequence-continuation control still compiles against its exact frozen
port declaration and output hashes. A separate reviewed revision permits only
the new source-attribution helper and the two affected ordinary methods;
continuation storage and every other ordinary member remain unchanged.

Seven maintained extraction outputs also have explicit before/after hashes in
`maintained-extractions.json`. Their original generators still reproduce the
frozen October checksums; the maintained ports must match the separately reviewed
November bytes. Every other mechanically extracted file still requires exact
equivalence. Public combat courses verify the revised composed behavior.

The preserved optional account/Relic consumer measures 188,975 browser bytes.
Shared school-choice and Relic rules require a separate 1 KiB allowance over its
previous 184 KiB ceiling (185 KiB combined). This preserves the optional package;
it adds no account dependency to the required combat/Inventory graph.

Run `npm run verify:parity` for the current profile, in addition to `npm run
verify` and `npm run reference:verify` for the preserved regression contract.
Run `npm run reference:parity` to independently reproduce the current content
and selected original-game recordings twice without changing accepted fixtures.
The standalone distribution builder accepts `--prototype`; release
`0.2.0-preview.1` selects the current source through its checked configuration.
Local verification covers all 150 SDK gate commands on the final runtime,
and a final 2,635-test unit pass. The full original-reference gate passes,
including 43 combat reference checks. The retained SDK composition passes 68
combat checks across 70 required families. Clean GitHub verification and tests
of the assembled archive control publication. Local evidence is recorded in
`evidence/prototype-parity/verification.json`.

The current desktop measurements and compressed raw records are in
`evidence/prototype-parity/measurements.json` and its companion archive. Release
assembly rejects a portable executable whose hash differs from the measured
one. Previous performance receipts are labelled historical in the new package.
This revision establishes a new baseline; it makes no whole-SDK speedup claim.

Canonical Relic retirement must be synchronous and all-or-throw. The session
rechecks custody at commit, rejects asynchronous return values, and quarantines
failed publication. A host callback that performs an external partial write
before failing needs its own transaction; the SDK cannot undo that write.

## November desktop baseline

These measurements qualify the preserved November 16 payload. The
[November 17 revision](prototype-revision.md) has a separate capture and must
carry its own matching measurement receipts in the final release.

Seven fresh Node 24.9.0 processes on an Intel Core i9-10900K, Windows, with
the compile cache disabled. SDK test jobs were stopped; other desktop
applications were not controlled. Values below are medians of the seven
per-process medians/p95s, in milliseconds, not pooled percentiles.

| Workload | Median ms | p95 ms |
| --- | ---: | ---: |
| mixed-32 | 0.743 | 2.767 |
| mixed-128 | 2.781 | 10.020 |
| summons-procs-32 | 1.345 | 2.568 |
| build-combat-32 | 0.855 | 2.659 |
| build-edits | 55.966 | 64.408 |

Cold content import has a 1373.9 ms median. The 1,000-cycle
create/advance/close probe retains 537,160 additional heap bytes after collection;
its cumulative process peak is 542.9 MiB RSS. The latter includes shared
content and transient peaks, not only live character state. These figures identify
content initialization, build-edit batches and memory as further engineering
work. They are not Steam Deck/mobile or whole-game frame-budget qualification.
Renderer, socket transport and JSON wire encoding remain outside these timings.
