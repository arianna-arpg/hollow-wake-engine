# Combat and Inventory delivery boundary

The current delivery is the theorycrafting and combat SDK: equipment, passives
including Vocations, skills, supports, Reliquary effects and awakenings combine
into an owned character build used by combat. The
[completion plan](combat-inventory-plan.md) governs this work. The historical
[completion inventory](completion.json) remains evidence; its optional campaign,
account and persistence entries are not prerequisites for this release.

## Finite acceptance inventory

[combat-inventory-capabilities.json](combat-inventory-capabilities.json) records
27 required capability groups, their existing public entry points and evidence,
and one specific remaining task and acceptance condition per group. Its export
inventory classifies all 141 current paths. A new public path requires a scope
decision instead of silently enlarging the deliverable.

The baseline is the committed source and working overlay in
`baseline/source-lock.json`, at original commit
`88e135e6c85d301ee7c0c3641f9fc2f92be0e140`. The existing catalogue contains 14,434
rows in 20 registries. The scope check inventories authored fields, nested
discriminators and captured source rules. It assigns all 52 top-level skill
effect types and 18 delivery types to required capability work and host services.
These counts describe content, not proven executable coverage. The composed
courses must close those assignments in milestone 3.

Town portals and terrain effects illustrate the boundary: the SDK may request
a host action, but does not gain authority over towns, campaign destinations,
world generation or saved geography. A host can report the action unavailable.
Combat signals and procs remain required; a general world-event framework does not.

## Required independence

Quest campaigns, shared account services, durable coordinators and databases
are optional extensions. Extensions may consume the rules; required character
and combat construction must not require an extension owner. Time, randomness,
spatial queries, input, bodies and presentation have explicit owners.

The authored builder already accepts `features`, `relicEnabled`,
`relicEmpowerment` and supplied container bodies. These are a host-authorized
projection of build inputs. They are not an account record or permission to
write one. The standalone composition must preserve that distinction. Item
identity and legal spending remain validated even in a memory-only host.

The audit exposes four current integration debts:

| Boundary | Existing coupling | Required resolution |
| --- | --- | --- |
| Vocation grants | `progression/vocations` combines quest generation with grant behavior; grants require a run ledger and optional account callbacks | A character grant/investment entry independent of campaign ledgers, preserving the existing optional API |
| Skill actions | Investment and awakening ports include Font access, positions, presentation and dirty notifications | A composed action boundary with explicit host policy and live effects |
| Crafting session | In-memory operations retain SDK save-envelope and account-save event conventions | Consume rules without requiring that save architecture |
| Complete character orchestration | The broader internal owner is account-shaped and durable composition is separate | A standalone character facade that applies changes to current combat state |

No new runtime implementation is introduced by this milestone. Existing APIs
remain available, including optional quest and persistence work.

## Reproducible boundary checks

After building, run:

```sh
npm run check:sdk-scope
npm run test:sdk-independent
```

The scope command checks the exact baseline and export inventory, traverses both
runtime and type dependencies, validates family assignments, and rejects
deliberate runtime/type extension imports, a database import, an unclassified
export and an unassigned effect family. It records the complete dependency and
content census in `.artifacts/combat-inventory-scope.json`.

The installed consumer packs the engine and its existing authored-build factory,
installs them offline, and removes optional entry modules and declarations from
that disposable installation. The original archive is unchanged. It exercises
a configured Magician with equipment, a passive, two supports and a skill-tree
node through paid casting, confirmed contact, timed damage and Inventory. It
also opens and rebuilds an authored character without an account owner.
Fresh controls and a deliberately introduced missing account import verify the
absence boundary; the restored control must pass. Owned temporary files are
removed on success or failure.

The ordinary configured cast and the broader authored builder are currently
separate APIs. This course does not claim complete character-to-combat
composition, every effect family, target-device performance or a native package.
Those remain the explicit milestone tasks in the capability inventory.

## Primary integration and performance boundary

The intended game is `D:/Games/Hollow-Wake`. Its documented arrangement is
Vesperwild Combat's Node authority and a Godot 4.7.2 drawing/input client. The
existing bridge uses original capture `fabb2a4c`; its contact/delivery/wire
contracts must be compared with this SDK baseline before replacement. Neither
project is modified by this audit. The SDK reference adapter uses deterministic
ground and body providers and is complete independently of generation progress.

The capability inventory fixes the initial measurement workload shapes: build
edits, 1/16/64-actor combat, proc/summon combat, 64/256-item inspection and repeated
creation/disposal. Numerical budgets follow measured baselines, before
optimization. CPU percentiles, latency, allocations and retained/peak memory are
reported separately. No timings are inferred from dependency counts. Physical
Steam Deck and named mobile runs remain separate qualification.
