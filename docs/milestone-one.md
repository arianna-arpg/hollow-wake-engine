# Milestone one: baseline, boundary and first extraction

## Delivered

- A separate repository with the original license and explicit provenance.
- A reference pinned to commit `88e135e6c85d301ee7c0c3641f9fc2f92be0e140`,
  plus a hashed overlay preserving 31 relevant unfinished files. The snapshot
  contains 1,510 source/configuration files and excludes saves, personal settings,
  unrelated worktrees and media.
- An offline source capsule and reconstruction script, full per-file hashes, source dependency inventory,
  raw selected authored definitions and the complete exported stat catalogue.
- An executable path using real Magician, Lapis Ring, Arcane Practice, Ruin,
  Corrosion, Measured Blows and Ruin Studies content.
- Character-to-hit reference comparisons, generated stat transitions,
  independent arithmetic checks, isolation/continuation checks, negative controls,
  a packed-package consumer and repeatable performance tooling.

The original game checkout, index, saves and unfinished source were not edited.
The new repository's reference overlay is evidence, not a merge into the game.

## Evidence and its limits

The frozen game passes `npm run check` (game, launcher and simulation types) and
the smoke suite (five scenarios across five seeds). Its existing content warnings
include a walkable missing span and a monster with two signature defense pools.
The known broad-support no-op audit also prints its adjudicated cases. These are
recorded baseline observations, not changes made by this extraction.

The first build path is produced through the original `World.recalcPlayer`,
skill compiler, preview and cost methods. Contact traces call the original
`rollSkillDamage` and `applyHit`, with no active bond/status/pool defenses.
There are five build checkpoints, 72 ordinary contacts, 96 mixed numeric contacts,
and 240 stateful stat operations. Independent tests cover arithmetic and invalid states.

The packed consumer demonstrates that the implementation runs independently of
the game's checkout and startup registrations. It does not yet prove a second
game-engine integration or native runtime compatibility.

## Architecture decisions

1. **Keep content editable; compile runtime plans.** Authored JSON and source
   definitions remain the durable material. A configured build compiles to
   numeric tables reused across hits. A database is not needed for this first
   hot path. A later database may help large-catalogue authoring/querying, while
   runtime execution continues to consume validated, compact data.
2. **Make state ownership explicit before concurrency.** No process-wide RNG,
   mutable content registry or world-installed callback exists in the package.
   Immutable content is shared; character state, targets, caches and RNG are not.
3. **Use a narrow executable capability.** Arithmetic supports and a plain
   defender establish an end-to-end comparison without pretending to implement
   statuses, minions, spatial delivery or all defensive layers.
4. **Separate parity from intended redesign.** Reference tests detect changed
   behavior; independent invariants detect mistakes shared with a reference.
   Source-code structure need not remain identical. Intentional semantic changes
   get their own decision and cases rather than an unexplained new baseline.
5. **Defer the language/ABI decision until a host experiment.** This first
   implementation proves a JavaScript kernel and serializable contracts.

## Risk register and next steps

| Risk | Evidence | Next concrete resolution |
| --- | --- | --- |
| Combat authority is still inside a large `World` | `useSkill`, recalc, socketing and allocation remain world methods | Extract preparation/payment/commit/cancel/execute lifecycle through explicit host ports |
| Hidden import side effects | Sim boot imports geography and content registration modules | Replace registration side effects with explicit content loading and validation |
| Shared state in original helpers | Bag board source, actor ids, global sim tap/RNG | Give inventory, entity identity and observation streams explicit owners |
| Numeric parity may hide semantic defects | Existing warnings and scope-specific tests | Review ambiguous rules individually; maintain independent arithmetic checks |
| Selection is small | One character archetype and arithmetic skill configuration | Add a status-bearing skill and defensive-pool path with true time advancement |
| Point budgets are supplied | Full earning/unlock/vocation rules remain in game | Extract progression policy and graph legality against current source |
| Frozen working overlay will age | Captured unfinished work is tied to one moment | Review upstream changes against hashes; replace baselines only intentionally |
| Portability remains JavaScript-only | External consumer is Node | Implement one small native-host feasibility experiment before API stabilization |
| Hardware performance is unverified | Local kernel benchmark only | Run the same receipt-checked workloads on Steam Deck; mobile follows |
| Hollow Wake still uses its own implementation | No live adapter yet | Integrate a package-backed slice on an isolated game branch with rollback and gameplay checks |

Next milestone: extract the actual cast lifecycle and one time-dependent effect,
then prepare the Hollow Wake adapter. This repository remains the implementation
authority for extracted code; migration must avoid maintaining a permanent fork.
