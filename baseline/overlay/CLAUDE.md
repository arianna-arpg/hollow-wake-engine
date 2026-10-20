**Current scope:** [CURRENT.md](CURRENT.md) is the project direction and active/deferred work entrypoint. Deliver the offline seamless generation/content/event vision; new shard/MMORPG work is deferred. Prepare useful future boundaries without letting hosting dictate this phase. Existing zone content and the owner's game references are examples and reusable material, not generation laws. This priority supersedes conflicting older roadmaps and hosting handoffs.

Generation must select and combine varied possibilities: sites, objectives, points of interest, events, locations, quests, unbounded objectives, and retained bounded zones with their authored objectives are examples, not mandatory templates or a closed list. The hierarchy **world map → regions → zones → chunks** organizes geography; it does not prescribe each place's gameplay. Read [the current generation decisions](docs/ai/gameplay-decisions-20261019.md#retained-zones-inside-continuous-terrain) before world/content work. Game-camera zoom follows main's fixed scale; map navigation is separate. Live cast aiming is an unused authoring opt-in, not a change to existing skills.

Main is the shared-content baseline. Incorporate its changes into seamless with real merges, not copied commits. Follow [the branch integration policy](docs/ai/branch-integration.md); every published main change is verified and merged by the sync-main workflow. Preserve unfinished work in other checkouts.

The [current gameplay decisions](docs/ai/gameplay-decisions-20261019.md) are authoritative for approved features, reversions, defaults and pending choices. They supersede the earlier main/seamless comparison. This is `arianna-arpg/arpg-game-world`; the separate MMOARPG project is outside this work. Verify the behavior being changed with the relevant existing checks; historical probe counts and branch paths in older notes are not current delivery requirements. Main keeps its zone loop while seamless owns continuous geography and hosting.

The playable Mu loading-screen foundation is documented in docs/ui/loading-screen.md.
LoadingScreen provides token-owned status, cancellation, retry and input isolation;
SpiritRun is a rewardless pastime with soul-flames, branching rune gates and currents.
Main's withLoadingScreen wraps its existing class-entry and Continue flows without
importing seamless world or save machinery. The seamless branch additionally owns
native-page readiness. Reuse the lease for future disruptive preparations; never
delay readiness or grant gameplay rewards. Verify spiritrun, all types, boot smoke
and balance/loading-screen-ui.cjs after an isolated build.

# CLAUDE.md — Hollow Wake (ARPG)

Minion critter targeting, Charge's ground wake and life/mana orb pacing are
documented in [combat-polish](docs/design/combat-polish.md). Verify
probe_miniontargets, probe_orbgeneration, companionstance, flasktrees and
movementvisuals; build before the hidden movement-visuals UI harness.

Storm, summon and construct identities use `data/skillPresenceVisuals.ts`
and `render/vis/skillPresenceVoice.ts`: 139 explicit source profiles.
Births, completed actions, real aura/construct pulses and actual retirement
own their cues. `ActorW.presenceBadge` copies source identity; ground-qualified
`FlashW.onGround` clips impacts to the warning's terrain and floor gates.
See `docs/design/presence-skill-visuals.md`. Verify presencevisuals, skillflights,
selfvisuals, effectvoice, cosmetics, payloadcues, companioncues,
companioninheritance, summonfill, clutch, cistern, scaldkit, supportfabric,
all types and sim smoke; after build, run hidden `balance/presence-visuals-ui.cjs`.

Spell preparation uses `data/skillCastVisuals.ts`: shared school/summon styles,
semantic fallbacks and explicit exceptions (Quickstep is intentionally retained).
Every spell resolves without a finished-effect registry entry; attacks keep their
native animations and functional readiness. Body-centered art is local-player/
couch only, respects the saved Wardrobe toggle, and follows the real cast clock.
See `docs/design/seamless-visual-sweep.md`; verify playercastvisuals, castingcues,
cosmetics, all types and sim smoke, then the hidden caster-vessel-ui and
seamless-visual-sweep-ui (on seamless) client courses after an isolated build.

Self, mark and detonation identities use `data/skillSelfVisuals.ts` and
`render/vis/skillSelfVoice.ts`: 106 self skills and three dedicated deliveries.
Casting cues carry optional host-resolved source identity; stored power uses
`engine/skillSelfVisual.ts` and copied `ActorW.selfBankCues`. Release hooks stay
with real execution, consumption, mine timers and ward expiry. Existing rites
and guard/status semantics remain authoritative. See `docs/design/self-skill-visuals.md`.
Verify selfvisuals, castingcues, targetvisuals, movementvisuals, payloadcues,
companioncues, defensecues, guard, effectvoice, all types and sim smoke;
after build, run hidden `balance/self-visuals-ui.cjs` for the interactive study.

Movement identities use `data/skillMovementVisuals.ts` and
`render/vis/skillMovementVoice.ts`: 21 dashes, 14 leaps, nine blinks and one carom.
`engine/skillMovementVisual.ts` carries bounded actual-travel histories; blink
endpoints and leap impacts reuse the effect-voice registry. No predicted travel.
See `docs/design/movement-skill-visuals.md`. Verify movementvisuals, fourthwall,
scaldkit, movementtether, devotedstartertrees, cosmetics, skillflights,
strikevisuals, effectvoice, supportfabric, all types, sim smoke and hidden
`balance/movement-visuals-ui.cjs` after the movement probe and build.

Melee and non-beam cone identities use `data/skillStrikeVisuals.ts` and
`render/vis/skillStrikeVoice.ts`, clipped to actual reach, angle and safe centers.
Four lightning flights add bounded, measured travel afterimages through
`engine/lightningVisual.ts`; chain turns follow actual projectile movement.
`docs/design/strike-skill-visuals.md` covers profiles, aftermath and co-op.
Verify strikevisuals, skillvisuals, skillflights, crossjab, devotedstartertrees,
supportfabric, cosmetics, effectvoice, projectilecull, all types, sim smoke and
hidden `balance/strike-visuals-ui.cjs` after the strike probe and build.

Targeted casts, tether bands and offerings use `data/skillTargetVisuals.ts`
and `render/vis/skillTargetVoice.ts`. Distinct marks and motion survive recolor;
links stay clipped to actual widths and replicate as paint-only DTOs.
`docs/design/target-skill-visuals.md` covers the recipient/consumption hooks.
Verify targetvisuals, corpse, devotedstartertrees, supportfabric, feedingcues,
resourcevisuals, effectvoice, cosmetics, projectilecull, sim smoke and hidden
`balance/target-visuals-ui.cjs` after the target probe and build.

Resource pickups, siphons and measured leech returns share geometry in
`data/resourceVisuals.ts` and `render/vis/resourceFlowLayer.ts`; bounded transfer
receipts extend feeding cues and co-op snapshots without changing payout timing.
Coverage and the remaining visual sweep live in `docs/design/skill-visual-sweep.md`.
Verify resourcevisuals, feedingcues, defenses, grab, cosmetics, skillflights,
sim smoke and hidden `balance/resource-visuals-ui.cjs` plus feeding-cues-ui.

Native nova identities use `data/skillVisuals.ts` and `render/vis/skillBurstVoice.ts`.
Projectile, beam, ground and aura identities extend this through
`data/skillFlightVisuals.ts` and `render/vis/skillFlightVoice.ts`; the shared
`engine/skillFieldVisual.ts` paint surface also ships field warnings to peers.
Shared prominence, authored silhouettes/motion, true shape/safe-center clipping,
aftermath inheritance and co-op footprints are documented in `docs/design/skill-visuals.md`.
Verify `probe_skillvisuals.ts` plus effectvoice/crossjab/cosmetics/supportfabric,
sim smoke and the hidden `balance/skill-visuals-ui.cjs` after the probe and build.
For flights/fields also run skillflights, projectilecull and the hidden
`balance/skill-flight-ui.cjs` (after both catalogue probes and build).

Shared sight/fog rendering fixes are documented in `docs/engine/visibility-stability.md`.
Resolve visibility before drawing bodies; wall queries and pixels share one contact
resolver. Verify the sightveil/visibility_stability probes and hidden
`balance/visibility-ui.cjs` (including its old-code negative control).

Browser branch previews: `docs/engine/browser-previews.md` documents the Pages
deployment. `scripts/browser-previews.json` configures isolated builds beside
`/play/`; `scripts/build-browser-previews.mjs` pins their commits and refuses
shared save namespaces. Verify `node --test scripts/test-browser-previews.mjs`.
Regional variety uses `data/adventureGrammar.ts` / `adventureForms.ts`,
new `engine/adventureDistricts.ts` builders, and the deterministic structural
critic in `world/generationDiversity.ts`. Verify `probe_generationdiversity.ts`
and its finished-grid contact sheet; form changes preserve base stage rules.

Adventure regions, local bounty boards and permanent optional passages are
documented in `docs/worldgen/adventure-regions.md`. Content lives in
`data/adventureLocales.ts` / `adventureRegions.ts`; `bountyPassages.ts`
owns access commissions. Verify `probe_adventureregions.ts`, related
locale/complex/bounty probes, genqa and hidden `balance/adventure-regions-ui.cjs`
after the probe and build.


Legendary skill empowerment is documented in `docs/design/legendary-skill-empowerment.md`.
`data/skillEmpowerment.ts` configures duplicate merges and passive-only rewards;
`engine/skillMerge.ts` shares the Font preview/action plan. Saved ranks extend
explicit passive slots without expanding branch budgets. Verify `probe_skillempowerment.ts`,
skill/ability-economy regressions and hidden `balance/skill-empowerment-ui.cjs` after a build.

Shield Up's native guard and cast-absorb disciplines live in
`data/shieldUpTree.ts`, with configurable contracts in `engine/guardArtsSpec.ts`.
`docs/design/shield-up.md` covers plates, voluntary ram contact, bash waves,
owned absorb layers, outcome satellites and saved lethal-intervention recovery.
Verify `probe_shieldup.ts`, guard/bash/parry/satellite regressions and the hidden
`balance/shield-up-ui.cjs` harness after a build.

Golem capacity and type exclusivity are independent summon settings in
`engine/summonContracts.ts`. All major golems, including Stone, remain reserved;
Gather Rubblekin adds a separate flock with melee-triggered projectile releases.
See `docs/design/living-rubble.md`, `data/rubblekin.ts` and `rubblekinTree.ts`;
verify the landslide probe and hidden `balance/landslide-ui.cjs` after a build.

Selectable attribute training is documented in `docs/design/passive-attributes.md`.
The 136 pure attribute nodes use `data/passiveAttributes.ts` choice groups;
owned builds retain their former attributes through `allocatedDefault`.
Verify `probe_passiveattributes.ts`, the other passive probes and the hidden
`balance/passive-attributes-ui.cjs` editor/click walkthrough after a build.
Dev → Gems can ignore the local hero's skill attributes for one run via
`World.devIgnoreSkillAttributes`. Verify `probe_castreq.ts` and the hidden
`balance/dev-skill-attributes-ui.cjs` walkthrough; costs and cooldowns still apply.

Ten-rank vendor investment, curated affixes, paged shelves and mixed writ/cash
bounty choices are documented in `docs/design/vendor-investment.md`. Tuning
lives in `data/vendors.ts` and `data/bountyRewards.ts`; verify
`probe_vendorinvestment.ts` and hidden `balance/vendor-investment-ui.cjs`.

Sacrificial Font passive refunds use `engine/passiveRefund.ts` for shared path,
root, gate and point-pool validation. See `docs/design/passive-refunds.md`;
verify `probe_passiverefund.ts` and the hidden `balance/font-passives-ui.cjs`.

Paged Relic storage and personal Immortal lockers share `engine/stash.ts`
and `data/stashes.ts`; see `docs/engine/stashes.md`. Storage capacity is
independent from equipped Reliquary expansion and empowerment. Verify
`probe_stash.ts` and `balance/oracle-rescue-ui.cjs` (grid gestures and reload).

Account Relic ownership, separate Oracle storage, standard Vault Reliquary
investment and attributable Relic followers are documented in
`docs/design/account-reliquary.md`. Tuning lives in `data/reliquary.ts`;
`engine/accountReliquary.ts` owns migration and `engine/relicPower.ts` the safe
numeric fold. The inventory toggle trades equipped power for 2% XP per occupied
cell; empowerment grows by 2% per account rank. Pack Relics are lost on death;
equipped/stored Relics persist. Verify `probe_relicdeath.ts`, `probe_relicflow.ts`,
`probe_accountreliquary.ts`, `probe_reliquary.ts`,
`probe_relicuniques.ts` and `balance/oracle-rescue-ui.cjs`.

Relic affix progression uses one normal tier and an optional magic-only
exquisite tier, both available at each family's debut. `RELIQUARY_CFG.affixTiers`
and `affixDebut` separate fixed budgets from discoveries through level 24;
conditional play styles use existing actor conditions and victim tags.
See `docs/design/account-reliquary.md`; verify `probe_accountreliquary.ts`
for debut gates, level-independent values, saved tiers and scoped empowerment.

Unique Relic pool: eighteen identities, rolled summon/construct families and
configurable equipped-copy limits are documented in `docs/design/relic-unique-pool.md`.
Content lives in `data/uniques/relicPaths.ts`; `engine/itemLimits.ts` shares
identity checks across landing, first-fit actions and saved-board repair.
Verify `probe_relicuniques.ts` (including `relicExpansionChecks.ts`), the
account/reliquary probes, legends and the hidden Oracle UI harness after a build.

Oracle rescue and account-wide relic access are documented in
`docs/design/oracle-rescue.md`. `data/oracle.ts` and `QuestDef.rescue` configure
captivity, residency and grants; `engine/questRescues.ts` validates completion.
Verify with `probe_oraclerescue.ts`, `probe_oraclerefinement.ts` and
`balance/oracle-rescue-ui.cjs` (both lives). Selection rewards use
`QuestReward.skillChoice` and `isSkillUnlockedForSelection`, separate from drops.
Town growth folds on arrival; Oracle residency requires village size.

Brandt's hammer/trophy quests and deferred, level-fixed imbues are documented in
`docs/design/brandt-progression.md`. Content and tuning live in `data/brandt.ts`
and `quests/brandt.ts`; `engine/questImbue.ts` owns saved affix offers. Verify
with `probe_brandtquest.ts` and the hidden `balance/brandt-quest-ui.cjs` harness.

The website cinema (the banner's trailer, the first-arrival/weekly splash and the
shatter exit) is a registry at the top of `site/assets/cinema.js`; the theater is
`site/assets/cinema-theater.js`, films live in `site/media/<film>/` and
`scripts/encode-film.mjs` builds their rendition ladder. Re-point, schedule or
split films there; bump the page's `?v=` stamp when either file changes. See
`docs/design/site-cinema.md`; verify with the hidden `balance/site-cinema-ui.cjs`.
Skill showcases: any element wearing `data-skill-showcase` plays that skill live,
always matching the build; where showcases appear is each surface's choice
(today one temporary seat, the bag gem tooltip). `src/showcase/` + `showcase.html`
(a sandboxed engine realm that never saves) + `data/skillShowcase.ts`; see
`docs/engine/skill-showcases.md`, verify `probe_skillshowcase.ts` and the hidden
`balance/skill-showcase-ui.cjs` after a build. The site's skill clips
(`scripts/capture-skill-clips.cjs`) film the same stages into `site/media/clips/`;
`publish-site-media.mjs --pack clips` ships them as one release archive.
Gameplay capture: `src/agent/` (HeroAgent, a PlayerInputSource: percept, scripted
orders over a utility pick, a hand per cast mode) drives a seat through
`World.applyInputs`; `src/director/` stages ShotSpec JSON (zone mint, sim build,
spawns, camera, cues, held clock) and `scripts/capture-gameplay.cjs` films it.
See `docs/engine/agent.md` and `docs/engine/director.md`; verify `probe_agent.ts`.

Guidance for Claude Code working in this repository. This file is committed and
shared with everyone who clones the repo.

Support item and vendor tooltips show live equipped-skill compatibility through
the shared socket gate. See `docs/ui/support-tooltips.md`; verify with the hidden
`balance/support-tooltips-ui.cjs` harness after a build.

Parry retaliation windows and actual projectile reflection are documented in
`docs/engine/parry.md`; `balance/probe_parry.ts` pins the shared recipient cooldown,
typed returning damage, defensive preservation and symmetric ownership transfer.

Maddening Miasma's madness bank is documented in `docs/engine/madden.md`: one
per-frame dwell ledger per skill instance (`MaddenBank`), worn by every standing
placement and spent by each madness. The gem gates on `surface:standing`; the
matrix measures dwell payloads on the held lane (`DWELL_SUPPORT_FIELDS`). Verify
`probe_madden.ts` and `matrix check --support maddening_miasma`.

## What this is
**SHOW, DON'T TELL — absolute gameplay-signaling law.** Convey mechanics,
danger, escalation and counterplay through visible world behavior, animation,
effects and sound. Do not add explanatory combat captions, instruction banners,
text countdowns or prose tutorials to make a gameplay mechanic legible. The
player must be able to read and respond to the event without reading text.
Tie cues to the actual affected place, timing and outcome; intensify them as
the event develops and visibly release them when it is avoided or interrupted.
`docs/design/combat-readability.md` records the names/states/counters policy
and the removal of pack subtitles and explanatory combat prose.
GT-001/002 exhaustion replacements are documented in `docs/design/exhaustion-cues.md`:
inherited configurable retreat gasps and status-driven Fumelung gasping,
verified by `probe_exhaustioncues.ts` and `balance/exhaustion-cues-ui.cjs`.
GT-003–006 body/defense cues and shell anatomy profiles are documented in
`docs/design/defense-cues.md`; verify `probe_defensecues.ts` and the hidden
`balance/defense-cues-ui.cjs` harness after a build.
GT-007–010 combat outcomes, parry openings and reflected-flight cues are documented
in `docs/design/combat-outcome-cues.md`; verify `probe_combatcues.ts` and
`balance/combat-cues-ui.cjs` after a build.
GT-011/012 live guard-release footprints and coordinated-maneuver gestures are
documented in `docs/design/warning-cues.md`; verify `probe_warningcues.ts`,
`probe_encountercombat.ts` and `balance/warning-cues-ui.cjs` after a build.
Player ailments use independent simultaneous blood drips, kindling, poison haze
and curse layers, each scaled by its own severity with a shared clutter budget. See `docs/design/affliction-cues.md`; verify
`probe_afflictioncues.ts` and `balance/affliction-cues-ui.cjs` after a build.
Impale's lodged metal body spikes and player screen-edge spikes share configurable
parts/materials in `data/impaleCues.ts`. See `docs/design/impale-cues.md`; verify
the afflictioncues and cleave probes plus hidden `balance/impale-cues-ui.cjs`.
GT-019 cast interruptions, concentration fizzles/refocus and held completion
use reusable geometry documented in `docs/design/casting-cues.md`; verify
`probe_castingcues.ts` and `balance/casting-cues-ui.cjs` after a build.
GT-022 Doom uses a bank-driven iris, fixed-fuse arc, true blast boundary and
pinch/tear rupture, shared across actors and co-op. See `docs/design/doom-cues.md`;
verify `probe_doomcues.ts` and hidden `balance/doom-cues-ui.cjs` after a build.
GT-022's other outcomes and GT-035 source-linked wards are documented in
`docs/design/combat-threat-cues.md`. Shared readiness profiles, Last Gasp's
life-orb spark and ward armor use `data/combatReadability.ts`; verify
`probe_combatreadability.ts`, `probe_ironbell.ts` and `balance/combat-readability-ui.cjs`.
Author cues as reusable, configurable data. Undead nights demonstrate this with
disturbed soil and grasping hands at committed emergence sites (`groundRising`).
GT-034 combination completion uses matching body/HUD profiles in `data/comboCues.ts`.
`comboReadout` shares consume-aware progress across tells, HUD and all-actor co-op;
see `docs/design/combo-cues.md`, `probe_combocues.ts` and `balance/combo-cues-ui.cjs`.
GT-020 reserve depletion and sustained vents use `data/reserveCues.ts` profiles.
Body recovery windows and damage-pool footprints/HUD exhaust follow actual fuel;
see `docs/design/reserve-cues.md`, `probe_reservecues.ts` and
`balance/reserve-cues-ui.cjs` after a build.
GT-021 prepared drinks, ammunition and placed routes share `data/payloadCues.ts`
profiles. `payloadCueRows` mirrors paid banks and committed ambush geometry;
see `docs/design/payload-cues.md`, `probe_payloadcues.ts` and the hidden
`balance/payload-cues-ui.cjs` harness (run the probe and build first).
GT-023 stored and consumed payloads use `data/procCues.ts` material profiles.
`procCueRows` shares real stack/rune banks and releases across body, HUD and co-op;
see `docs/design/proc-cues.md`, `probe_proccues.ts` and hidden
`balance/proc-cues-ui.cjs` (run the probe and build first).
GT-024 weakpoint windows, independent part pools and segment wounds share
`data/anatomyCues.ts` materials. Body seams, exact bar bands, life-orb rim marks
and permanent break scars follow authoritative state, including co-op. See
`docs/design/anatomy-cues.md`, `probe_anatomycues.ts` and hidden
`balance/anatomy-cues-ui.cjs` (run the probe and build first).
GT-025 feeding, consumed mass and actual restoration ticks share
`data/feedingCues.ts` profiles. Corpse/summon transfers, chewing and resource
orb drops follow real outcomes, including overmend and co-op. See
`docs/design/feeding-cues.md`, `probe_feedingcues.ts` and hidden
`balance/feeding-cues-ui.cjs` (run the probe and build first).
GT-026–029 companion relationships, stances, taming, recovery, curse fields and
remnant banks are documented in `docs/design/companion-cues.md`. Shared
`data/companionCues.ts` profiles reuse emergence without adding gameplay holds;
verify `probe_companioncues.ts`, companion/revival regressions and hidden
`balance/companion-cues-ui.cjs` after the probe and build.

Carried satellites live in `data/satellites.ts` and `engine/satellites.ts`:
untargetable, modifier-granted orbiting effects shared by players and monsters.
Iron Wake debuts as a level-5 magic pack recipe and the Wakebound jewelry
prefix; Cinder Wake adds level-9 packs and level-12 Cinderbound jewelry. `docs/engine/satellites.md` covers count stacking, contact/scaling,
cleanup and co-op; verify with `npm run probe -- satellites` and the hidden
`balance/satellites-ui.cjs` harness after a build.

Storm Wake lightning projectiles and independent charged aurora reservoirs
are documented in `docs/engine/auroras.md`. Both debut on jewelry, without
new magic-pack recipes. Verify with `npm run probe -- auroras` and the hidden
`balance/auroras-ui.cjs` harness after a build.

Rime Wake cold precision and the independent Graveglass projectile guardian
are documented in `docs/engine/guardians.md`. Their Rimebound/Glasskept
jewelry uses shared modifier grants; no magic-pack recipes are added.
Verify with `npm run probe -- guardians` and the hidden
`balance/guardians-ui.cjs` harness after a build.

Autonomous carried Barrow Creepers are documented in `docs/engine/creepers.md`:
Barrowbound jewelry grants irregular roaming, target pursuit, warned ground
eruptions and leashed returns through the shared actor/hit/pathing systems.
Verify with `npm run probe -- creepers` and `balance/creepers-ui.cjs` after
a build; Goad's construct-hosted Burrowing Pursuer remains independently authored.

Reactive encounterCombat coordination lives in `src/engine/encounterCombat.ts`:
utility-scored plans, readable warnings, finite commitments/recovery and native
AI role assignments. `docs/design/encounter-combat.md` documents the six plans,
12 additional rosters, disruption rules and extension contract. Verify with
`npm run probe -- encountercombat` and `balance/encounter-combat-ui.cjs` after a build.

Mixed-species encounterGroups (one faction per crew) live in
`src/data/encounterGroups.ts`; `docs/design/encounter-groups.md` documents
the strict habitat/debut gates, ambient replacement policy, formation slots,
attributable tactics, survivor persistence and public spawn seam. Verify with
`npm run probe -- encountergroups` and `balance/encounter-groups-ui.cjs` after a build.

Titans (durable unannounced journeys, physical bodies and temporary terrain
wakes) are documented in `docs/design/titans.md`; roster/tuning live in
`src/data/titans.ts`, regression coverage in `balance/probe_titans.ts`.

A top-down action RPG prototype in TypeScript + Vite, rendered on HTML5 Canvas
2D. Design thesis: every system is open, modular **data** — skills, monsters,
statuses, passives, zones are plain data entries composed by one shared engine,
and the player, monsters, and minions all act through a single skill pipeline
(`World.useSkill()` in `src/engine/world.ts`).

Necromancer summon trees live in `src/data/necromancerTrees.ts`; reusable crew
arts and forms are in `necromancerSkills.ts` / `necromancerMinions.ts`. The
current binary mutator anatomy, comparison checkpoint and summon grammar are
documented in `docs/design/necromancer-skill-trees.md`.

Cleave’s landed-hit cycles and recoverable-axe trees live in
`src/data/cleaveTree.ts`; reusable `AttackSequenceSpec` / `AttackSequences`
own target rhythm, wound attribution, catch groups and opening sweeps.
`docs/design/cleave.md` documents tuning, support inheritance and cleanup. Verify with
`npm run probe -- cleave` and the hidden `balance/cleave-ui.cjs` harness.

Fresh-account starting trees live in `src/data/starterSkillTrees.ts`. Their
shared temporary buff mutations (`SkillTreeNode.buffs` / `instanceEffects`),
three-class scope and next batches are documented in
`docs/design/class-starting-skill-trees.md`; `balance/probe_startertrees.ts`
covers the complete opening bars.

The six flask trees live in `src/data/flaskTrees.ts`, with owned drink payloads
in `flaskSkills.ts` and durable ammunition in `engine/flaskState.ts`.
`docs/design/flask-skill-trees.md` records all nodes, empty-bank economies,
support inheritance, primed cargo and balance evidence. Verification is
`balance/probe_flasktrees.ts`, `balance/audit_flasktrees.ts`, and the isolated
hidden `balance/flask-ui.cjs` harness (run the probe and build first).

Persistent flask placement lives in `meta/skillSlotMemory.ts`: account slot
preferences survive removal and fresh-life provision respects occupied class
slots. Contract: `docs/design/town-welcome.md`; verify `probe_townwelcome.ts`
and the hidden `balance/flask-slots-ui.cjs` disk-reload harness after a build.

Gorer carry bounds and Gloomling motion-based shake-off tuning live in
`docs/design/gorer-gloomling-balance.md`; `balance/probe_clingbalance.ts`
covers the reusable `maxCarryDistance`, `releaseGrace` and `motionShake` levers.

Enemy turn-rate derivation, body-aimed combat and completed-cast recovery are
documented in `docs/design/enemy-handling.md`; `balance/probe_handling.ts`
checks the shared handling resolver, pivot budgets and attack openings.

Crow/Gnasher harassment pacing and replenishable-spawn AI restrictions are in
`docs/design/harassment-balance.md`; `balance/probe_harassment.ts` checks melee
contact, retained wild escapes and summon targetability across update rates.

Ranged repositioning budgets, fixed crossfire positions and intelligent enemy
tactics are documented in `docs/design/tactical-ai.md`; the pursuit, movement
commitment and live tactic checks are in `balance/probe_tacticalai.ts`.

Enemy-level tactic unlocks and the level-5 survivability investigation are in
`docs/design/tactic-progression.md`; `balance/probe_tacticprogression.ts` checks
debut boundaries and `balance/audit_tacticprogression.ts` compares combat pressure.

Sylvan Warden and Stone Sentinel guard commitment, bash warnings and doctrine
level gates are documented in `docs/design/shield-defender-balance.md`;
`balance/probe_wardenbalance.ts` checks those counterplay and progression seams.
THE ARM CLOCK (2026-09-16): a shield bash is EARNED by the hold — a guard
released before `GuardBashSpec.armTime` (default `BASH_CFG.armTime`, × the
`bashArmTime` stat) held seconds simply drops and starts its cooldown; the one
resolver writes `CastingState.bashArmAt` beside the line, `guardBashReady` is
the ONE readied read (the release, the HUD's arm meter + readied gold, the
AI's `aiHoldOf` wait-to-arm hold, the co-op wire), and `BehaviorSpec.guardRelease`
grew `hold` / `waitToArm` beside `windup`. Contract: `docs/engine/guard-bash.md`;
probe `balance/probe_bashclock.ts`.
Raise the Gnatveil’s expanded tree lives in `src/data/gnatveilTree.ts`.
`docs/design/gnatveil.md` records native accumulation, hatch bars, eggs,
overflow decay, clustering, conducted contact and the throng armor floor.
Verification: `npm run probe -- gnatveil` plus the throng and frontier probes.
Hivecall’s army and Sovereign form live in `src/data/hivecall.ts`, with native
contract/resource helpers in `src/engine/hivecall.ts`. See `docs/design/hivecall.md`;
verify with `npm run probe -- hivecall` and the frontier/possession probes.
Command: Assault’s native tree and command economy live in `src/data/assaultTree.ts`
and `src/engine/assault.ts`. See `docs/design/command-assault.md`; verify with
`npm run probe -- assault` and `balance/assault-ui.cjs` after a build.
The Hivecaller/Ranger/Guardian batch is in `src/data/frontierStarterTrees.ts`,
with its contract and shared absorb scaling in
`docs/design/frontier-starting-skill-trees.md`.
The Berserker/Sorcerer/Cleric opening trees are in `src/data/devotedStarterTrees.ts`;
`docs/design/devoted-starting-skill-trees.md` covers their identities, tree-granted
resource conduits, healing exclusions and cancellation of repeats on respec.
The Summoner/Juggernaut/Pyromancer opening trees live in `src/data/pactSteelStarterTrees.ts`;
`docs/design/pact-steel-starting-skill-trees.md` covers Fury spender overrides,
familiar arts, moving rings, expiry-radius investment and respec cleanup.
The Assassin/Blademaster/Brawler opening trees live in `src/data/precisionStarterTrees.ts`;
`docs/design/precision-starting-skill-trees.md` covers completed-cut preparation,
combo-finisher investment, timed counters, concealment and measured Fury spending.
The Trapper/Skald/Chronomancer opening trees live in `src/data/controlStarterTrees.ts`;
`docs/design/control-starting-skill-trees.md` covers construct payloads, additive
domains, rewind contracts, device retirement and the Overwound Mechanism support.

Future skill and support proposals are tracked centrally in
`docs/design/skill-support-candidates.md`, with evidence, status and paired ideas.
The Breaker/Vanguard/Lancer starting trees live in `src/data/impactStarterTrees.ts`;
`docs/design/impact-starting-skill-trees.md` covers native pulse overrides,
Extraction bank shares, returning-flight ownership and the complete bars.
The Resonator opening trees live in `src/data/resonatorStarterTrees.ts`;
`docs/design/resonator-starting-skill-trees.md` records native independent tones,
victim-scoped chord payoffs and additive Purity auras.
The Sentinel/Warlord/Wallwright starting trees live in `src/data/bastionStarterTrees.ts`;
`docs/design/bastion-starting-skill-trees.md` covers additive native-aura
modifiers, retaliation, banner cleanup, command blessings and guard releases.
Runeweaver's usable level-one fuel loop and complete starting trees live in
`src/data/runeweaverStarterTrees.ts`; `docs/design/runeweaver-starting-skill-trees.md`
covers Glyph fuel, Invocation payload inheritance, preview and respec ownership.
Ascetic/Flagellant/Firebrand starting trees live in `src/data/disciplineStarterTrees.ts`;
`docs/design/discipline-starting-skill-trees.md` covers ranked self aura modifiers,
standalone Transgression wards, charge timing, debt recovery and control payoffs.

The Tamer/Beguiler/Falconer starting trees live in `src/data/bondStarterTrees.ts`;
`docs/design/bond-starting-skill-trees.md` covers claims, sympathy, native doubles,
madness, falcon contracts and owner-scoped cleanup.
Tame Beast's expanded companion mechanics are in `src/data/tameBeastTree.ts`
and `engine/companionBonds.ts`; `docs/design/tame-beast.md` covers capture,
family arts, innate sympathy, cooperative combat, litter revival and persistence.
THE GROWING BOND (2026-09-16): a bonded body levels with its keeper
(`COMPANION_CFG.level` in `engine/companionSpec.ts`; `World.relevelActor`
re-stamps a living body through the ONE monster level fold `stampMonsterLevel`
that `createMonster` mints through; claiming drops the mint-time `owner`
source so the bond's `companionBond` fold is the only fold). THE STANCES:
`data/companionStances.ts` rows (aggressive / defensive / passive, `lunges`)
+ `engine/companionStances.ts` conducts (open `STANCE_CONDUCTS`, one command
kind per stance) worn as `Actor.standingOrder` — the order BENEATH every
issued one (`updateAI` reads it only while no `aiCommand` stands, so an
Assault/Whistle/Crescendo outranks it and the stance resumes at expiry);
the keeper's choice is `PlayerMeta.stances` (saved, wired as `st`); the tame
skill's META is the shift (`companion_stance`, an honest cast), the meta
mini-button is CLICKABLE (`hudMetaRects` + `metaFaceOf` live faces), the
`companionStance` action (`x`) cycles the bar, and the Command gem fits
companion bonds so its Assault CHAINS one beat after the shift. Probe
`balance/probe_companionstance.ts`.
Goad's barbed-projectile and taunting-effigy overhaul lives in `src/data/goadTree.ts`
and `engine/challenges.ts`; `docs/design/goad.md` covers resets, inherited rocks,
field wounds, impale propagation, aftershocks and burrowing pursuers.
`balance/probe_goad.ts` also verifies Tamer's starting hound and fallback family art.

Chest and gem-cache lists live in `src/data/containerloot.ts` and the existing
`loottables.ts`; `docs/design/container-loot.md` documents the context rules,
Memory Essence economy, visual grammar and regression probe.

THE CONTAINER FABRIC (`src/engine/containers.ts` + `src/data/containers.ts`):
side inventories as data — a `ContainerDef` names what it accepts, whether
seated pieces are ACTIVE (one `container:<id>` sheet source in `recalcSeat`,
the doll's shape) and its board as a LADDER of account-feature rungs, each a
char-grid frame of the cells it opens (the live board is the union of owned
frames; `BoardDims.open` puts THE MASK on the one cell law in
`engine/inventory.ts`). THE RELIQUARY is the debut: a hollow-ring case for
RELICS — the slotless `'relic'` category (charm 1×1 / talisman 2×1 / idol 1×2
/ effigy 2×2 in `itembases.ts`, magic-floored, footprint-capped, rolling THE
RELIC REGISTER alone via `affixPool: 'explicit'` in `itemaffixes.ts`) — inert
in the pack, live only when seated; the Vault rows, menu page, the inventory's
RIBBON DRAWER beside SKILLS / PASSIVES (`ui/containerPane.ts` — a minted
docked root that enrolls in THE FOLIO's inventory-side book, so it tabs with
Skills and the trees), save, corpse and co-op wire all derive from the def;
rung 0 is a one-cell reward from the seeded lost-relic quest
(`quests/reliquary.ts`); first seating completes `reliquary_lesson` and opens
ambient relic drops, then the Vault grows the ring. Contract:
`docs/engine/containers.md`; probe `balance/probe_reliquary.ts`.

Class discovery combat recipes live in `src/data/classdeeds.ts`, with reusable
ledger aggregation in `src/engine/deeds.ts`. `docs/meta/class-deeds.md` covers
account attribution, encounter streaks, hints, and the starting-kit cost pass.
Class levels remain the mastery/skill-swap ladder.

Repeatable Memory discovery and secondary awakening live in
`data/memoryUnlocks.ts` + `meta/memoryUnlocks.ts`. One mixed skill/support
draw replaces the package shelf; another awakens a discoverable skill's tree
and commissions after the account reaches Odyssey 2. Earlier legendary
mints/recalls retain dormant entitlements. `data/powerProgression.ts` owns
account power milestones (Vocations: Odyssey 1; Awakening: Odyssey 2);
class discovery now grants its live starting bar plus authored supports.
`docs/meta/memory-unlocks.md` records experiment knobs,
saved investment transfer, host authority and the future removal of the
temporary debug Grand Codex. Verify `probe_memoryunlocks.ts` and the isolated
`balance/memory-unlocks-ui.cjs` harness after a build.

`docs/design/world-boss-colossi.md` documents the world-boss encounter pass:
`data/worldBossEncounters.ts` owns Cragmaw's colossal anatomy and the two
sovereigns' warned attack/recovery patterns. Verify with
`npm run probe -- worldbossspectacle` and `balance/world-bosses-ui.cjs` after a build.

Stationary arena bosses live in `data/arenaBosses.ts`, with regional doors in
`data/arenaBossHabitats.ts` and courts in `data/arenaBossTilesets.ts`.
`engine/attackPatterns.ts` owns fixed-at-warning geometry; the existing skill
and zone pipelines own damage and attribution. Retry policy, tuning and
extension notes: `docs/design/arena-bosses.md`. Checks:
`npm run probe -- arenabosses`, genqa, and the isolated hidden
`balance/arena-bosses-ui.cjs` client harness after a build.

The passive Star's current native powers and investment clusters are documented
in `docs/design/passive-investment.md`: 54 native graft replacements, 315 useful
small nodes supporting 102 capstones, nine optional school masteries and physical
forks within two allocations. Data lives in `passiveNotables.ts`,
`passiveCrossroads.ts` and the explicit, editable `passives.ts` rows. Verify with
`npm run probe -- passiveinvestment`, `passivecrossroads` and `passiveroutes`,
then `balance/passive-routes-ui.cjs` after a build. Earlier expansion/balance
records remain in `docs/design/passive-routes.md` and `passive-crossroads.md`.
The additive interwoven disciplines live in `src/data/passiveWeave.ts`:
72 native notables, 270 smalls and 126 connections between old travel routes.
`docs/design/passive-weave.md` records the 1,888-node Star, 18 playstyles,
threshold-safe editor serialization, fractional ward fix and compatibility.
Verify with `npm run probe -- passiveweave` plus the existing passive probes
and the hidden `balance/passive-routes-ui.cjs` harness after a build.
Specific elemental, casting, minion-family/body and distance investments live
in `src/data/passiveSpecializations.ts`. The 300-node additive pass brings the
Star to 2,188 nodes: 225 smalls, 64 notables and 11 keystones behind two-port
investment clusters. `docs/design/passive-specializations.md` records the
shared query scopes, relays and tradeoffs; verify with `passivespecializations`
and the passive UI/editor harness (1,372 expansion nodes round-trip).

Personal concealment, foliage sight depth and copied-position investigation are
documented in `docs/engine/stealth.md`. Cloak and Stealth share the concealment
fold; tree crowns retain their art while trunks block sight, and bushes/crops
obscure sight without granting stealth. Verify `npm run probe -- stealth`,
watchers/canopypresence and the canopy visual harness after a build.

Developer progression controls live in `dev/progression.ts` and the Dev panel's
Account tab, with collapsed Memories and live training-yard access. The Monsters
tab and Entity Forge share `dev/monsterSpawn.ts`. See `docs/engine/dev-progression.md`
for registry-derived grants, account attribution and persistence; verify
`probe_devprogression.ts`, `probe_devmonsters.ts` and
`balance/dev-progression-ui.cjs` after a build.

## Commands
Magic rarity's ambient encounters live in `data/magicPacks.ts` and
`engine/magicPacks.ts`: shared recipes, level-gated size bands, attributable
cohort effects, live visual links and zone/save/co-op identity. Rares remain
individual affixed leaders. Contract: `docs/design/magic-packs.md`; verify
with `npm run probe -- magicpacks` plus the existing pack/packtempo probes.
Early magic-pack variety adds Footfall, Scattershock, Bloodfont, Rallyheart and
Skirmishers at levels 1–3. `magicPackEvents` supports fixed target footprints,
single-caster cycles and nonlethal healing payments; proximity rules support
maximum counts and bearer filters. The same contract and magicpack probes apply.

Physical movement tethers live in `engine/movementTether.ts`, with the Sylvan,
undead and demon debut rows in `data/tetheredMonsters.ts`. The configurable
movementTether cord is separate from AI leashes and damaging pack links; see
`docs/engine/movement-tethers.md`. Verify with `npm run probe -- movementtether`
and the hidden `balance/movement-tethers-ui.cjs` capture after a build.
Shared scenery anchors, spirit glow, and Ashen Kennels/Rootwild ecology are
documented there too; `npm run probe -- tetherecology` checks keeper leadership
and saved encounter composition.

- `npm install` — first-time setup (also run automatically by the .bat launchers).
- `npm run dev` — Vite dev server at http://localhost:5173 (browser dev mode, `Play Game.bat`).
- `npm run game` — the DESKTOP APP: Electron launcher window (shows installed
  version, checks the GitHub remote for updates, one-click pull → install →
  build) then the game in its own window. `Launch Game.bat` is the double-click
  wrapper; `npm run game:play` skips the launcher. PACKAGED installs
  self-update instead: the launcher streams the new installer/AppImage from
  GitHub Releases with live progress, installs silently (NSIS `/S
  --force-run` on Windows, in-place AppImage swap on Linux/Steam Deck) and
  relaunches itself — the release page opens only as the fallback
  (`updates.directInstall=false` restores the old behavior).
  THE RELEASE CHANNEL (2026-09-19, `launcher/updates.cjs` — the update
  brain, PURE: no Electron, so every law runs under `npm run test:launcher`;
  contract `docs/engine/updates.md`): `updates.channel` 'nightly' (THE
  DEFAULT — the release LIST, newest PUBLISHED build, prereleases included,
  so players ride the nightly cadence) | 'stable' (`/releases/latest`,
  hand-cut stables only); `pickUpdate` is THE SELECTION (highest vX.Y.Z
  wins, never a downgrade, non-version tags never offered). THE FAILED-NIGHT
  LAW: a launcher can only be offered what was PUBLISHED and nothing about a
  failed night ever is — red verify = no tag, a red package leg / packaged
  smoke / finalize = a DRAFT no anonymous caller sees (`releaseType: draft`
  is load-bearing); pickUpdate still re-checks (drafts dropped, a release
  missing this platform's fully-`uploaded` artifact PASSED OVER for the one
  beneath, by name). THE DIGEST LAW: `downloadAsset` hashes the stream
  against the sha256 GitHub publishes and DELETES anything unverified
  (stall timer under the ceiling; `verifyDigest`). Withdrawing a bad night =
  delete the release or re-draft it. THE BOOTSTRAP: pre-channel installs
  (≤ v0.5.39) only ever ask `/releases/latest` — ONE channel-aware release
  must be made "latest" (a stable cut, or one promoted nightly) to move them
  (`v0.6.0` is that release — every install from it onward follows a channel).
  The picker persists through `writeLocalConfig` (THE LOCAL WRITE — the
  Developer box's seam too). THE QUIET UPDATE (`quietUpdate`,
  `updates.quiet`): a session that boots straight into the game (Steam Deck
  Game Mode, `--play`) never shows the launcher page, so after
  `quietDelaySec` it runs the same channel check in the background and
  `swapInPlace`s a verified AppImage over the SAME path (staged dotfile →
  verify → chmod → rename; stale `.downloading` leftovers swept) — the
  running game keeps its old inode, the NEXT launch is the new build; no
  prompt, no restart, every failure one `launcher.log` line (Linux-only: a
  Windows install always shows the launcher).
  THE TWO FACES (2026-09-18): the launcher page's Developer box —
  `cfg.dev` persisted to `launcher.config.local.json`, `devMode()` in
  `launcher/main.cjs` THE ONE FOLD. PLAYER mode (default) is a launched
  game: the built dist/ over loopback, no DevTools, no dev panel, the log
  tucked away, `Launch Game.bat` closing its terminal. DEVELOPER mode opens
  DevTools/F5 + the in-game dev panel and unfolds `liveSource` (the game
  runs from src/ on a Vite dev server the launcher spawns on Electron's own
  Node — hot reload + the tree editor's `/__dev/passives` write-back;
  checkout only), `forges`, `passiveEditor` and `console` (the .bat reads
  the file). The toggles reach the game as `?dev=forges,editor` on its
  address (`gameAddress`) and fold in `src/config.ts` (`AUTHORED` numbers
  || `DEV_OPT_INS`), so nothing between a toggle and its tool needs a source
  edit or a rebuild; the headless sim reads the authored numbers alone.
  `npm run smoke:source` pins the live lane with every tool on and requires
  each toggle to have reached its tool.
- `npx tsc --noEmit` — fast type-check with no output. Primary correctness gate.
- `npm run check` — type-checks the game AND the launcher (`tsconfig.launcher.json`
  runs strict checkJs over `launcher/*.cjs`).
- `npm run build` — `tsc --noEmit && vite build` (type-check + production build to `dist/`).
- `npm run smoke` / `npm run smoke:launcher` — headless Electron self-checks:
  boot the real game window (or launcher), assert `__game` / start menu /
  `/__save` endpoint (or the IPC status round-trip), print `SMOKE … OK`, exit
  0/1. Run these after touching `launcher/` or anything boot-related.
  `npm run smoke:update` is the hermetic RELEASE-lane twin of
  `npm run test:launcher` (a loopback fixture built relative to the running
  version: finds the successor, passes an incomplete release over, never
  sees a draft, verifies a good artifact and deletes a bad one; installs
  nothing, writes no settings). THE PUBLISH GATE: release.yml runs
  launcher + update + game against the PACKAGED app on both OS legs before
  `finalize` may publish — a build that cannot boot, or can no longer
  update itself, never reaches an auto-updating player. The launcher-page
  lanes pin `cfg.dev` to the committed defaults in memory (a dev machine's
  Developer toggle used to fail `smoke:launcher` at a HEAD CI called green).
- `npm run perf` — the PERFORMANCE HARNESS: boots the real desktop game
  (visible window — true compositor pacing), starts a run, mints one zone per
  frontier tileset through the real mint path — plus every non-frontier
  tileset opted in via `TilesetDef.perfProbe` (caves, minted interiors) — and
  walks each under real rAF while sampling frame telemetry (rAF-gap
  p50/p95/p99, hitch counts, sim-vs-render split, entry burst), gating
  against `balance/perf.config.json` — each zone judged RELATIVE to the same
  run's town control plus absolute hitch backstops. Exit 2 on breach; per-run
  reports in `balance/reports/`. Mints are seeded by FULL-matrix index, so
  `--filter` runs reproduce the full sweep's zones; `mintPins` can pin a
  tileset's variant/layout/seed to gate its committed worst case. Flags:
  `-- --filter=mire --seconds=8` (forensics: `--weather/--ablate/--variant/
  --layout/--seed` print the verdict but never exit 2). Run after
  render/engine perf work or when a biome feels stuttery — the sweep derives
  its matrix from the tileset registry, so new biomes join automatically.
- `npm run sim -- …` — the BALANCE HARNESS: the real engine headless and
  deterministic (seeded), running scenario suites over reference builds.
  `run --suite smoke` after any `src/data/` change; `sweep skills` ranks every
  attack/spell skill at equal investment; `sweep supports` is the SKILL ×
  SUPPORT NO-OP MATRIX (census through the real socket gate + same-seed A/B
  probes — byte-identical fingerprint = definitive INERT); `matrix check` is
  that matrix as a UNIT TEST — gated against the committed, adjudicated
  defect ledger `balance/baselines/support_matrix.json` (exit 2 on no-ops
  the ledger doesn't know; `--reconcile` rewrites it deliberately;
  `--shard i/n` + `--resume <dir>` + `matrix merge` let cheap concurrent
  runners split the ~85k-pair space; `--deep` mask-one-out-ablates payload
  units inside WORKING gems — dead lines are `partial` defects) and
  `matrix explain <skill> <gem>` is the per-pair forensics lane (gate
  trace, static contract, A/B verdict, per-unit attribution, prescriptions);
  run a `matrix check --support <gem>` slice after any supports.ts change
  (probe `balance/probe_supportmatrix.ts`, custodian recipe in
  `.claude/agents/matrix-custodian.md`); `sweep progression
  --geared` prints the per-class power curve with the gear-value column;
  `audit affixes` / `audit drops` are the ECONOMY AUDITS (dead-affix +
  dead-stat detectors, loot yields vs DROP_CFG); `baseline check --suite
  smoke` is the regression gate (exit 2 on breach). Docs:
  `docs/balance/README.md` (framework + metrics glossary) and
  `docs/balance/AGENT_PLAYBOOK.md` (the contract for agent-driven mass
  balance passes, incl. run/follow-up recipes for the matrix + economy
  passes). Type-checked by `tsconfig.sim.json` inside `npm run check`.
- `npm run genqa` — the GENERATION QA HARNESS: generateLayout headless over
  the whole authored matrix (every tileset + variant with its rolls, every
  registered layout generator — interiors also at cave scale — and every
  composition forced at chance 1) × several seeds, asserting the generation
  invariants (registry refs incl. composition sites/rolls, determinism,
  inverse forbidOn, portal clears, caveSeeds zip, grid reachability,
  door-sides sanity, fuse contiguity). Exit 2 on breach — run after any
  levelgen/tileset/formation/composition/landmark change.
  Flags: `-- --seeds 5 --filter mire --verbose`.
- `npm run probe` — THE PROBE GATE: the 98 standalone regression rigs in
  `balance/probe_*.ts` (each boots the real engine headless and prints
  PASS/FAIL) driven off `balance/proberoster.ts` — the roster IS the gate,
  one typed row per probe carrying `green` + a tier, or `excluded` + an
  excuse (`red` = fails deterministically at HEAD, `flaky` = passes only
  sometimes) and a one-line reason. THE CENSUS runs first, always: an
  unenrolled probe or a row naming a missing file is a hard error (exit 2)
  before a rig boots, so the registry can never drift behind the directory
  and a new probe cannot be forgotten into silence. Default = the FAST green
  lane (84 rigs, <1 min); `-- --slow` adds the 3 heavy rigs, `-- --all` runs
  everything on disk and calls out any EXCLUDED probe that now passes
  (promote its row); `-- <substr>` / `-- --filter <substr>` names rigs
  directly (reaches every tier and status), `-- --jobs 1` streams one probe's
  output live, `-- --list` prints the roster. Excluded probes NEVER gate.
  THE RETRY: a handful of rigs carry unseeded nondeterminism at a few percent
  (the four loudest are excluded by name; the tail is unmapped), so a failing
  green probe is re-run once and only a probe that fails EVERY attempt gates —
  a real regression is deterministic and still stops the build, while a
  fail-then-pass is NAMED as FLAKY with its fail lines instead of being
  swallowed (`-- --retries 0` restores strict first-verdict behavior).
  NEVER weaken a probe's assertions to move it onto the green list — an
  excluded row is a debt with a name, not a silenced test.
  `.github/workflows/ci.yml` runs `npm run check` + `npm run probe` on every
  push and PR; nightly.yml's release-candidate `cut` needs the same pair with
  `--slow`.
- `npm run preview` — serve the built `dist/`.
- `npm run icon` — repaints THE INSIGNIA icon set from pure math
  (`scripts/make-icon.mjs`, zero deps): `build/icon.png` (512) +
  `build/icon.ico` (16…256, one hinted cut per frame — strokes thicken and
  the spokes fade toward 16 px so the trio survives the tray) +
  `public/favicon.ico` / `site/assets/favicon.ico`. The website's nav mark
  (`site/assets/nav.js` MARK) is the canonical geometry — change it there
  first, mirror it here. The launcher sets the file on BOTH windows through
  its `APP_ICON` seam (the .ico on Windows, the .png elsewhere; shipped as
  extraResources), so a dev checkout, the packaged exe, a Linux AppImage,
  the browser tab and the site all wear the one mark; the launcher page's
  header carries the same SVG as a lockup.

No unit-test runner is configured; `tsc --noEmit`, the probe gate, the smoke
checks, the balance harness's smoke suite, and the generation QA sweep are how
we verify changes.

## Layout
- Longlimb silhouettes, Legacy Stalkers and captured body-scale persistence are
  documented in `docs/render/stalkers.md`. Reusable parts/looks live in
  `stalkerGlyphs.ts` / `stalkerLooks.ts`; verify cosmetics, companion and tamebeast
  probes plus hidden `balance/stalkers-ui.cjs` after a build.
- Spider anatomy, silk nests and retained bonded/hatchling appearances are
  documented in `docs/render/arachnids.md`. Parts and looks live in
  `arachnidGlyphs.ts` / `arachnidLooks.ts`; verify the cosmetics probe and
  hidden `balance/arachnids-ui.cjs` after a build.
- Canine anatomy and legacy bonded/retaliating bodies are documented in
  `docs/render/canines.md`. Reusable parts and looks live in `canineGlyphs.ts`
  / `canineLooks.ts`; verify the cosmetics probe and hidden
  `balance/canines-ui.cjs` after a build.
- Companion and wild bird anatomy is documented in `docs/render/avians.md`.
  `avianGlyphs.ts` / `avianLooks.ts` provide reusable feathered anatomy;
  Legacy Hunting Falcon retains the companion's former appearance. Verify
  the cosmetics probe and hidden `balance/avians-ui.cjs` after a build.
- Advanced undead court anatomy and the free legacy skin are documented in
  `docs/render/undead-courts.md`. Reusable kits/compositions live in
  `undeadCourtGlyphs.ts` / `undeadCourtLooks.ts`; verify the cosmetics probe
  and hidden `balance/undead-courts-ui.cjs` after a build.
- Skeletal mage school anatomy, the free legacy skin and pool/tree form previews
  are documented in `docs/render/skeletal-mages.md`. Parts and compositions live
  in `skeletalMageGlyphs.ts` / `skeletalMageLooks.ts`; verify the cosmetics probe
  and hidden `balance/skeletal-mages-ui.cjs` after a build.
- Amalgamation and spirit companion anatomy, reusable kits and free legacy
  skins are documented in `docs/render/summons.md`. Data lives in
  `summonLooks.ts`, `summonGlyphs.ts` and `summonCosmetics.ts`; verify the
  cosmetics probe and hidden `balance/summons-ui.cjs` after a build.
- Golem material anatomy and the free Legacy Golems skill skin are documented
  in `docs/render/golems.md`. Parts/looks are ordinary visual data; summoned
  body skins use source-skill attribution and preserve gameplay cap markers.
  Verify the cosmetics probe and hidden `balance/golems-ui.cjs` after a build.
- Account cosmetics: `data/cosmetics.ts` defines the Wardrobe's skins, effects,
  footprints, avatars and acquisition rules; `meta/cosmetics.ts` owns durable
  grants, per-skill choices and the future verified-entitlement adapter seam.
  Paint never modifies combat. UI, co-op, extension contract and verification:
  `docs/design/cosmetics.md`; `npm run probe -- cosmetics` and the isolated
  `balance/cosmetics-ui.cjs` harness after a build.
- Odyssey: `data/odyssey.ts` owns roster content and pressure tuning;
  `data/odysseyPressure.ts` + `world/odysseyPressure.ts` share mechanic unlocks,
  tier tuning and cooldown adjustments: tier zero is dormant; every surviving
  faction gains one tier per eliminated faction. Existing pressures start at
  tier one; later data rows can accumulate without replacing earlier mechanics.
  Every Odyssey faction, including Gnolls, is intended to gain distinct living
  world mechanics through this contract; unfinished faction mechanics remain
  future design and implementation work in `docs/design/odyssey.md`.
  `world/odyssey.ts` owns frozen world selection, ordered leader receipts and
  save validation; `engine/odyssey.ts` connects quest objectives to progression,
  Bandit messenger reports and Goblin assaults on Lastlight. Prototype campaign
  quests are in `quests/odyssey.ts`; Vocation point income now comes from leaders.
  Design decisions, scope and remaining story work: `docs/design/odyssey.md`.
  Regression: `npm run probe -- odyssey` (real objectives, save/reload,
  perception/escape/interception, and town defense/trade recovery).
- Town portals: `data/townportals.ts` configures the scroll-free utility skill,
  destination and HUD button; `engine/townportal.ts` carries saved round trips.
  `engine/zonecontents.ts` extends run-long zone memory to spent containers and
  uncollected loot, including safe-town doors. Campfire refresh clears expedition
  memories and portals. Contract: `docs/engine/town-portals.md`; regression:
  `balance/probe_townportal.ts`. Inventory locks and vendor reservations share
  the bindable hold gesture in `ui/itemhold.ts`.
- Necromancer tree batches: `data/necromancerTrees.ts` starts with Shambling
  Horde's three identities. `engine/replenishment.ts` provides bar-seated,
  bounded passive summon clocks; `over.summon` resolves count/cap/lifespan
  through the ordinary delivery view. Exploding actors carry hit and kill
  credit through their source. Contract and next batches:
  `docs/design/necromancer-skill-trees.md`; probe `balance/probe_necromancertrees.ts`.
- Reactive uniques: `engine/reception.ts` supplies defender hit conversion and
  status relays; typed `struck` procs and distinct saved finger choices reuse
  the ordinary proc/item systems. Data in `src/data/uniques/reactive.ts` and
  `src/data/reactiveSkills.ts`; extension contract and checks in
  `docs/design/reactive-uniques.md` and `balance/probe_reactiveuniques.ts`.
- Living uniques: `engine/itemchoices.ts`, `engine/bequests.ts`, and
  `engine/fieldgrants.ts` add saved weighted item alternatives, attributable
  follower inheritance, and modifier-granted movement trails/terrain refuges/
  throng substitutions. Data in `src/data/uniques/living.ts`; design and
  extension contract in `docs/design/living-uniques.md`; regression rig
  `balance/probe_livinguniques.ts`.
- `src/engine/` — systems: `world.ts` (core loop, `useSkill`), `stats.ts`
  (layered modifier engine), `damage.ts`, `status.ts`, `skills.ts` (skill
  schema), `actor.ts` (one entity model for player/monsters/minions),
  `ai.ts` + `brain.ts` (composable enemy AI; THE FLOCKING FABRIC —
  `BehaviorSpec.flock` murmuration steering at the steerMove gate,
  `StatusDef.flight` aloft states riding `Actor.flying`,
  `LeapDelivery.telegraph` honest dive rings, `MonsterDef.packSize`
  natural group sizing, `engine/flight.ts` = the ONE weave/erratic math
  shared with projectiles — docs in `docs/engine/flocking.md`),
  `los.ts` (THE occlusion
  raycast: one shot/sight ray over doodads + grid regions, `LOS_CFG`
  delivery defaults, the `phasing` stat lever; THE ELEVATION LAW —
  `RayElev` story heights over the tier fabric's layers (`LOS_CFG.elev`):
  sight lerps eye→eye so same-deck duels are open air and the valley sees
  a rim-stander only over the lip, shots fly FLAT at the caster's story
  (the projectile sweep's own law — hold-fire and the arrow always
  agree), doodads fill a story band above their `tier`, and the veil +
  AI perception both ride it (probe `balance/probe_tiers.ts` RIG G);
  AI pathing rides
  `World.pathField()`; its DRAWN half is THE SIGHT VEIL —
  `render/vis/sightVeil.ts` positional occlusion shadows from wall cells
  + solid trunks, `VIS_CFG.sightVeil` + `ZoneTheme.sightVeil` +
  `DoodadRule.sightShadow` levers — docs in `docs/engine/los-pathing.md`),
  `shapes.ts` + `projForms.ts` (the HIT-SURFACE fabric: doodad collision
  shapes as data via `hitSurfaceOf`, projectile drawn-form hit tests via
  `PROJ_FORM_GEO` — docs in `docs/engine/hit-surfaces.md`),
  THE AOE SHAPE REGISTRY (`AOE_SHAPE` in skills.ts — circle / square /
  triangle / crescent / sector / band; `inAoe` in world.ts is THE test,
  `render/vis/aoeTrace.ts` THE tracer, one branch each per shape; a
  delivery's innate figure is the `aoeShape` query's BASE —
  `GroundDelivery.shape` / `MeleeDelivery.shape` — and sigils override;
  the `band` = THE CROSSING STRIP seated by `bandSwingGeo` (far edge at
  reach, width = the arc's chord) is the Cross Jab's figure, its
  `MeleeDelivery.fx` 'crossjab' voice the knuckle streak; THE CHAIN LANE
  (`comboChain`: THE REPEATED STEP names the host, `World.comboStepOf` ONE
  resolver for press/face/judgment, steps wear the host's sockets
  once-counted, THE HONEST CHAIN FACE on the bar, THE BEAT LAW — a step
  joins the cast ring as its host's beat — and THE HAND'S CURSOR —
  `World.comboCursorOf`, a borrowed instance walks its own cursor) — docs
  `docs/engine/aoe-shapes.md` + `docs/engine/combo.md`; probe
  `balance/probe_crossjab.ts`),
  `presence.ts` (leveled-list
  spawn envelopes: weight-vs-level curves on any monster-table entry or
  MonsterDef, folded at `World.weightedPick(table, atLevel)`),
  `fog.ts` (THE FOG FABRIC: living, roaming fog banks as data —
  FogBankDef kinds + ZoneTheme.fog specs; the drawn lobes are the hit
  surface, statuses granted while inside — docs in `docs/engine/fog.md`),
  `creep.ts` (THE CREEP FABRIC: living ground membrane as data — CreepDef
  kinds + ZoneTheme.creep pockets, runtime sources via World.creepEnsure /
  MonsterDef.creepSource hearts that recoil on death; the drawn skin is
  the hit surface; WAVE SHAPES as per-lane data — `line: 'span'` tidal
  walls with a structurally guaranteed clear corridor, `FrontSpec.stretch`
  artery-wide crests, `convert.fade` evaporating wakes riding the generic
  `Doodad.evap` drying fabric, `chance`/`announce` intra-zone-event dials,
  `CreepDef.notAquatic` no-water-within-water; THE VESSEL BORE —
  `FrontSpec.flow` wall-following steering (whisker probes over
  `CreepTerrain.openAt` + dead-end rebounds; `confine` walls the current's
  whole gameplay surface to the vessel), `travel` finite runs that
  disperse, `swell` along-axis elongation (affine anisotropy: drawn ==
  tested through ONE transform, `crestPoint` THE seat resolver), and
  `riders` crest-borne kin (`World.updateCreepRiders` mounts real
  monsters, `crestborne` marker; debut `sanguine_bore` + the
  `pale_corpuscle` white-cell surfers on the Sanguine's lanes) — docs in
  `docs/engine/creep.md`),
  `collapse.ts` + `traversal.ts` + `render/vis/understory.ts` (THE VERTICAL
  FABRICS: dissolving ground as a `ZoneTheme.collapse` spec — contact
  crumble + seeded rim-inward melt, an eroding-but-guaranteed causeway to
  a never-melting goal; registered vertical-crossing cinematics
  (`data/traversals.ts`); the world far BELOW shown through `window`
  region cells — the Ascent/Aetherial ride all three; docs in
  `docs/engine/collapse.md`),
  `spans.ts` + `world/radiance.ts` (THE RADIANCE + SPAN FABRICS: the sky's
  light as ONE scalar — dayCycle × WeatherDef.radiance dials, flat under
  shelter — read through `World.radiance()`/`radianceCondHeld(cond)`;
  condition-held ground as `ZoneTheme.spans` rows — sunbridges by day,
  star-spans by night, prism-spans under rain, veiled leap-of-faith ways —
  and radiance-gated creep-front lanes (`FrontSpawnRow.when`, the night's
  cometfall); DIMENSION SEALS + realm tileset pools in
  `world/dimensions.ts` (`TilesetDef.realm`, `isRoadlessGateHub`,
  `DimensionDef.sky`) — docs in `docs/engine/spans.md` +
  `docs/engine/dimensions.md`; probes `balance/probe_dimensions.ts` +
  `balance/probe_radiance.ts`),
  `lightwells.ts` (THE LIGHTWELL + SURVIVAL-METER FABRICS: finite-power
  residence lights as data — `LightwellDef` rows in `data/lightwells.ts`
  (pool in resident-seconds, per-resident drain, dim curve), `lightReach()`
  THE resolver shared by render + residence test so drawn == tested
  through every stage of dimming, the generic `'kindle'` SkillEffect
  plants registered wells; survival meters are `SURVIVAL_RESOURCES` rows
  in `world/regions.ts` with per-row underflow ramps keyed per resource
  (`Actor.underflowSince`/`lastGaspAt`) — breath, light, a future warmth
  are rows, never fields; THE GLOAMING
  (`packages/defs+overlays/gloaming.ts`) rides both: a world-map darkness
  front seeded by Gloamwood's biome, breathing as one BFS-hop float, met
  in-zone by the LIGHT meter, spawned wells, `gloomveiled` stealth and
  the gloamborn; THE BITING HOURS (`surge.bite`, a RadianceCond — authored
  `phases:['dusk','night']`) sleep the whole in-zone bite outside its hour
  through the ONE eased-gloom seam (the front's map life runs regardless)
  under THE DAYLOCK (`World.lightMeterHeld`, one predicate for the engine
  freeze + well/flare refusals + the HUD hide): daylight under a standing
  front FREEZES the lamp where daybreak found it — inert, invisible, fed
  by nothing — and dusk re-engages the same debt (only uncovered ground
  recovers; the day suspends the dark's bill, never pays it); a biting
  gloom wears the Descent's encroaching-dark vignette
  (`World.gloamingView` → renderer `drawDarknessHud`/
  `drawDarknessVignette`, `VIS_CFG.gloamVignette` — the closing eye tracks
  the emptying meter) — docs in
  `docs/engine/gloaming.md`; probe `balance/probe_gloaming.ts`),
  `tracks.ts` (THE TRACK FABRIC: moving hazards on authored ways as pure
  data — TrackSpec lanes (waypoints, loop/pingpong, speed, pauses, per-rider
  phase) whose rider poses are a PURE FUNCTION of the synced clock
  (`trackPose` — deterministic across seats/resumes by construction);
  payloads ride existing levers (mitigated typed hits, statuses,
  `pushActor` shoves — pit-aware with owner credit; `TrackPayload.push`
  picks the shove's GRAIN: radial fling or 'along' the lane — the sweeper
  arm that CARRIES bodies around its route), the same grammar on
  static doodads via `DoodadRule.contact` (bumpers); readability contract:
  carved `track_groove` ways, warn arcs + `imminentThreatTo` from the same
  resolver, drawn==tested rider surfaces, and THE SWEPT BEAT (the contact
  sweep sub-samples each beat at surface-honest steps — fast surfaces can
  never tunnel a body between samples); authoring via landmark builders /
  `ZoneTheme.tracks` / `World.tracksEnsure`; debut = the GLACIAL HEART
  (deepwinter's heart graft: ice disc over a chasm moat, shear-disc ring +
  rime-flail rotor + rime bumpers, the Winter King anchored at the wheel) —
  docs in `docs/engine/tracks.md`; probe `balance/probe_tracks.ts`),
  `trapworks.ts` (THE TRAPWORKS FABRIC — triggers wired to the world's own
  hazards, as data: plates/triplines (`TrapworkSpec`, feet-honest pure
  `trapTriggerHit`) driving an OPEN effect registry (`registerTrapEffect` —
  handlers speak only the narrow `TrapHost`) whose core four ride existing
  fabrics: `lanes` arm/disarm tagged track lanes, `boulder`/`volley` loose
  ONCE-lanes (`mode:'once'` + `bornAt` + presser `ownerId` credit; the
  pending lane's RAKE stroke is the telegraph), `collapse` drops false
  floors into the pitfall fabric's descend (the swallow = pushActor's
  tiniest owned nudge — credit intact). Generation-MESHED via the
  interiorGen trap pass (`layoutParams.trapworks` dials: saw halls, mincer
  rooms — every wheel rolling its own blade count/rim speed/free seating/
  spin direction, plus the ONE great blade and the push-along sweeparm —
  BLADE LATTICES (a grand hall tiled with small async wheels behind
  structural walkable seams), dart wards, boulder runs, false floors —
  geometry-honest off real corridors/rooms; sunken_ruin is the debut, its
  'toothed halls' variant the dense face; the SURFACE `rooms` recipe
  records its geometry as
  `ctx.trapGeo` and generateLayout's finished-grid tail runs the SAME pass
  via `registerTrapPass` — the mountain pass's sprung boulder runs are the
  surface debut, and rooms-rolled caves inherit a tileset's dials). The
  dead build no allegiance: trap payloads spare NO
  faction. Kit in `data/trapworks.ts`; hidden-plate close-up resolve in
  `render/vis/trapLayer.ts`; docs in `docs/engine/trapworks.md`; probe
  `balance/probe_trapworks.ts`),
  `bombard.ts` (THE BOMBARDMENT FABRIC — off-screen artillery presence as
  data: `MonsterDef.bombard` standing guns lob their OWN kit skill at the
  war on per-gun jittered clocks through the ONE pipeline (useSkill —
  telegraphs, dodge-AI, credit, cooldown arbitration all standard);
  enemy guns shell player SEATS zone-wide perception-free (the D2
  catapult law), player-owned guns serve their keeper (the assist law),
  breakDisables part-breaks SILENCE a hulk the objective still counts;
  `StormDelivery.sky` = weather posture (hitAll/spareDormant/spareRoofed),
  `.lob` = the render-only incoming comet, `ImpactDressSpec` = drying
  blast pocks under a per-zone cap (the transience doctrine); the slayer
  lane's FIFTH axis `siegebreaker` prices `Actor.stationary` rooted
  bodies; debut = THE WARFRONT country (hell-only biome: grindfields →
  siegefront staged faces + the ordnance_yard den, Bale Trebuchets as the
  `spawners` signature objective, war_column marches via the new
  `EventContext.biome` lever, Bhorog's roster fields the kin war-wide) —
  docs in `docs/engine/bombardment.md` + `docs/engine/warfront.md`; probe
  `balance/probe_warfront.ts`),
  `timeflow.ts` (THE TIMEFLOW FABRIC: time itself as data — one TimeHold
  registry behind the pause menu's real pause, Ultimatum-style menu
  freezes (`TIME_CFG.surfaces`), `SkillDef.chrono` time-stop casts, and
  `StatusDef.timeScale` stasis/slow statuses; world- and per-actor scales,
  solo-only menu policy via `Timeflow.allowHold` — docs in
  `docs/engine/timeflow.md`),
  `fourthwall.ts` (THE FOURTH WALL — the camera's drawn frame as a gameplay
  surface: the renderer PUBLISHES the frame it actually drew
  (`World.publishViewFrame` — the couchConfine drawn==tested idiom
  generalized to solo), `World.viewRectFor` is the ONE governing-frame
  resolver (stamped lock → owner-chain lock → live published frame for
  player-team bodies → the deterministic FALLBACK centered on the body's
  root — an enemy never tests the player's drawn frame, fairness is
  structural), `StatusDef.frameLock` freezes the walls where the status
  found them (rising-edge stamp onto `Actor.frameLockRect`; the camera pins
  BELOW the cinematic eye; the 'framecage' screen-fx rim is the drawn
  tell), and `frameReflect` is the one bank math every consumer shares.
  Consumers: the FRAME-REBOUND projectile lane
  (`TrajectorySpec.frameBounce` seeds × the `projFrameBounce` stat — the
  projBounce kindred shape, folded at the one spawn site; each bank re-arms
  range + hit ledger, the re-throw idiom; the Mirrored Bounds gem) and THE
  CAROM MOTOR (`CaromDelivery` → `Actor.caromRun`, the third carried-body
  motor beside dash/leap: banks off walls and the frame alike through
  steppedClamp + frameReflect, pays the skill's whole payload through
  resolveHit on a per-victim rehit clock, the worn ride status is the ONE
  clock both ways (dispellable by construction; its def carries the lock),
  willed movement quits the ride — the saddle law; debut Caged Comet, 18s
  first-pass throttle, monsters cast it through the same door; Vault rows
  `gem_skills_fourthwall` → `sup_fourthwall`) — dials in
  `FOURTH_WALL_CFG`, docs in `docs/engine/fourthwall.md`, probe
  `balance/probe_fourthwall.ts`),
  `ultimates.ts` (THE ULTIMATE FABRIC — super arts as data + THE EYECATCH,
  the anime cut-away pane: `SkillDef.ultimate` marks an ordinary catalog
  skill as a SUPER ART — executing it flashes the pane whose AVATAR is the
  caster's OWN live body through the portrait fabric
  (render/vis/eyecatch.ts, an OPEN style registry `registerEyecatchStyle`
  — 'flank' fighting-game side-slice cut-in, THE DEFAULT: the world stays
  in the shot performing the art / 'sunder' full-screen slash / 'eclipse'
  iris; screen-anchored by the
  status-overlay exemption) and, solo policy allowing (the harvest rite's
  allowHold law — co-op/couch play it over a living world), HOLDS the
  world for the beat (kind 'ultimate', never 'menu'; a chrono skill's
  beat defaults 0 — its stop IS the cinematic). THE LAWS: the SAME DOOR
  (any caster through the one pipeline — an enemy's super wears the
  banner as a TELEGRAPH, side-coded, shorter beat), THE PRICE FLOOR
  (`ULT_CFG.minCooldown` — census-pinned authoring law, never a runtime
  clamp), THE THROTTLE ONLY SKIPS THE BANNER (casts never wait on their
  own presentation), DRAWN == TIMED (the pane clock is `Timeflow.age`,
  the raw clock frozen only by a true pause — beginFrame now advances it
  between holds per its own documented contract; `eyecatchElapsed`/
  `eyecatchAlive` the ONE fold for renderer + sweep + probes), THE TAG
  (the 'ultimate' SkillTag = the family's support/investment SCOPE: the
  spec is the mark, the tag is the scope — census pins spec ⇒ tag, and
  payload kin wear the tag markless so scaling reaches the whole art),
  THE LAB LEVER (`ULT_QA` — QA builds cap the STAMPED cooldown + run an
  eager banner throttle for back-to-back iteration; THE LAB TAB on the
  `?dev` panel (dev/tabs/ultlab.ts — include/exclude the kit, adjust,
  reset, persisted per browser) is its one door, `__game.ultqa()` the
  console twin; ships OFF; the probe pins both regimes), and the
  wire ships the derived `ec` row (elapsed, not epochs — the tell-wire
  idiom). Debuts (data/ultimates.ts, Vault `gem_skills_ultimates`, each
  a COMPOSE of standing fabrics): the Hundred Partings (chrono stop +
  tight at-enemies slash storm), Hollow Star (`pull`/`pullRadius`
  event-horizon well + followUp collapse), the Woken Hollow (shapeshift
  at powerFactor ABOVE 1 — the one form that is not the weaker vessel;
  `ULTIMATE_FORMS` absorbed by monsters.ts before its registry-close
  folds; the pane's `avatarDefId` shows the form you are becoming) —
  dials in `ULT_CFG`, docs in `docs/engine/ultimates.md`, probe
  `balance/probe_ultimates.ts`),
  THE TALENT FABRIC (`engine/victim.ts` + `engine/recency.ts` +
  `engine/gauges.ts` — WoW-talent / Ascension Random-Enchant mechanism
  shapes as plain data on the surfaces that already exist; docs
  `docs/engine/talents.md`, probe `balance/probe_talents.ts`): THE VICTIM
  SCOPE — `'vs:<condition>'` tags on ordinary modifiers say WHO a hit is
  against (registered victim conditions + every status the victim carries,
  folded into the roll's context at `World.resolveHit` only when the striker
  names one — `victimScopeArmed`; never authored on a skill; the packet
  carries it downstream); THE RECENCY LEDGER — `recentlyKilled` /
  `recentlyHurt` / `notHurtRecently` / … as ordinary ConditionIds over
  per-actor seconds-since counters (`Actor.since`, stamped at the engine's
  own seams, windows in `RECENT_CFG`; `CONDITION_IDS` is the ONE bit-order
  list; a condition that flips ON is an EVENT — `Actor.condRose` → the
  'condition' proc trigger); DERIVED GAUGES (`registerDerivedGauge` —
  life:missing / foes:near / minions / …, cadenced, sampled only for actors
  that READ them) + THE GAUGE GATE (`Modifier.gaugeAt` / `gaugeGateMod` —
  a threshold, not a scale); PROC TRIGGERS 'hurt' / 'miss' / 'foiled' /
  'cast' / 'condition' / 'pulse' / 'minionDeath' / 'heal' / 'lastGasp',
  gates `when`/`unless`/`requireBuff`/`requireStatus`/`noCrit`/`vs`/
  `tags`, effects targeted `cooldown` (skills/tags/reset) / `removeBuff` /
  `ward` / `cleanse` (THE SHEET-LANE DOCTRINE: hurt/condition/pulse/
  minionDeath/heal/lastGasp roll with no skill context — grant them
  UNTAGGED from passives/affixes; registry ORDER is the law for grammars —
  the hot-streak trio); CONSUMABLE BUFFS (`BuffEffect.consumeOn` — use/hit/
  crit/kill/hurt/block/evade, spent AFTER the event resolved;
  `consumeOnUse` reads as {on:'use'}); THE LAST GASP (`landLifeDamage` —
  the ONE life-wound seam: `lastGasp` / `lastGaspLife` / `lastGaspCooldown`
  stats, the gasp an event). Debut: 15 procs, 13 gems, 14 affix families,
  THE OPPORTUNIST'S ROW (14 nodes off Prowess node_68).
  `gauge.ts` (THE GAUGE FABRIC — skills that pay in the world's own
  events; two resource shapes, one vocabulary: THE GAUGE (`SkillDef.gauge`
  — a per-SKILL bank FED by the charge-tap vocabulary through the ONE
  dispatcher `World.tapCharges` + the ONE filter chain `World.tapFires`
  (kills, deaths near you, blows, orbs — `GaugeFeedSpec` = a ChargeGainSpec
  minus its bank) and/or a regen clock, SPENT at the press (THE PRESS PAYS
  — beside mana, an interrupted bar still paid), then SILENCED by a
  lockout that takes nothing (the anti-chain law, aging on the owner's
  own seconds); ONE READINESS — an unfilled gauge is "not ready" through
  `Actor.unmetGate`, the same predicate a charge floor uses, so bar/AI/
  press agree and the note reads the fill; THREE ORDINARY STATS
  gaugeGain/gaugeNeed/gaugeLockout — base-1 multipliers registered by the
  module, tag-scopable like any modifier; transient on
  `SkillInstance.state`; the slot draws the bank rising as an ether meter)
  and THE POOL (`ChargeDef.regen` — a per-ACTOR bank's BASELINE clock in
  charges/10s beneath the standing `chargeRegen_<id>` investment, ticking
  only while a slotted skill SPENDS it when `regenNeedsSpender` asks —
  `Actor.spendsCharge`; spending is ordinary `chargeCost`; the Titan-Quest
  Shade shape as one def row: `wisp`). THE PRESS MODES: THE PARTIAL PRESS
  (`partial` — fire from minFrac of need, spend the whole bank, POWER
  ramps floorPower→1 by `gaugePowerOf`), THE OVERFLOW (`overflow` — spend
  the whole bank at power PAST one, up to bankMult), THE HASTENING
  (`cooldownPer` — while the skill's own clock runs, a banked point SHAVES
  it instead of banking; clear, it banks — the two-phase art); power is
  stamped at the press (`state.gaugePower`) and read in three lanes —
  damage (into the press's dmgMult), counts (shots/strikes/summons) and
  `BuffEffect.powerStacks` (stacks per unit of power) — a gauge-less skill
  reads 1 by construction. THE PRICE FLOOR grew two shapes for
  ultimates (gauge ≥ minGaugeNeed | pool ≥ minPoolCost). Debuts
  (data/ultimates.ts): Grave Tide (30 souls → the horde; the partial
  press from three), the Reaper's Toll (8 kills, no super mark — the
  kill-speed build-around), Hush of the Wake (the whole wisp pool), Doom
  Bell / Last Rites (the low-life license) / Stormcrown on cooldowns; THE
  D4 ROSTER, each wearing a Prime/Supreme-style `SkillDef.tree` (the
  skill-mode fabric's exact cover as ordinary modifier rows): Red Hour
  (Berserker — overflow + hastening, wrath worn as powerStacks), The Long
  Cold (Sorcerer — freeze, near-immunity, the shatter), Rain of Knives
  (Rogue — the partial press on a storm), Litany of Dawn (Cleric — shafts,
  then the mending); THE LAB KIT (`ULT_QA.grantArts` →
  `World.dealLabArts`, the Mireille gift lane minus the learn) deals them
  into a fresh bag on the lab branch — docs in `docs/engine/gauge.md`,
  probe `balance/probe_gauge.ts`),
  `throng.ts` + `cling.ts` (THE THRONG FABRIC — the swarm you GATHER, the
  shared `minionCombat.ts` survival/handling profile and Command: Recall are
  measured in `balance/probe_throngcombat.ts`; contract: `docs/design/throng-combat.md` —
  Pikmin/Overlord playstyle as data: `SkillDef.throng` anchors a roster of
  sight-gated wild husks CLAIMED by walking through them, acquisition as
  open `ThrongSourceRow`s (finite pockets / timed motes / crit + kill
  triggers / a hit-fed gauge for add-less bosses / the RECURRING BROOD
  trickle — one body per clock below cap, husk-at-feet or straight-to-
  roster, disarmed at cap), sources GRAFTABLE by gems
  (`SupportDef.throngSource` — the world-found flavor learns a battle
  gauge by socket choice; authored rows resolve FIRST so pocket claim
  keys never shift; gems gate on the registry-folded 'throng' tag), THE
  FIND LEVERS as plain stats (`throngPockets` appends zone pockets after
  the authored rolls; `throngYield` scales every mint event's body count
  through ONE quanta-rounded fold; pocket hearts on the main salted
  stream, cluster/scatter on per-pocket forks — levers change counts,
  never maps), THE PLY LEVERS on the whole summon family (`minionPlies`
  stands the fabric UP on plied-less bodies; `minionLifePlyTrade`
  converts life-increase into plies at a threshold, read PRE-batch — the
  quanta law's symmetry), the held channel's
  `throngDirect` sweep riding assault orders, owner minion investment
  folded at 1/batch (`bakeMinionOwnerStats` — the ONE fold, quadratic-
  proof), nearest-1 meta delegation, unslot = disband-to-husks; THE LATCH
  (`MonsterDef.cling`): bodies that ride a victim's rim and whack through
  their own kit — size-scaled seats, shake clocks, `rideStatus`, knockback
  scrape, cast bars that TRACK the carried victim (the latched hand), and
  two optional ride tempers as pure spec data: THE GNAW (`cling.gnaw` —
  the ride's damage is a steady credited chew through the swallow-digest
  grammar, scaled by the rider's own folded sheet; useSkill refuses casts
  while riding — the teeth are the kit) and THE BURROW (`cling.burrow` —
  the rider sinks INSIDE the body it rides: a one-directional hostileTo
  early-false blinds the HOST to its own parasites while everyone else
  still scrapes; the shake pops it out SCATTERED into a real vulnerability
  window before it may re-burrow — the Pikmin loop; `burrowed` marker +
  `StatusDef.ghostAlpha`, the generic draw-faded render lever; debut
  `marrowgrub`/`loose_marrowgrubs`); husks never gate a clear
  (`countedEnemies` exempts actor-level passive+untargetable scenery
  armor — the Hivecaller's pockets no longer wall the objective); grapple
  is the shaped open seam — docs in `docs/engine/throng.md`; probe
  `balance/probe_throng.ts`),
  `sequence.ts` (THE COMBO GRAMMAR — ONE sequence matcher for every cast
  grammar: `matchSeqRule`/`resolveSeqRules` serve both the invocation
  rune-weave (`data/invocations.ts` delegates; parity fuzz-pinned) and
  `ComboRuleDef` cast-cadence rules (`data/combos.ts`) read off a null-
  cost-until-equipped recent-cast ring (`Actor.castRing`, gated by
  `comboWatch`); patterns over cast TAGS (ordered seq / counts / vary /
  repeat + `within` windows × the `comboWindow` stat), payoffs as owner-
  scoped ProcEffects through THE proc executor, granting via the ordinary
  `combo_<id>` stat family (passives, the Spellblade vocation, equipMods,
  `MonsterDef.mods` — the cadenced kin drum the SAME rules players earn,
  `beatPips` look part as the tell), starter `comboVaried`/`comboRepeated`
  ConditionIds + Polyphony/Ostinato gems; HUD pip rows + co-op `cb`/`rn`
  wire fields; vocabulary law: comboChain EXECUTES, castCycle COUNTS,
  invokes BANKS, the grammar READS — docs in `docs/engine/combo.md`;
  probe `balance/probe_combo.ts`),
  `skilltree.ts` (THE SKILL-TREE GRAPH — the skill-mode trees' ONE
  resolver: `SkillTreeSpec.nodes` free graphs (`links` any-of
  prerequisites, `excludes` = THE HARD LOCK at node grain, `ranks` =
  repeated ids, `x`/`y` pins) with the settled 2×3+1 `branches` +
  `neutral` shape folded as SUGAR (byte-identical M1 words); REACHABILITY
  IS THE LOCK (derived from spent ids, never stored), THE LIMB (a forking
  root child) names the `skill@limb` census hosts / the tooltip line /
  the bar pip / the sealed path's refusal words, THE COVER LAW replaces
  exact cover at boot validation, and the derived radial layout feeds
  the inventory skill-tree page — `ui/panels.ts openSkillTree`, drawn
  the passive tree's way (SVG nodes + edges, zoom/pan, shared tooltips,
  click-to-spend), opened from the Skills drawer's strip + the milestone
  popup; charter `docs/design/skill-modes.md` §3/§7/§8, probe
  `balance/probe_skillmodes.ts` N),
  `grab.ts` (THE GRAB FABRIC — sustained bodily control as ONE state pair:
  `Actor.gripping`/`heldBy`, verbs carry/drag/pin/swallow as `GrabSpec`
  presets on the `grabSeize` skill effect, throw-release via `grabThrow` +
  the `holding` gate; the victim slaves to `grabSeatPos` (drawn == held,
  reeled in at `reelSpeed`), mass-law eligibility off `effectiveWeight` ×
  the `gripPower`/`wriggle` stats, and the counterplay LADDER — struggle
  (refused inputs feed the meter at moveActor/useSkill/pushActor; reflex
  flasks pierce), ally SEVER on holder damage, hard-CC/shove releases,
  finite holds (monster expiry spits via `spitAt`); throws ride pushActor
  so authority, wall wounds, the bowling lane and pit credit arrive from
  the mass fabric free; policy tiers by rarity + `MonsterDef.grabbable`;
  `seized`/`swallowed` markers (+ `StatusDef.conceals` renderer skip),
  struggle-meter HUD + co-op `gb` wire; THE GRIP KIN tutors (wrangler
  drag / yoke-mauler pin drumming the Takedown combo / gulper + planted
  maw_bloom swallow) with grapnel/yoke/gulletSac kit-part tells, and the
  `gore_stakes` speed-gated contact terrain (`TrackPayload.minSpeed`) —
  docs in `docs/engine/grab.md`; probe `balance/probe_grab.ts`),
  `mounts.ts` (THE MOUNT FABRIC — cavalry as ONE state pair:
  `Actor.mountId`/`riderIds`, the `{do:'mount'}`/`{do:'dismount'}` verbs,
  and `World.updateMounts` doing pairing/pin/severance late among the
  movers. TWO data levers pair at spawn through the composite-parts
  lazy-attach idiom: rider-side `MonsterDef.mount` (arrives mounted —
  steed minted beneath, any spawn path) and steed-side `mountSlot.crew`
  (arrives manned); `mountSlot.seats[]` = facing-frame saddles + screen-up
  lift (capacity IS the roster), `onRiderDeath` 'fight'|'rout' answers the
  last rider's death, THE UNHORSED BEAT throws a rider whose steed dies
  (`unhorsed` status window), a landed grip or willed step quits the
  saddle, movement-tagged skills refuse from the seat, and the REMOUNT
  rule is pure data (`AICondition.mounted` + the verb). VOCABULARY LAW:
  parts = siege platforms (organs), mount links = true cavalry (two
  sovereign bodies). Faction identities: goblins WIDE (wolfrider→warg
  split true, gnasher_hopper on the herd, the Warboss astride a great
  gnasher), demon towers crewed, undead bone-steed lancers in order,
  rimebound hound-coursing lances, beastkin deliberately parts-only. THE
  AMBUSH FABRIC deepened beside it (`AmbushSpec.visible`/`pack` + the
  `LandmarkSpawns.ambush` instance lane + wound-springs via
  `World.springAmbush`): the GNASHER PEN landmark (palisade-rim pit,
  penned herd sprung as ONE event) seats in every goblin_warren_camp —
  docs in `docs/engine/mounts.md`; probe `balance/probe_mount.ts`),
  `lairs.ts` (THE LAIR FABRIC — apex natives claiming ground by PREDICATE:
  `registerLair` seat rows (biomes × place cave/surface/both × a caveDepth
  STRATA envelope × a level envelope × chance — "yetis only in the first
  and second caves under the mountains" is one data row) resolve to
  ordinary LandmarkRolls at BOTH mint chokepoints (placeZoneAt + mintCave;
  noDeeper pockets + ports refuse; unclaimed ground burns no rng — the
  fold is pure), so siting/reachability/portal-clears/genqa all arrive
  from standing law. TWO LANES: a DEN (the `den_mouth` builder — spoor
  dress ring + a registered sidezone mouth → mintCave-forced den country
  with authored name/objective/fauna/noDeeper + gateway ledger; position-
  hash seeds = persistent geography) or an in-zone LAIR (any landmark
  whose spawns carry the natives — the pit builder grew fence_ring's
  `inner` dressing rows). Debuts: the FROSTMAW (yeti snatch/hurl = the
  grab fabric as identity; snow-hare larder hunted through hunger drives;
  the Rimefather boss ask), the GIANT'S CAIRN (visible sleeping ambush,
  the gnasher-pen law), the HAG'S HOVEL (coven crone, confusion-family
  kit), and the RIDDLE VAULT (objective = a PUZZLE — exploration as the
  ask; the Vault Sphinx stands as a dormant latched-once `vault_warden`
  through `registerRouseRule`, the NEW open sibling of registerDormantTag
  in ai.ts). Factions `jotun`/`coven` debut diplomacy-silent (natives
  claim ground, not wars); alphas pay the lean repeatable `lair_hoard`.
  WAVE TWO (lairs of many laws — each debut seats ONE landed fabric as
  its whole argument): the MAZE (karst labyrinth den; the bull hunts
  trail prints — the watch fabric's scent posture; standing water breaks
  the line), the EMBERWYRM BARROW (volcanic; a true sleeper over a
  gem-cache hoard floor whose fire verbs are all PRICED from one finite
  reserve — rob it on tiptoe or starve the ember), the SPINNEY (forest;
  a lite-colony brood + the matron's strength hung beneficiary-side on
  her weaver court — the silk bond rope IS the kill order), and the
  WELLSPRING (the naiad ON the traced rivers via `LairSeat.courses`,
  the fold's new course axis — rooted on `water`, drawn wilt off it).
  WAVE THREE — THE LADDER: seat axes `interior` (envelope over
  ZoneDef.geo.biomeDepth; geo hoisted above the roll merge + inherited
  down the cave ladder) + `climate` ([min,max] bands over the climate
  axes — elevation as a gate), so one biome reads as a PROGRESSION;
  debut = the DRAKE ROOST (highland level 14+ × interior ≥0.55 ×
  elevation ≥0.55: a crag mouth onto an OPEN-SKY shelf — explicit
  def.sky beats the caveDepth derivation — where Old Scald keeps a
  gem-cache hoard and a live ibex larder; the lair's law is the ANATOMY
  GAMUT: wings = a real part whose break silences BOTH wing verbs).
  WAVE FOUR — THE CROWN LAIRS + THE CONDITIONED DOOR
  (`SidezoneDef.when` — a RadianceCond gate on any sidezone mouth: a
  closed door never starts the dwell and floats its `refusal`, so the
  schedule reads; author on open-sky parents only): the LEVIATHAN
  TRENCH (deepsea interior ≥0.6, level 16+ — the Fathomking: the
  SEGMENT fabric at full reach, 14 hittable coils with per-segment
  wound pools that TEAR permanently + retaliate, gulp/undertow/breach
  kit) and the KING'S BARROW (downs 12+, opens ONLY after dusk — the
  Unquiet King under nocturne hours, scarcely killable while his
  phylactery stands ANYWHERE in the halls: the pack fabric's drawn
  beam at boss scale is both the reason and the map to the jar) —
  docs in `docs/engine/lairs.md`; probe `balance/probe_lairs.ts`),
  `tells.ts` (THE TELL FABRIC — visible internal state as a readable
  information layer on enemy bodies: `MonsterDef.tells` rows bind a STATE
  SOURCE (open `registerTellSource` registry — drives, charges, status
  stacks, morale, alertness, the fuse, plies spent, radiance, claimed
  ground) to a VISUAL CHANNEL (a worn gauge part riding the live-part
  pass — `params.fill` + scale/alpha/count/color dials make ANY painter a
  meter; body tint on the drift's quantized pre-bake swap; a state-fed
  under-glow; posture scale/lean on the breathe transform; an adorn swap)
  through band/curve/quantize dials. THE LAWS: drawn == tested (a tell
  resolves off the SAME map the AI reads — the sac that reads full IS
  full; sources are pure reads, never writes), cheap (cadenced sweep,
  wire-grid quantize, identity-stable dress — `Actor.tellRev` moves only
  on true change), co-op safe (the wire ships DERIVED scalars `tl` + the
  variant roll `bv`, never source state; the client rebuilds specs from
  its own registry), portrait-aware (the book renders `TellSpec.portrait`
  sane defaults through the ONE `portraitDefOf` seam — portrait.ts stays
  vis-pure). TEMPERAMENT TELLS: `brainVariants[].tells` rows append per
  roll, so a rolled mind is VISIBLE (the skitterer's loner runs dark and
  hunkers once it has marked you — `alert` is the stalker's honest
  step-tell). Debuts: `mire_leech` the accumulator (glut drive fed by its
  own landed wounds — the first authored `onDealt` — → the translucent
  `fillSac` gauge-limb → sanguine_burst at the brim with the drive shoved
  empty: the sac drains exactly when the bank spends, and the burst is
  reserved OUT of its rotation so the full sac is the only warning) and
  `HUNGER_LEAN`, the one shared predator row all twelve hunger-driven
  hunters wear (the probe census names future shirkers) — docs in
  `docs/engine/tells.md`; probe `balance/probe_tells.ts`),
  `watch.ts` (THE WATCH FABRIC — attention as a VISIBLE LADDER:
  `MonsterDef.watch` gates a watcher's UNPROVOKED fresh lock behind a
  rising suspicion meter (unaware → stirring → searching → locked;
  thresholds GLOBAL in `WATCH_CFG.rungs` — the ladder is a language, def
  dials tune only speeds), each rung riding standing machinery — stirring
  TURNS the head, searching plants the alertUntil/alertFrom investigate
  walk, locked is the ordinary lock with the shout jumping kin ladders to
  the search cap. THE LAWS: drawn == tested BY CONSTRUCTION (the scan
  STAMPS the exact scalars it tested — `Actor.sense*` — and the fan
  (`render/vis/watchLayer.ts`) re-folds them through the scan's own
  `senseReach` with every ray clipped by the same castRay-'sight' ride,
  `World.sightClipD`; `SENSE_CFG` hosts the historical perception
  constants), ladders DECAY (lazy-decay pure read `watchValueOf`; the
  stand-down walks a spent lock all the way down and re-arms the gate),
  PAIN NEEDS NO LADDER (a wound bypasses the gate, and resolveHit jumps a
  wounded watcher to searching toward the blow's author — snipe it, never
  leave it dumb), a LOCK IS A LOCK (any fresh lock pins aggro so the tell
  can't lie mid-fight), side channels CAP at search (noise and scent say
  WHERE, never WHO). Postures: `sweep` (the sentinel's scanning gaze),
  `sleep` (the drowser: cone collapses to the drawn hearing ring below the
  stir rung; footfall-scaled feeds — creep the rim), `scent` (the tracker
  hunts trail prints in lay order — players print `Actor.trail` while a
  scent-watcher stands; `wading`/`swimming` suspend printing, so WATER
  breaks the line; landPartyAt clears it). `World.noiseAt` is the open
  stimulus (the `noiseOnHit` stat rings it at resolved blows + spent
  flights — the Ringing Report support's lure play). Co-op ships
  `ActorW.wp` derived scalars (the tell-wire idiom). Debut: THE BARROW
  WATCH lair (data/lairs.ts, downs/field) — `barrow_watchman` (lantern
  cone + callout) / `gorged_ghoul` (eyes that exist only as a tell part;
  runs dark asleep) / `barrow_hound` (nose-down lean, 0.55× sight) — plus
  the `skeleton_archer` sentry showcase retrofit. Docs
  `docs/engine/watchers.md`; probe `balance/probe_watchers.ts`),
  `rampage.ts` (THE RAMPAGE FABRIC — temporary doodad destruction with a
  GUARANTEED return: `MonsterDef.rampage` bodies PLOW, felling fellable
  standing doodads at true-surface contact (worm bodies along every coil;
  fell-before-move, so the shared confine needs no bypass) through the ONE
  chokepoint `World.fellDoodad`; `Doodad.felled` reads DOWN at the blocking
  trio + `sightShadowFrac` (drawn == tested for movement/shots/sight/veil at
  one seam), fellable is DERIVED (standing bodies minus state-carriers:
  doors/wells/hollows/pits/spans/seed-paired/brittle; `DoodadRule.fell`
  overrides — wyrm_coil's authored refusal) and TEMPORARY BY CONSTRUCTION:
  the regrowth sweep (THE HOLD pushes wakes while the cause stands, jitter
  staggers the release, THE ENTOMB LAW defers completion around bodies),
  zone re-mint from seed, and save-silence are three independent roads back
  — no path to a barren world exists. Renderer draws crushed pieces as
  THEMSELVES squashed/fading (`fellFace`, zero new painters); co-op ships
  position-keyed `fell` rows (the wells idiom). THE SETTLED GROUND rides it:
  `WorldBossDef.roam.venue` default 'ground' seats the settled serpent's
  fight IN the real rest zone (no more jarring minted eldritch pocket;
  'arena' stays pure data), and `Actor.driven` exempts engine-wheeled bodies
  from the passive volition lock (the parked glimpse-body regression). Docs
  `docs/engine/rampage.md`; probe `balance/probe_rampage.ts`),
  `squish.ts` (THE SQUISH FABRIC — death underfoot, the D2 desert-scorpion
  law as data: `MonsterDef.squish` bodies die to TREAD — any grounded body
  out-massing them by the spec's `ratio` (ONE effectiveWeight read —
  density/heft/poise all speak; faction-blind, no player special case)
  kills them by walking over them through the ordinary credited kill();
  worm files are tender along every segment (segR — drawn == trodden),
  squish pairs skip the crowd shoulder (the boot goes OVER, the
  flat-construct precedent), dormant sleepers spared (the sentry law);
  debut = the ant trail at TRUE ant scale + the sand scorpion at
  `ratio: 1.6` — docs in `docs/engine/squish.md`, probe
  `balance/probe_squish.ts`).
  THE AUTHORED-MAP FABRIC (engine/authoredMaps.ts — a HAND-MADE zone as
  data; docs/engine/authored-maps.md, charter docs/design/map-editor.md,
  probe balance/probe_authoredmaps.ts): an AuthoredMapDef is a char-grid
  of REGISTERED REGION KINDS on the 30px lattice + off-lattice doodads,
  SPAWN SEATS (a def at a point — count/spread, rarity through the real
  ladder, ambush, a duty post + facing; the pit-dweller lane's
  `SpawnSeat` row grew the tempers), markers (entry/boss/poi/camp/
  garrison/breakable/npc), plan-structure fixtures and exit seats, under a
  zone sheet (dress tileset, objective, level, sky, camera, pack/dress/
  spoils/weave policies, an optional bounty EXPEDITION block). ONE
  generator ('authored', pinned) rasterizes it (the fieldLayout idiom:
  per-row region runs, THE ENTRY LAW re-keys a centre entry onto the entry
  marker, THE STEMS clear + corridor every engine-seated portal, the belt
  carve), draws ZERO rng; a map is named by `layoutParams.authored` and
  resolved at GENERATION time (edit → re-enter → see it; a missing map
  degrades to the scatter with one warning). ONE directed mint
  `World.mintAuthoredZone` (authoredZoneSpec pins exact size/rect/recipe/
  policies, sealAuthoredZone strips every tileset roll + zeroes pack
  density + closes the cohort + re-seats frontiers; NEVER `special` — its
  eventOwned stamp culls unclaimed ground at save) serves THREE LANES:
  `QuestZoneSpec.map` (the Odyssey set-piece door — the quest's words win,
  its silence defers; `tileset` optional now), the bounty board's
  'expedition' kind (data/bountyExpeditions.ts — CHARTERS new ground at
  the take through the world-act hook), and the dev lanes
  (devMintAuthored / devRemintZone's one-shot memory forget /
  devAuthoredMapHere; dev tab 'Maps'). THE ATLAS (meta/atlas.ts — the
  Workshop's shape: slot 'atlas', the custom_ law, TS promotion literal +
  a ready QuestZoneSpec snippet) stores editor maps; THE MAP FORGE
  (dev/mapForge.ts, DEV.mapForge or `?dev`) is the editor — roster /
  canvas (real painters, registry-derived palettes, ten tools) /
  inspector, with THE GEN LAYER running the REAL generateLayout after
  every edit so drawn == generated before a mint. Debuts
  data/authoredMaps.ts: the Proving Yard, the Sunken Reliquary.
  THE CLUTCH FABRIC (engine/clutch.ts — bodies as PAYLOADS of blows): the
  generic `birth` SkillEffect mints REAL monsters/minions at a delivery's
  resolution point — ground targets, EVERY storm strike's ring (the
  Vile-Mother mortar: stamped on the strike zone, executed at detonation),
  a flight's honest end, or — `onHit` — the struck body itself (resolveHit,
  dealt>0, the flame that leaves a living spark in the wound).
  `instanceBirth` is the ONE read (native row wins over the
  `SupportDef.birth` graft — the kindred rule) and `World.birthAt` the ONE
  executor: player-team casters mint ordinary minions through spawnMinion
  (synthetic summon delivery — roster caps, owner bake, lifespans,
  the unlearn sweep, all standing law), enemy casters mint permanent kin
  at the MOTHER'S level (`Actor.bornOf` census behind THE CLUTCH CAP — at
  cap the sac lands wet, never evicts; noBounty by the conjured-stream
  law, `bounty:'full'` the dial; pool rows breathe through presence
  envelopes at the caster's level; findFreeSpot seats, emergence reads).
  The 'landing' SUPPORT_MECHANISM gates graft gems structurally
  (projectile/storm/ground). Debuts: vile_broodmother (demon — the
  bloat-mother drive grammar aimed downrange, fillSac tell) → vile_spawn,
  barrow_gravemaker (undead — the pool REUSES zombie/skeleton kin),
  goblin_whelpsling → gnasher_whelp, the Cinderwisp player skill
  (hit-gated sprite birth) + the Broodbearer landing gem. THE RULED WAVE
  (2026-08-28, her word): `BirthEffect.orphan` per-spec fates on the
  mother's death ('die'/'wither'/'frenzy'/'rout' — World.clutchOnDeath;
  the rout rides StatusDef.panic; "it depends on the mother" is the law),
  `BirthEffect.incubate` egg vessels (clutch_egg — a killable cap-seat
  body whose term hatch is the EGG'S own brood: FREE RECURSION is the
  standing default, caps bound each generation), the 'birth' ProcEffect
  (combo payoffs, blocks, kills — the Forgebound census key
  '__proc:<id>'; World.birthAt takes a null inst as the door's shape),
  and the 'clutch' tell source (Actor.clutchLive stamped off the SAME
  bornOf census the cap reads — the whelpsling's crate empties honestly;
  the crate left the LOOK, the accumulator law) — docs in
  `docs/engine/clutch.md`; probe `balance/probe_clutch.ts`.
  THE SUPPORT BASE (engine/supportbase.ts — the gem as an ITEM BASE, her
  ruling 2026-08-28): a SupportDef wearing `rollBase` is a CHASSIS whose
  payload is CUT PER COPY at the mint site (one weighted row per axis —
  `SupportInstance.rolled`, serialized verbatim through wrapper/socket/
  save/corpse/vendor rows; rehydration NEVER re-rolls) and ordinary in
  every other mannerism (normal drop stream — vendor cuts under the
  foreordained shelf's seeded swap, the commission on its beat rng).
  THE CANONICAL CUT (each axis's rows[0]) is the census face the no-op
  matrix probes, the worn-graft default, and the per-axis tolerant
  fallback for data-patched row ids; THE GATE READS THE CUT
  (supportFitsInst's optional `rolled` — rows carry requiresMechanisms;
  refuse only a cut that cannot work, blob-less gates canonical); the
  'spawn' chassis folds trigger×brood×clutch into per-landed-blow births
  through the clutch door ('__vein' census, gauge state on the socket).
  Debut: Teeming Vein (steady/gauge/chance × broodling/gnatling/cinder/
  marrowgrub × 1/2/4). THE MODS CHASSIS (kind-less rollBase): rows carry
  `mods` folded into instanceMods under the forward-price law — how an
  EXISTING gem converts under THE IDENTITY LAW (canonical cut ≡ the old
  fixed values, byte-identical legacy; only fresh drops roll). Debut:
  MULTISTRIKE (strikes one/two/THREE × tempo 0/−8/−14/−20% — the premier
  cut is the chase) — docs in `docs/engine/supportbase.md`; probe
  `balance/probe_supportbase.ts`.
  THE DEFENSE-TEXTURE DOCTRINE (signature pools ship EMPTY): poise /
  insight / energy shield are authored identities, never ambience —
  attributes only SCALE them (1%/pt), bases come from gear defense
  lanes, passives, stance grants, or `MonsterDef.base`;
  `MATERIAL_NATURE` (data/monsters.ts) gives every surface material a
  gameplay ontology (`remains` → the kill-path corpse-mint gate;
  `breathes` → the default kite budget `BEHAVIOR_CFG.defaultKite`, so
  living kiters always tire; `density` → the mass fabric's weight fold),
  and the `insightSap` stat lets
  chill/freeze/stun bind the duelist's read — docs in
  `docs/engine/defenses.md`, probe `balance/probe_defenses.ts`.
  THE CONVERSION FABRIC (engine/stats.ts — "read A as B" as open data):
  STAT_TRADES rows carry TWO separable ordinary-stat dials per lane
  (rateStat gain + row-scoped forgoStat price — rate alone is a pure
  additive ECHO, both together a true trade; the dials themselves take
  modifiers) beside free-form stat LINKS (`linkMod` — "gain X% of A as
  B" anywhere a modifier goes); THE GOLDEN RULE makes every grant read
  its source at the links-and-trades-disabled PRE-FORGO baseline —
  single-hop, no chains, no A→B→A compounding, full forgo still
  converts the whole pool (Iron-Reflexes math), infinities impossible
  BY CONSTRUCTION. Lanes: evasion→armor, ES→poise, evasion→insight
  (The Duelist's Ledger unique carries both dials). Threshold quanta
  conversions (minionLifePlyTrade / the additive minionLifePlyEcho at
  the minion bake) follow the same one-baseline shape. Probe
  `balance/probe_conversions.ts`.
  THE SUPPORT-FABRIC LAWS (2026-07-21, probe
  `balance/probe_supportfabric.ts` — the golden rule: EXTENSIBILITY is
  the ultimate truth; an honesty refusal is PENULTIMATE, structural,
  and self-lifting — never a bespoke list):
  `SupportDef.requiresMechanisms` + the `SUPPORT_MECHANISMS` registry
  (engine/skills.ts) gate sockets on live-instance predicates
  ('cooldown' from any source, standing 'engagement', 'affliction',
  the 71-gem 'strikes' FLOOR — hit-rider gems refuse never-hitting
  hosts, self-lifting via STRIKE_GRANTING_GRAFTS and the CREW HOP
  (crewSkillsServed runs the gate per crew skill wearing the riders) —
  and the PARAMETERIZED forms via `mechanismHolds`: 'affliction:bleed'
  names the wound, 'status:power'/'status:stacking'/'status:<id>' name
  the application; `StatusDef.powerInert` = the binary exemption, and
  interruptChance/scrambleChance scale by application power)
  that COMPOSE — Austerity's levy opens Alacrity, Spirit Totem's
  grantsTags opens Shatterrite, an apply_ gem opens Septic Bargain,
  each refusal returning when its enabler leaves. MECHANISM GRANTS
  unlock what is missing: `useChargeGraft` (Deep Reserves — a MAGAZINE
  on cooldown hosts, the EMPOWER bank on free skills:
  `useCharges.empower` rounds are OPTIONAL fuel, dry casts plain),
  `orbShedGraft` (Abundant Harvest's no-self-compounding floor), and
  `GLOBAL_SUPPORT_STATS` + the actor equip fold (Warding Flesh — worn
  defense on standing workings, engagement-gated; forwarded courts
  wear it too). THE AFTERMATH MINTER (`World.mintAftermath`) takes
  pulse/cascade/cadence beyond ground (nova/melee/detonateProjectile
  sequels as zones; the cadence gems are companions to a beat source).
  THE KINDRED RULE + THE INHERITANCE LAW (2026-07-21,
  `instanceCascadePlan`/`instancePulsePlan` — graft-wins is DEAD): the
  native lane wins the slot and the gem DEEPENS it — a same-direction
  cascade gem ELONGATES the innate march (Seismic March makes Sunder
  walk six shocks), pulse gems APPEND beats in their own character
  (Buried Charge answers Earthquake's 2.4× quake, never replaces it),
  and a different-direction cascade gem opens the RE-CAST lane: its
  displaced points each play the host's FULL native cast (the
  primary's clone — linger, quake, march walking on, EDGE BAND ring
  eyes via `Zone.edgeFrac`, drawn == tested) but never other grafts
  (graft → native → terminal; recursion impossible by construction).
  The near-copy overwrite this replaced was INVISIBLE to the no-op
  matrix (numeric divergence, design no-op) — the coming interaction
  sweep needs its own kindred metric.
  THE COURT-CREDIT LAWS: minionCarry procs divide by living court size
  on hit-frequency rolls (true kills stay whole), and kill charge-taps
  + orb/remnant sheds carry to the keeper via the summoning instance.
  Crits reach afflictions (`dotCrit`, rolled once at application — the
  Malignant Precision notable) and mends (THE LUCKY POUR: every
  heal/flask pour rolls the instance's own critChance);
  `hitToAffliction`/`afflictionYield` (Septic Bargain) forgo the hit's
  bite into the festering wound. `SkillDef.cooldownAt`
  'press'|'complete' picks the clock's start per skill. SIM LAWS: the
  ORDER LAW (actor ids reset per episode — probe E10b) and the FODDER
  LANE (kill-scoped payloads probe against killable bodies).
  THE MASS & AUTHORITY FABRIC (`engine/mass.ts` — who moves whom): the
  heavy both RESIST shoves and SHOVE HARDER — `pushActor` folds the
  pusher's `effectiveWeight^pow` (clamped, exactly 1 at weight 1 so every
  tuned strength and casterless push keeps its reach) over the existing
  target-weight divide; monster weight defaults from radius × material
  `density` × `MonsterDef.heft`; arrested momentum WOUNDS (wall impact =
  mitigated physical from speed × own weight, hostile-authored only,
  shover keeps kill credit like the pitfall lane) and THE BOWLING LANE
  slams bodies through bodies (arrest-vs-plow by mass ratio, momentum
  hand-offs with authority already spent); player levers are ordinary
  stats (`shoveAuthority`, `impactDamage` + the Battering Ram support +
  the mass passive cluster); bestiary prints a HEFT tier per def — dials
  in `MASS_CFG`, docs in `docs/engine/mass.md`, probe
  `balance/probe_mass.ts`.
  THE MASSIF FABRIC (`engine/massif.ts` — open country that also says NO):
  the MIXTURE layout archetype — wide-open zones studded with LARGE
  impassable interior bodies, all data four registries deep (mass SHAPES
  via `registerMassShape`, mass KINDS via `registerMassKind` → a
  registered region row carries collision/shot/sight/price/look, TENANT
  KINDS via `registerTenantKind` — per-court weighted occupancy tables
  (`MassKindDef.tenants` / per-row `over.tenants`) drawing ONE occupant
  per ring on the forked `TENANT_SALT` stream under THE REPLACEMENT LAW
  (a table gates off the independent garrison/inner lanes; core four =
  garrison/stock/cache/vacant + the `held_stock` composition), the
  'massif' recipe with every dial a layoutParam); `carveMassifs` is
  exported for composition and `healMassifWeave` guarantees one walkable
  weave — dials in `MASSIF_CFG`, docs in `docs/engine/massif.md`, probe
  `balance/probe_massif.ts`.
  THE TOWN THAT GROWS (`data/townBuild.ts` — Lastlight as a size LADDER;
  docs `docs/design/town-growth.md`, probe `balance/probe_towngrowth.ts`):
  `TOWN_TIERS` (count-based on owned town-station features: hamlet →
  village → town → township, read ONCE at World construction) × ONE site
  table `TOWN_SITES` (every seat per rung — base buildings, the plaza's
  waypoint, each station, the ward's cottages, the brook) behind ONE
  resolver (`townSiteAt` / `World.townSeat`) that the fixture, the `near*`
  dwell check, the NPC spawn and the renderer prompt ALL read (drawn ==
  dwelt; no seat derives from the arena size — the bare `*_SITE` consts
  are retired). Laws probe-pinned over every rung × every arrival side:
  THE APRON LAW (no dwell disc holds an apron/portal/the waypoint), THE
  ROAD LAW (portal → waypoint runs through no structure), THE QUARTER LAW
  (a site keeps its compass quarter), disjoint footprints, THE CENTRE
  CARVE (a fresh run's geometric entry is the exact centre and the
  portal-clear cuts blocking props there — the plaza sits a fountain's
  reach off it). THE SMITH'S YARD (bench → Brandt → stones → Font, west →
  east, paved by THE FORGE WAY; THE MAGICAL PAIR — the Font a stride east
  of the stones at every rung), THE INN FRONT (`bounty_front` — the
  board's unlock raises an OPEN-AIR notice board on the square before
  Mireille's door, re-ruled 2026-09-05 from the roofed alcove: a roof
  hides a read-me station; legend `N` = a board cell, `noticeBoard` the
  painter; THE DOOR LANE LAW — nothing of the front stands in the door's
  approach column, the inn lights its step with `wall_lantern`s; v4
  2026-09-06: no post and no flower box on the front — the boxes stand
  under the inn's windows, the board wears ONE wall lantern off its post
  (`props[].rot`), and THE LAMPS ALONG THE WAYS ride the wayside fabric's
  marker row `TOWN_WAYSIDE` with the door way `bare`), THE ANCHORED DWELL
  (2026-09-06, her word: a dwell belongs to the OBJECT — a plan cell's or
  prop's `anchor: true` stamps `Doodad.anchor`, `World.stationAnchor`
  centres every station dwell + prompt on that live piece, a felled piece
  takes its dwell down, no piece no dwell; THE STATION FOLD re-folds
  owned stations at every town load at the fixed rung; THE SAME-STORY LAW
  on `dwellReachable` — no dwell crosses a story, the inn's door never
  swings from upstairs — docs/design/town-growth.md §1.9–1.10,
  docs/engine/los-pathing.md; THE INTERACTION SWEEP (2026-09-06): every
  proximity act compares stories — dwells through `World.storyPair`,
  pickups/orbs/corpses through THE SPOILS STORY (`GemDrop.tier`: the kill
  path + the wounded purse set `World.spoilStory`, the context every
  drop/orb helper clamps on and stamps, else settled from the floor's word
  `floorStoryOf`; `pickupSeat` the one chokepoint), harvest arms, revives,
  the throng's claim, the latch, the grab hand-off and the minion recall;
  and THE ENCLOSURE LAW (`ZoneTiers.enclosure` → `tierEnclosure`,
  engine/tiers.ts): 'under' layers and `interior` storeys derive ENCLOSED
  — the rim fall never fires and a shove, leap, blink or recall clamps at
  the story's edge through the mover's own view (the carry clamps pass
  `{ mover }`, `teleportActor` takes a `story`) — buttes stay 'open';
  probes probe_storey H, probe_tiers RIG S, probe_towngrowth H's door;
  and THE SOVEREIGNTY GATE (`sameStory(a, b)`, engine/tiers.ts —
  2026-09-06, her "invisible wall": a culled other-story body shouldering
  the hero): bodies on different stories share a screen, never a TOUCH —
  ONE predicate at every body-vs-body and body-vs-hazard seam (the crowd
  shoulder + its own-story nudge clamps, the bowling lane, the tread, the
  flock/spacing, auras, heals, doodad effects, the crystal wash, rupture,
  death bursts/blooms (`DeathBurst.tier`), tether bands, constructs,
  channel supports, domes, the skill FIELDS (`Zone.tier` settled at the
  first tick), `pressingFoeNear`, ambush packs, taming, trapworks
  (`PlacedTrapwork.tier`), tracks (`PlacedTrack.tier` → `strikeTier`),
  vents (`PlacedVent.tier`), creep (`CreepSource.tier`), fog
  (`FogBank.tier`), lightwells, the collapse crumble, the gale
  (`windAt(pos, tier)`), and the lite pool's `story` column); sight,
  sound and scent keep their own laws; THE DERIVED CENSUS (her word: the
  roster is derived, never a hand list): probe_tiers RIG T finds every
  seam by SHAPE — a World method that iterates bodies and tests geometry
  — and requires the gate or a source marker `// SOVEREIGNTY: <reason>`
  from a closed vocabulary (sky/sound/scent/sight/targeting/census/seat/
  self), so a new proximity seam is gated, marked, or named gateless the
  day it is written (live: deck/duct statue rigs, probe_storey I); and
  THE INVESTIGATION CROSSES (her ruling 2026-09-06): a lure or noise on
  another story makes a body aware and it WALKS to the crossing, never
  teleports — A GOAL CARRIES ITS STORY (`moveToward` reads `goal.tier`,
  `tierLinkToward(a, goal, goalTier)` elects a crossing even on both-
  floor ground; `Actor.alertTier`/`watchTier`/`aiLastSeenTier`,
  `TrailPoint.tier`, `setLure(..., tier)`, `noiseAt(..., tier)`, the
  kernel `goal.tier`; arrivals ask the story) — probes probe_tiers RIG U,
  probe_storey J — docs/engine/tiers.md), THE
  INN'S FLOORS on THE STOREY FABRIC (`engine/levelgen.ts` storey
  composite + `world/regions.ts` storey rows — `StructureDef.storeys`: a
  second char grid folded cell for cell over the ground plan into ONE
  region per cell (storey_floor = one cell two floors; storey_wall = THE
  HANGING WALL via `RegionKind.hangingFrom`, read at the ray's height by
  the elevation law; `A`/`^` = a real tier crossing + its landing); the
  story's furniture/folk stamped `tier`; the story's own room ledger with
  ARCHWAYS; `ZoneTiers.interior` stamps the zone a silent stack; the
  renderer culls per building + paints THE STOREY LAYER live —
  docs/engine/storeys.md, probe `balance/probe_storey.ts`; the inn's
  `stairway` face is bigger and unlabelled, and the flight climbs NORTH
  from the door end onto a landing that opens straight into the hall —
  2026-09-06), THE INN KIT
  (`t c a K j x i J u y l` legend chars, `render/vis/paintersInn.ts`;
  chairs are walk-over decor), THE HAUNT (`BehaviorSpec.haunt` — idle
  conduct between named furniture; THE STROLLING SCENERY: a passive body
  wearing one strolls and stays scenery) + THE FOLK ROSTER
  (`data/innfolk.ts` pools → `StructureDef.folk` seats rolled per zone ×
  seat × DAY off the zone's seed, the haunt on its own per-body die — THE
  OFF-STREAM LAW; charter docs/design/townsfolk-life.md), THE SPOKEN
  SEAT (`StructureDef.npcs[].line`; probe rig J), THE SPEECH GRAMMAR
  (`engine/speechGrammar.ts` + the corpus `data/speechGrammar.ts` — WHAT a
  spoken body says, her "Rimworld levels of colony member discussion"
  ruling 2026-09-06: TEMPLATES with SLOTS resolved off the world's own
  state at the telling (`{other}`/`{doing}` = a named present body of the
  same COMPANY and the haunt piece it faces, `{weather}`, `{lastEvent}` off
  the notice feed's `newsLog`, `{monster}` off kill()'s credited `slainLog`,
  `{from}` = `entryFrom`, `{phase}`, `{heroClass}`, `{town}`/`{zone}`,
  `{hero}` = the renderer's renown-gated `{name}` token) in an open
  registry with ROLE pools (`MonsterDef.speechRoles`, `FolkRow.roles`,
  `TownResidentRow.roles`) + gates; THE DEAL hands every company-day
  pairwise-DISJOINT decks on a local seeded stream (no two folk say one
  line in a day), THE FIRST WORD keeps every authored line leading its
  deck (round-robin claimed), THE ROTATION composes once per fresh
  approach and stamps the line for its window; `World.speakerRows` +
  `composeSpeakerLine`/`speechContext` the one consumer, `sid` on the
  layout's npc/folk rows = the company; docs `docs/engine/speech-grammar.md`,
  probe `balance/probe_speechgrammar.ts`), THE COUNTER LAWS on the board itself
  (`BOUNTY_BOARD_CFG.counter`: THE TEAR-OFF closes the panel on a take,
  THE RETURN turns a resolved hand in at the linger before the slate
  re-opens, THE RECEIPT prints the pay — probe_bountyboard rig S), and THE READINESS LAW (2026-09-12: `World.handState` → `questStanding` — ONE fold of a held posting's standing off its kind's own done()/failed() predicates, read by the journal, the map pins, the board card, the prompt, the withhold notice and the turn-in alike; the zone objective is never a posting's deed — rig T, docs/design/bounty-board.md §8), THE
  BROOK (the random `river` retired for an authored
  `course` stamp per rung — StampSpec `path`/`lay`/`spans`; the same row
  with `lay: 'paved_way'` is a lane, and the town's TRAVELED WAYS are
  courses resolved from sites), THE WARD (`data/boroughs.ts
  TOWN_RESIDENTS`: families gated by the gatework on the ACCOUNT's
  `souls_sheltered` — stamped at the refugee writer — standing at cottage
  doors with a line through `World.residentPrompt`). THE STREAM LESSON:
  every sim world loads the town at createPlayer and the town's spawns
  draw from the GLOBAL stream, so a town layout change re-deals every
  seeded rig downstream — a rig pins its deal with its own seeded span
  AFTER the world stands (probe_pathpref's caldera, probe_persistence G).
  THE SETTLED BELT (`engine/settled.ts` + `data/settled.ts` — farmland +
  metropolis): the worked country as two recipes over the massif fabric —
  'fields' (hedgerow bodies + REAL portal roads that punch field-gates
  through the hedges; road kind/width/count all layoutParams; THE PARCEL
  PASS `layCropParcels` — rectangular tilled plots, crops in true ROWS off
  one shared plow bearing, `tilled_earth` furrow wash, fallow/fence dials,
  weighted `parcelCrops` incl. the open-sightline flax vs blind wheat —
  and the `stock_fold` landmark on the `fence_ring` builder: working pens
  THE DROVE event borrows (packages drove.ts — drive the spilled fold back
  ALIVE, paid in the Pastoral Register; docs/engine/drove.md)) and
  'district' (city faces under ONE generator: tenement/manor MASSING with
  lit paved boulevards + courtyard kits, or PLANNED BLOCKS raising plan
  structures from a weighted pool); crops are walk-through veil cover
  (sight-eating wheat — the crop law), livestock/folk are the prey +
  sentry fabrics composed (wolves raid the fold through hunger drives;
  the village watch is a dormant `freehold_watch` sentry), the metropolis
  is an ENCLAVE (every boundary crossing wears the `city_gate`), and
  ASCENSION inverts the drop-cave: `city_stair`/`garret_stair` sidezones
  mint procedural townhouse floors UP (chain capped by `noDeeper`, the
  strip law) — incl. via `stairwell_hollow` pockets INSIDE building mass.
  Dials in `SETTLED_CFG`, docs in `docs/engine/settled.md`, probe
  `balance/probe_settled.ts`.
  THE CATHEDRAL OF THE HIGHEST (the Aetherial's crown — the divinity seat):
  the `cathedral` STRUCTURE GENERATOR (engine/structureGen.ts) rolls whole
  cruciform basilicas — nave/transepts/choir/apse + chapels/cloister, its
  chapter house a NESTED 'compound' generation (a structure generator inside
  a structure generator) — raised by the `cathedral` zone recipe on a cloud
  foundation with a contact-melt frail fringe, span-held prayer isles, a
  `glass_floor` WALKABLE-WINDOW promenade (the cloudsea under your feet) and
  a statue-flanked processional; `aether_cathedral` stages `{from:.86}` atop
  the bastion country and its GREAT WEST DOORS stamp the
  'cathedral_door_opened' gateway ledger (the Aureole vault rows read it).
  THE CITY CLIMBS: `gallery_hollow` → `basilica_stair` → three minted
  gallery floors (aether_seraphal hollows; the townhouse lane in marble).
  Docs `docs/engine/cathedral.md`; probe `balance/probe_cathedral.ts`.
  THE FORECHART (`world/forechart.ts` + the World sweep — the world charted
  AHEAD of the walker): a budgeted background sweep keeps a VEILED HALO of
  fully-minted zones around the player (the real chartFrontier path,
  nothing forked; mints stamped `ZoneDef.veiled`) — full graph citizens
  events seat on, factions contest, fronts march over, invisible at ONE
  fog seam (`World.visible`) until found (entry, the ring-1 unveil,
  surveys, omen reveals); far SOUNDINGS grow veiled clusters at requested
  coordinates (`WorldOverlay.requestSoundings` / `World.forechartSounding`)
  on a RESERVED sweep lane. THE PREGEN DOCTRINE + MINT HORIZON
  (`FORECHART_CFG.ring` 1000 / `horizon` 480 + `World.chartWithin`): the
  halo is a pre-explored COUNTRY and every arrival synchronously resolves
  its whole horizon (chartWithin drains on a charted-set — surveyAround's
  termination shape; its old guard-20 pass cap exhausted on rim teleports
  and stranded '?' stragglers, the J flake) — inside it the only new
  FINDABLE nodes are DIRECTED mints and atomic sea systems (the halo's own
  veiled children may land just inside; the veil is the law's truth); the
  player meets ground that is FOUND, never freshly minted (probe_webqa J).
  EVENT SEATS (`world/seats.ts` — `pickSeat` + per-def `SeatTuning`) are
  the one data-driven "where does this event land": range envelopes +
  known/unknown/veiled weights (hunt, haunting, longNight, longcandle,
  verminfall, brigands, crusade retrofitted; demon/migration/wraithsail/
  deepwinter bboxes widened; haunting's LATENT grief = the
  dormancy-until-found template). THE OMENS (`world/omens.ts`,
  `registerOmenSource`) are the findability guarantee: whisper/reveal
  radii that AGE WIDER (`widenPerMin`) — bearings murmured near, seats
  surveyed close, nothing lost forever; the crusade alone swears silence.
  THE HARBOR (`data/ports.ts`): ports as knowledge hubs — the HARBOR BOARD
  doodad (dwell → the revived Sail panel: passage incl. lane-known veiled
  harbors, hearsay rows, purchasable CHARTS = survey pulses via the
  `harborChart` intent). Dials in `FORECHART_CFG`/`OMEN_CFG`/`PORT_CFG`;
  docs in `docs/engine/forechart.md`; probe `balance/probe_forechart.ts`.
  THE SEA FABRIC (`world/seas.ts` + `data/seas.ts` — every water known
  WHOLE; THE FOREORDAINED TENET: pure function of the seed, computed whole
  at first touch, revealed only as found): any touched ocean water fills
  its whole contiguous component (4-neighbour macro-lattice — sailing-true:
  bridges split seas), classed by the `SEA_CLASSES` ascending ladder
  (pond→lagoon→sea→great sea→ocean: port budgets, haven rights, island
  muls, name pools), NAMED, and given explicit PORT SPOTS around its
  coastline (greedy max-min ≥ `portMinSep`; spot 0 = THE HAVEN).
  `World.ensureSeaPorts` mints each spot as a veiled HARBOR PAIR
  (`SEA_CFG.pair`): a mainland HOLD ANCHOR (`<spot>_hold` — ordinary
  country wearing the walled harborhold, the siege, and the state, with
  the causeway PORTAL repositioned INSIDE its walls at boot — the
  gatework law, `HARBORHOLD_CFG.quay.gateSeat`: the fort CONTAINS the
  door to the port; a besieged sea-arrival skirts to the apron outside)
  + the PORT zone proper offshore (kind 'port' = SEALED SHORES by
  registry + eventQuiet — NEAR-SANCTUARY: objective 'none', no faction
  war, `packDensity` sparse ambience; `ZoneDef.seaId`/`portTier`, haven
  name; the harborcove recipe carves deep water + the quay outcrop
  aligned home + the planked pier whose BERTH is the cast-off
  dock-location), joined by ONE notarized causeway whose anchor-side
  exit wears `lock: 'harborhold'` — the muster win opens the road (and
  unveils the port); the sail-in pier never bricks. THE DEGREE CAP:
  every road-former now honors worldgen's MAX_DEGREE (the frontier
  snap + nearestLinkable stop at `pair.anchorMaxRoads`; the restore
  reconcile TRIMS a saved anchor's excess spokes) — no hub sprawl on
  either half of the pair.
  THE DRY-ROAD LAW (`SEA_CFG.dryRoad`): no auto-forged land road crosses
  ocean — ONE chord test (`World.landRoute`) behind the mint weave,
  nearestLinkable, linkBackTo, and the ocean-frontier resolution (which
  bends coast roads to a SAME-SHORE anchor in snap range, else
  consolidates — crossing a sea is a VOYAGE, never a lucky link);
  `World.reconcileSeaPorts` heals old saves' wet accretion on restore.
  + rings the LANE LAW (coastal ring + haven spokes; isles lane to the
  haven on sighting). THE LANDING LAW kills free docking: quay beacons
  stream + reveal on sight (the isles' mint-on-sight law); landings
  engage only at spots/isles/grandfathered ports — the rest is breakers;
  `chartCourse` = this sea's far harbor. First port found names the sea
  + stamps `first_port_found`/`seas_found`. Dials in `SEA_CFG`; docs
  `docs/engine/seas.md`; probe `balance/probe_seas.ts`.
  THE RELIEF FABRIC (`world/relief.ts` + the 'elevation' climate axis — the
  land's vertical truth; THE FOREORDAINED TENET applied to terrain: pure
  f(seed), every feature computed WHOLE at first touch, no horizon — the
  fringe is just the untouched remainder): elevation = a lazy seam-free
  axis (noise + the new 'ridge' layer kind for range spines + negative
  coastal falloff so land dips to every shore), claimed by biomes as
  ordinary affinities (Mountains/Highlands stand on real heights, marsh
  pools low, farmland stays off peaks); RIVERS = ONE strewn course row
  (`SURFACE_RIVERS`) wearing the three new course levers — `tracer:
  'downhill'` (registerCourseTracer: springs walk steepest-descent with
  momentum to a mouth/basin), `paints: false` (the river crosses countries
  and repaints none — tundra keeps its frozen river via its own freezeAt),
  `forceLayout: 'riverland'` (on-river zones carve the riverland recipe in
  LOCAL dress, flow-oriented, onward exits guaranteed, centerline hug) —
  registered onto the surface dimension via `registerDimensionCourse` (the
  registerDimensionClimate pattern); `setReliefSeed` at sim boot is the ONE
  installed truth (course-instance seeds can't recover the field seed);
  the map draws rivers from the same polylines the mints ride
  (`riverPathsInRect`, COURSE_FIELD_SALT the shared derivation). Dials in
  `RELIEF_CFG`; docs in `docs/engine/relief.md`; probe
  `balance/probe_relief.ts`.
  THE ATLAS FABRIC (`world/atlas.ts` + `data/atlasFeatures.ts` +
  `ui/atlasPaint.ts` — the world map as SHOWN ground and MAP FEATURES as
  data zones INHERIT): THE CHART paints the foreordained fields as a relief
  map (`atlasShade` = THE PIXEL LAW: hillshade lit from the north-west,
  hypsometric lift, snowline/alpine rock, a chamfered sea shelf, contour
  bands, paper grain; rivers as tapered threads, lake basins, biome
  DRESSING glyphs from `ATLAS_GLYPHS`, feature marks + labels) as ONE
  progressively built pointer-transparent `<image>` under the node graph
  (the interactivity contract untouched), gated by THE VEIL (paints only
  around VISIBLE nodes — the wash's envelope law as a soft edge) and THE
  SEAM WARP (presentation-only wobble on the biome sample so Voronoi seams
  read organic); `Settings.mapChart` 'painted' | 'classic', atlas layer
  chips (Relief/Rivers/Features/Dressing), THE CURSOR READ (`#map-here` —
  biome · elevation · the climate bands' own words · features in reach).
  THE FEATURES: `registerMapFeature` kind rows — how instances are FOUND
  (`peaks` local maxima of the elevation axis / `strewn` lattice deals
  with climate gates / `lakes` at a traced river's inland end), how far
  they REACH, what a zone within reach INHERITS (`FeatureInherit`:
  landmark + composition rolls, layoutParams, a harvest bounty, a relief
  lift) and what the pane READS; debut peak/lode/lake. THE LAWS: DRAWN ==
  INHERITED (one finder), THE SEED IS THE PLAN (no rng), THE INSTALLED
  TRUTH (`setAtlasSeed` at sim boot beside `setReliefSeed`), THE FRONTIER
  LAW (only random-frontier surface mints inherit — worldgen's placeZoneAt
  folds `featuresAt` into `ZoneDef.geo.features` + `geo.relief` and appends
  the rolls AFTER the zone's own, so every feature-less mint is
  byte-identical), and readers read the DEF (levelgen's 'elevation' gen
  field lifts/domes by `geo.relief`, `World.bootHarvest` rolls the bounty
  after the zone's own draws, the pane names the features). THE KNOWLEDGE
  LAW (her ruling 2026-09-08 — the visible map is the player's knowledge
  alone): every graph mint is born VEILED (`ZoneSpec.veiled`, stamped at
  placeZoneAt) and lifts only by a knowledge act — entry, the STRUCTURAL
  one-ring preview in `World.visible` (a mint beside walked ground is seen
  the moment it exists), a survey, an omen, explicit quest cartography, a won siege,
  a sighted port — so no distant event redraws the map; the chart, THE VEIL
  CLIP on every overlay wash read KNOWN ground alone. The fit reads only
  visited/surveyed ground; direction markers never enlarge it.
  THE DEV LENS (`ui/mapLens.ts`, the `?dev` Atlas tab: omniscient chart +
  cursor read) is the render-only development view — never world state.
  THE STANDING CHART: the panel's html carries no transient state (viewBox,
  zoom %, hover, side box, rasters, labels are synced IN PLACE by
  `syncMapLive`/`syncAtlas`), the painter keeps an LRU of finished rasters
  (the BASE always stands; a zoom WINDOW overlays it), and the side box
  reads a zone's ground row (elevation · climate words) off its baked
  `geo.climate`. Dials in
  `ATLAS_CFG`; docs `docs/engine/atlas.md` + charter
  `docs/design/world-atlas.md`; probe `balance/probe_atlas.ts`.
  Landform destinations (`data/landformFeatures.ts`, `data/landformLocales.ts`)
  extend the atlas with ponds/lakes/tarns, river reaches, valleys/hills/canyons
  and calderas. Registered feature activity cycles (`world/featureActivity.ts`,
  `data/featureActivities.ts`) put recurring eruptions, ash and temporary lava
  trails on the saved world clock. The map's 100% scope is fixed by
  `MAP_CFG.viewport.startSide`; growth unlocks zoom-out. Contracts and dials:
  `docs/worldgen/landforms.md`; probe `balance/probe_landforms.ts`.
  MIXED EXPLORATION (`data/explorationLocales.ts`, `world/zoneVariety.ts`):
  biome-weighted district programs alongside ordinary layouts, independent
  district choices and optional shortcuts, larger rolled sizes, and terrain
  fragments extracted from authored maps with rotated sockets and source
  attribution. Resolved cells/choices/sizes persist in locale plans. Docs:
  `docs/worldgen/locale-composition.md`; probe `balance/probe_locales.ts`.
  LANDMARK REGIONS (`world/landmarkComplexes.ts`, `data/landmarkComplexes.ts`):
  atlas landmarks expand into saved, connected stage graphs with mixed locale
  programs, interior gate landings, theme/sky changes, and sealed inner roads.
  Fortresses, lost cities, and highland caverns are registered content. Cavern
  locales select an under-tier lane with surface-preserving tunnels and chambers.
  Docs: `docs/worldgen/landmark-regions.md`; probe `balance/probe_complexes.ts`.
  UI PERFORMANCE (`ui/atlasBudget.ts`, `ui/atlasInputCache.ts`): bounded,
  cooperative atlas painting, asynchronous images, cached geographic inputs,
  and hidden-layer work elision. `npm run perf:ui` profiles map gestures and
  common panels at desktop/phone sizes; `-- --cpu=4` exercises slower CPUs.
  Docs: `docs/engine/ui-performance.md`; probe `balance/probe_atlasbudget.ts`.
  THE HARBORHOLD FABRIC (`data/harborholds.ts` + `world/harborholds.ts` —
  mainland ports as BESIEGED RESIDENCES): every sea spot's HOLD ANCHOR
  wears the walled town (`harborhold_*` compositions → plan structures
  with a SEALED gate) with a persisted lifecycle on `ZoneDef.harborhold` —
  found `besieged` (camp at the walls, muster horn on the apron, the quay
  causeway LOCKED), OPENED by THE MUSTER (discrete waves through the
  extraction swarm director's fixation grammar at the QUAY WARD; ward dead
  = the hold falls, waves broken = the town opens AND the causeway to the
  paired PORT zone unbars — `lock: 'harborhold'` reads live state), FELLED
  into fires + a rebuild clock (or a Mortal Essence restoration),
  re-besieged by the sweep on `siegeEverySec` with an omened `fallAt`
  deadline. PROSPERITY (+1 per defense) gates `HoldServiceRow`s —
  harbormaster/board at 0, chandler at 1, the merc captain at 2
  (TEMPLATE-ONLY hires; veterans + RETIREMENT stay wilds-outpost exclusive,
  and wild outposts stand down on BOTH halves of a pair). Services seat at
  THE QUAY VILLAGE in the PORT zone (`HARBORHOLD_CFG.quay`, plan
  `quay_village` — the port reads the anchor's ladder via
  `ZoneDef.holdAnchor`); the knowledge network is the hold's reward; dock
  + cast-off never brick. Islands/legacy ports stay bare quays by
  construction. `HOLD_CLASSES` ladder + `HARBORHOLD_CFG.assign` decide
  everything; docs `docs/engine/harborholds.md`; probe
  `balance/probe_harborholds.ts`; dev tab 'Holds'.
  THE PLY FABRIC (`engine/plies.ts` — hit-counted durability, the
  Pikmin/Overlord damage model): `MonsterDef.plies` bodies EAT N landed
  hits magnitude-blind (one ply per blow, no life moves; thud floor,
  `spentStatus` bracket) over a DUAL live life pool — DoTs pierce to it
  and kill() never consults plies, so self-destruction and burn-the-swarm
  counterplay stay sovereign; `minionPlies` owner stat under the QUANTA
  LAW (never fractioned, never batch-scaled), pip-row read in place of a
  life bar, `pl`/`plm` wire; a 1-ply kind is the horde-tier substrate —
  dials in `PLY_CFG`, docs in `docs/engine/plies.md`, probe
  `balance/probe_plies.ts`.
  THE LITE TIER (`engine/lite.ts` — hundreds of bodies for the price of
  none): a DOTS-style packed pool (struct-of-arrays rows — no Actor, no
  StatSheet, no brain) for crowd bodies, batch-updated and batch-blitted
  (renderer drawLite: one composited sprite per body); `MonsterDef.lite`
  opts a kind in (the pooled contact band + steering texture; radius/
  speed/plies/cling/look all read off the def), `ThrongSpec.tier: 'lite'`
  seats a gathered roster in the pool, and `ZoneTheme.lite` pours ambient
  tides on a salted stream (the sewerworks' wade-through VERMIN TIDE is
  the debut; THE CONDITIONED POUR `LiteSwarmRow.when` — a structural
  RadianceCond twin — stands a pour only while its hour holds: pockets
  SEAT at boot regardless, breed while held, gently RECEDE while not,
  and a fully-reclaimed pocket un-marks `poured` so only violence, never
  weather, meets the extermination law; debut = the GROVE COUNTRY's
  dusk-to-dawn firefly tides — docs in `docs/engine/grove.md`, probe
  `balance/probe_grove.ts`). Damage IN rides TWO hooks — the `strikeSurfaces` seam
  (every area verb's exact drawn geometry carves the pool) and the
  projectile step (pierce-budget honest); a lite body IS its ply count
  (one carve, one tear, magnitude-blind). Damage OUT is THE POOLED BITE:
  one mitigated, ply-gated, count-capped hit per victim per staggered
  beat, keeper-credited. PROMOTION mints a real Actor at the interaction
  boundaries (the cling latch, the grab, the minionCast delegate);
  lite-tier throng bodies DEMOTE back when quiet — kind/owner/plies-spent
  survive the round trip losslessly. Co-op ships the `lt` draw list
  (host-authoritative, self-healing); `npm run perf -- --lite=N` is the
  horde-stress forensics lever. Dials in `LITE_CFG`, docs in
  `docs/engine/lite.md`, probe `balance/probe_lite.ts`.
  THE POSSESSION SEAM (`engine/possess.ts` — one seat-to-body indirection;
  possession and shapeshifting are its CONSUMERS): `Seat.actor` is
  re-pointable (`World.seatEmbody`/`seatEject`; `Seat.home` = the hero
  body, `World.seatHero` = the build/save/XP truth) — camera, HUD, the
  bar (a borrowed kit is ordinary `SkillInstance[]`), the AI seat-skip
  and the zone carry all follow the POINTER free, while recalc/XP/saves
  stay HOME. The 'possess' effect enters a WEAKENED enemy (lifeFrac ×
  `POSSESS_CFG.policy` rarity ladder, `MonsterDef.possessable`
  allow/deny, structural refusals; the husk stands `entranced` — the
  risk valve: pain/seizure snap you home, its death is YOUR death, seat
  home first, permadeath byte-honest); the 'shapeshift' effect mints the
  form at hero level (husk CARRIED, form death = staggered eject). THE
  GUISE: the ridden body's faction reads you as kin one-directionally in
  `hostileTo` until the first authored harm. The pressing gem rides the
  borrowed bar as the GUEST SLOT with a `'seatAway'` convert face
  (Relinquish / Return to Flesh); every ending funnels through
  `seatEject` (the kill() hook is the death law: a dying borrowed body
  ejects its rider then dies a monster; a dying husk pulls the seat home
  then wipes honestly). Stats `possessDuration`/`possessPower`/
  `huskGuard` read off the gem; THE VACANT kin (the open-door
  `vacant_shell` tutor + the refusing `seatless_usher`) + the
  `vacant_yard` set-piece teach it at a glance. Dials in `POSSESS_CFG`,
  docs in `docs/engine/possession.md`, probe
  `balance/probe_possession.ts`.
  THE COUCH FABRIC (`data/couch.ts` + `net/couch.ts` — local shared-screen
  co-op, Diablo-couch style): a second player on this machine is an ordinary
  SEAT driven by a second physical pad (`PadSeatInput` mirrors the hero's
  pad half exactly; `PadState` binds per pad slot, the hero's merged read
  excludes claimed pads) — XP share, loot, downed/revive, enemy scaling and
  zone travel are the standing co-op fabrics verbatim. THE COUCH FRAME
  (`couchFit` in render/camera.ts): the shared view widens to hold every
  local hero up to a hard stretch cap, then THE EDGE LAW
  (`world.couchConfine`, published from the frame actually drawn — drawn ==
  confined) holds the runners at the screen's edge. UI: the canvas HUD
  cluster mirrors onto each seat's flank; DOM panels remember their OPENER
  (THE COUCH LENS) and dock to its side; mutations route by THE ACTION
  LATCH (`world.uiActionSeatId` → the seat-scoped `applyAction`); the
  personal-economy stations attribute dwells per local seat. THE LANE LAW:
  a mortal run seats a fresh disposable hero; an IMMORTAL run seats another
  roster vessel (gated on a second immortal slot) which persists to its own
  slot and PAYS ITS OWN COVENANT on a wipe (own-ring corpse + carry strip +
  stage advance — or, undying, THE FALL: the card stamped with its frozen
  resurrection fee, the Vault's first-tab Fallen shelf the road back
  (docs/meta/reckoning.md, probe balance/probe_resurrection.ts) — never a
  cheaper death). THE SOLO INVARIANT: with no couch
  seats every branch short-circuits — solo is byte-identical, and the pause
  menu grows the join row only with ≥2 controllers connected. Dials in
  `COUCH_CFG`; docs `docs/engine/couch.md`; probe `balance/probe_couch.ts`.
  THE SCENE FABRIC (`engine/scenes.ts` + `data/scenes.ts` — one-time
  cinematic sequences as data): account-gated stage lists (open registry
  `registerSceneStage`: card/drill/clash/assault/reckoning/home) played on
  OFF-GRAPH staging ground (mintCave into caveMap — never serialized, torn
  down whole at 'home'; THE EMPTY-FIELD LAW sweeps every non-party actor at
  the door), rewardless by construction (every scene spawn `noBounty` on
  spoils-'none' ground), under THE COVENANT (onPlayerDown asks
  `sceneInterceptFall` first — on scripted ground a lethal blow FELLS,
  never kills). The director hooks World.update on the RAW clock before the
  timeflow gate (scenes own their holds; 'menu' still wins), owns
  screenFade, and feeds the renderer's scene HUD channels (bar/prompt with
  a SEAT per stage — 'hero' floats above the player's head, 'top' is the
  assault's dawn clock — + `scene.focus` = THE CINEMATIC EYE, the one
  camera override). A SCENE IS NOT A RUN: the ledger key stamps at
  COMPLETION ('home'), a begun-mark keeps an aborted scene due (quit
  mid-tutorial → the next New Game re-launches it), and while one plays
  the shell writes NO run save (baseline/autosave/menu-exit/quitFlush all
  stand down; World.endRun refuses the forfeit) — the run's first save
  lands at the bedside wake. `SceneZoneSpec.boundless` streams the stage
  with no reachable edge (the Last Mile wears it). `?prologue` re-runs
  deliberately. Debut: THE PROLOGUE ("The Last Mile")
  — drill → legion waves (wave-frenzy grammar) → THE AGENCY RECKONING
  (2026-08-30, her overhaul: the cinematic hold + camera pan are DEAD — the
  commander arrives just off-screen wearing the attention fabric's chevron
  (`SceneRuntime.mark`), kit AI-banned, and after `graceSec` musters a
  TEN-second honest cast the player freely spends trying to stop; THE
  ENRAGE (`floorFrac` + `enrageLeftSec` — show, never tell) answers a
  commander bled below 10%: honestly MORTAL throughout, he furies (rally
  worn) and the bar SURGES to its last breaths, a truly-finished Father
  just fades the stage forward (the dead-commander lane — never a lock),
  and interrupts RE-ARM the muster) → the blast fells through the
  covenant → THE HOLLOW WAKE card → MU. THE PLAYER DEATH PRESENTATION
  (`DEATH_PRESENTATION`, data/deathPresentation.ts): a run-ending death books
  instantly, then the body rises, cracks, and shatters as its epilogue fades
  in. Ambient rendering continues while combat/rewards stay settled; the
  corpse never moves. Forfeit + network co-op stay immediate. Dials and
  contract: `docs/render/player-death.md`; probe `balance/probe_playerdeath.ts`.
  The bottom keybind strip is retired
  behind `HINT_BAR_ENABLED` (ui/panels.ts). Docs `docs/engine/scenes.md`;
  probe `balance/probe_scenes.ts`.
  THE MU HUB (data/mu.ts + the 'mu' core stage — docs/engine/mu.md; probe
  `balance/probe_mu.ts`): the hub BETWEEN LIVES, played instead of menu'd —
  the hero stands as a WISP in a boundless zone of nothing ('mu' tileset,
  `hudVeil` hides the run HUD; THE GLOBE — `MU_CFG.wrap` pops a far walker
  out the antipode inbound, the seam invisible over pure void, so every
  drift leads back to the vessels) where the class roster stands IN-WORLD
  as shaded apparitions (generated `apparition_<classId>` defs wearing each
  class's own look; THE HAND LAW keeps the class-screen economy verbatim:
  dealt hand AWAKE, unlocked rest VEILED (`mu_veiled`, name ink dimmed to
  present-but-not), locked remainder = capped nameless cowls (`mu_faint`);
  vessel nameplates HOVER on a per-id bob and the standing drift
  instruction speaks only to YOUNG accounts — `MU_CFG.promptRuns`); a still linger opens that class's
  card (naming front and center, one Wake) whose pick calls the same
  startGame as ever — Lastlight bedside by construction. New Run/Begin
  reroutes there (`UI.onBeginRun`; virgin accounts auto-Warrior into the
  tutorial), a solo run's end drifts back there, the tutorial's death wakes
  there with completion stamped AT THE THRESHOLD, and `SceneDef.transient`
  keeps the standalone hub outside every scene stamp/gate structurally.
  THE OFFERED CONTRACT (2026-09-13, her ruling — Mu × the Immortal
  covenant; `engine/muDeal.ts` = THE DEAL as one pure function of the
  account, probe `balance/probe_muoffer.ts`): a life-contract wearing
  `CharacterModeDef.muOffer` (a `ModeOfferSpec` — chance / max / marker
  `status` / `release` / `only`) is ROLLED onto the dealt hand once its
  unlock is owned and a vessel slot stands free (`muOfferableModes`,
  derived per deal, never stored) — AFTER the deal on the same stream (the
  hand is byte-identical either way; a sitting holds its offer); the
  offered vessel wears the marker (`mu_sworn` = a red ember + the new
  generic `bodyFx.rim` outline — shown, never told); the card opens
  PRE-SWORN off `muOfferOf` with the contract named in its header and its
  row through THE ONE PREDICATE `modesSwearableFrom` (an `only` contract
  lists solely on the vessel carrying its offer — the Immortal is met,
  never picked; `release` lets it step back to Mortal, never the reverse);
  Wake enters the ordinary loop. THE NEAREST LAW + THE RING LAW
  (2026-09-13, her finding — a fixed crescent packed twelve vessels under
  one dwell reach and the seat-order-last one took the request; probe
  `balance/probe_mudwell.ts`): ONE vessel engages at a time — the nearest
  surface within reach, seat order on a tie, every other row re-armed
  (`muEngagedVessel` the read) — and seats are DERIVED by
  `engine/muRing.ts` from `MU_CFG.ring.seatGap` (the authored crescent
  when it fits — legacy angles exact — else widened about its centre, else
  a closed ring grown to the gap; ranks stack by `rankGap`; the globe's
  wrap keeps `wrap.clear` past the outermost seat); THE DISJOINT REACH
  (awake gap ≥ 2× the dwell reach, validate-warned) means no point in Mu
  reaches two vessels. THE CAST SEAL (2026-09-16, her word — the wisp's
  empty slots swung the unarmed floor in Mu: fine mechanics, wrong
  implication): `ZoneDef.castSeal` (engine/castseal.ts — `mode` shut|open,
  `open`/`shut` rows by ids / tags / REGISTERED LAWS (`registerCastLaw`,
  live predicates; 'reflex' ships), `binds` all|seats, an optional spoken
  `line`, THE HARD LOCK; `SceneZoneSpec.castSeal` stamped by sealStageZone)
  is the ground's cast law and `World.castSealed` the ONE read — useSkill's
  first word (before any cost, toggle or dwell interruption) + the bar +
  the AI + the trigger artery + the replenishment sweep; MU_ZONE wears it
  whole and silent, and "certain casts eligible" is a row, never code —
  docs/engine/castseal.md; probe_mu B7–B19.
  THE TUTORIAL FACTIONS (data/commanders.ts): the onslaught rolls ONE
  LEGION per account — SEVEN `TUTORIAL_FACTIONS` rows (goblin/undead/
  beastkin/demon + the obscure courts carven/chitin/gnoll), each fielding
  its tide + a commander-grade colossus on Ghorvane's exact grammar (the
  Fathers: Morvhaal/Uzkharn/Mazghor/Wickerwane/Szikkith/Rrakhan, VOICE part
  breakDisables the reckoning, HEART part unmans) — rolled pure-f(manifest),
  stamped `tutorial_faction:<id>`, recalled forever, applied through
  `SceneDef.resolve` (sceneBegin walks the EFFECTIVE def; stamps read the
  base; unimported = goblin canon). THE REVENGE CHAIN (quests/revenge.ts,
  offered L15): cull the stamped legion → hunt its Father (boss objective,
  band-placed, NO mercy floor — the voice part is the taught counterplay);
  exactly one chain live per account, goblin for grandfathered veterans.
  THE REFLEX FABRIC (flasks are never locked out): `SkillDef.reflex` /
  the `reflex` stat + `REFLEX_CFG` open instant presses THROUGH the
  user's own casts/dashes/recovery without disturbing them; the THIRST
  gate (`GateSpec.missing`, waived by `thirstless`) refuses moot drinks
  before any cost — docs in `docs/engine/reflex.md`.
  THE INPUT LAWS (`docs/engine/input.md`): `World.applyInputs` is the ONE
  artery every player-kind body acts through; interactions that take the
  hands (the harvest rite, the steady hand's trace) are GATES that swallow
  a seat's frame, and THE SPENT PRESS (`net/intent.ts SPENT_PRESS_CFG`,
  `World.spendPresses`/`unspentHeld`) makes what a gate took stay taken —
  a swallowed slot's hold never reaches the cast lane until its button is
  seen UP or goes down afresh (the closing symbol no longer drinks the
  flask bound to it; every future gate spends through the same seam;
  `spend` 'hold' | 'edge' | 'off'); THE TYPING GUARD (`core/input.ts
  TYPING_GUARD_CFG` + `isTypingTarget`) keeps a key typed into a text
  field out of the hero's hands at the one key source (Esc passes, keyups
  always release). Probes `probe_harvest` K, `probe_trace` D,
  `probe_typingguard`.
  THE SYMPATHY FABRIC (gains echo to kin): flask pours, orbs, charges,
  buffs and heals REPLAY on related actors as data (`engine/sympathy.ts`
  link registry + `data/sympathies.ts`, the `sympathy_<id>` stat family,
  `MonsterDef.sympathy`, `SupportDef.tameMod` claim grafts, the
  'companion' tag) — the tamed bond drinks when the keeper drinks, the
  den matron's swig waters her pack, one depth-disciplined echo per
  gain-event sweep; probe `balance/probe_sympathy.ts`, docs in
  `docs/engine/sympathy.md`.
  THE SENTRY FABRIC (inactive NPCs stay where authored): dormant
  un-roused neutrals (ai.ts `isDormant`) are PLANTED — wind drift,
  knockback/pull and environmental strikes (`Zone.spareDormant`) pass
  them by — and DUTY POSTS (`PostSpec`/`POST_CFG` in brain.ts;
  `MonsterDef.post`, `GuardianSpec.post`, or spawner stamps via
  `Actor.aiPost`) walk a displaced body back to its station, dormant or
  awake. SKY EXPOSURE (`skyOf` in data/zones.ts: `ZoneDef.sky` baked
  from `TilesetDef.sky`/`ZoneSpec.sky`, caves + off-surface dimensions
  sheltered by derivation) gates ALL in-zone weather through
  `World.skyFront()` — no storms inside cellars, caves, or interiors.
  THE TRANSIENCE DOCTRINE (events borrow the world, never own it — docs
  in `docs/engine/transience.md`): world events read as THEIR OWN WEATHER
  (`engine/eventWeather.ts` `registerEventFront` sources folded at
  `World.skyFront()` — `WeatherDef.eventOnly` rows: the Demon Storm per
  `InvasionStage.weather`, the Incursion's pall at max × influence, each
  wearing a `WEATHER_FX.veil` gradient), lay TEMPORARY ground dress
  (`engine/weatherDress.ts` + `WeatherDef.dress` — planted while the front
  holds, dissolved via `Doodad.evap` as it passes, deterministic per
  zone+kind), and tint the map wash only through KEYED, reconciled,
  DECAYING BiomeField warps (`setWarp`/`release` + the engine warp sweep;
  `BIOME_FIELD_CFG.warpFadePerSec`) — while THE MINT PATH samples the BASE
  field (`sampleBiome`), so no temporary event ever bakes its biome into
  newly-charted ground; permanent scars are registered, player-authored
  acts only. Probe `balance/probe_transience.ts`.
  THE INTERIOR FABRIC (rooms as data — docs in `docs/engine/interiors.md`):
  `StructureDef.confineVision` veils the world beyond the room while the
  local hero is under its roof (`render/vis/roomVeil.ts` VISION VOLUMES,
  `VIS_CFG.roomVeil` — render-only; LoS keeps its own occlusion; `true` =
  whole footprint, `'rooms'` = per-room via the derived `PlacedRoom`
  ledger — enclosed rooms confine, open lean-tos stay sky, window cells
  spill sight); roofs
  shelter per POSITION (windAt already; sky strikes via `Zone.spareRoofed`
  ← `WeatherStrike.throughRoofs` lever); LESSON DOORS
  (`CellSpec.door.lesson` = account-ledger key: first dwell-open stamps,
  graduated accounts mint it open); SPAWN CELLS (`CellSpec.spawn`, legend
  `S` → `GeneratedLayout.spawnAt`: no-back-portal arrivals wake there).
  The Waking House in Lastlight composes all four (bedside run start).
  `levelgen.ts`, `worldgen.ts`.
  THE WORLD-WEB LAWS (the map's link graph kept legible — docs in
  `docs/engine/worldweb.md`, probe `balance/probe_webqa.ts`): THE ROAD
  BUDGET (`BiomeInfo.maxRoads` → `roadBudgetOf`, ONE read for the weave /
  proximity linker / expanse inbound snap / the frontier-RESOLUTION gate in
  `chartNeighborsOf` — '?' promises finally answer the degree cap; field=8
  the bounded HUB, jungle=6 THE PRESS), THE HUB LAW + LANDINGS
  (`FIELD_GEN.hubSpread` boundary doors + `ZoneDef.berths` so expanse roads
  land on the region edge, `ZoneSpec.noWeave`), THE SHARD LAW
  (`FIELD_GEN.maxSpanCells` macro-window flood — mega-blobs mint as CHAINED
  expanses, entry-independent per shard; old mega-regions grandfathered by
  core-rect containment), THE FOOTPRINT LAW (`footprintBars` +
  `fieldCoreRect`: spacing measured to the expanse RECT, no both-ends-outside
  road across it, mint-time sever + restore heal `reconcileWebLaws`),
  THE BYPASS/CLEARWAY dials (`WEB_CFG`: no road through a third node's disc,
  no mint standing on a road's line), THE OCCUPANCY LAW
  (`WEB_CFG.mintOccupancy` — a random frontier into ground already holding a
  node CONSOLIDATES, never a twin: the halo-accumulation killer; expanse
  mints/directed mints/gate fans exempt), THE SETTLING (`settleWeb` — bounded
  deterministic force-directed relaxation to `WEB_CFG.hoverClear`; runs at
  every placeZoneAt mint, after expanse re-centres, on the slow
  `updateWebSettle` sweep, and in the restore heal; immovables pin the
  layout: sanctuaries/ports/sealed kinds, expanses drift only inside their
  own rect), THE SCAN LATTICE
  (worldgen's derived index behind the per-candidate chart scans —
  chordClearsNodes / footprintBars / insideFieldFootprint ride a field
  roster + coord cell bins keyed (zoneMap identity, count,
  webDisturbance()); byte-identical answers probe-pinned, the charting
  unit's old 50-95ms quadratic closed — probe `balance/probe_webperf.ts`
  D), and QUEST DEEDS
  (acceptQuest anchors nearby sane ground, including veiled sounding clusters,
  and notarizes the road both ways; directions never unveil it. QUEST GEOGRAPHY
  separates earned bearings from terrain knowledge and locks the map's fit to
  exploration. Docs `docs/design/quest-geography.md`; probe `balance/probe_questmap.ts`).
  THE COHERENCE FABRIC (generation composition stays intentional — docs in
  `docs/engine/coherence.md`): traveled ways hold right-of-way as data
  (`DoodadRule.clearway` + the one way-layer `layTraveledWay`/`wayRoller` —
  scatter routes around live stretches, roads deck/ford liquids and yield
  to molten ground, `layoutParams.overgrowth` lets deep country swallow
  runs of its own paths), ground affinity as data (`DoodadRule.habitat` —
  live kelp/coral keep to water; `ZoneDef.aquatic` arenas satisfy
  ambiently), both waivable per stamp row (`rules.ignore` 'clearway' /
  'habitat', pieces tagged) and both pinned by genqa invariants +
  `balance/probe_coherence.ts`.
  ZONE OBJECTIVES are a data vocabulary (ObjectiveSpec + per-kind
  `OBJECTIVE_SEALS` exit policy + `data/beacons.ts` survey spires and the
  monster-LURE fabric). THE CONTEST LAW (`data/objectives.ts CONTEST_CFG` →
  per-kind configs → `ObjectiveTuning.contest` override/waiver; ONE driver
  `World.driveHoldFixtures` + the stamped `holdRead` views) gates every
  hold-the-ground fixture family: progress BUILDS only on cleared ground
  (any counted enemy in the ring stalls it — the cull's own predicate),
  a crowd DRAINS banked work, and the HUD/chevron speak the tested frame.
  The SPIRE runs contested + BLEEDS reinforcements (`BEACON_CFG.reinforce`
  — zone table seasoned by mix-faction rosters, debut marrowdrawn, tagged
  + capped) and its flare reveals a seeded RANDOM ASSORTMENT of
  `revealCount` (10) new nodes instead of the whole disc (harbor charts
  keep the uncapped pulse). NEW KINDS, biome-attached via tileset weight
  rows: `leyline` (THE BESIEGED WAYPOINT — `data/leyline.ts`: a promoted
  nemesis-named native SIPHON posted at its own POI drinks the node dry
  behind a drawn waypoint→thief tether; `World.waypointBesieged` is the one
  predicate for the refused attune brush + HUD + starved drawn face; pure
  population state, worldgen forces the mint's waypoint or degrades the
  roll), `rifts` (`data/rifts.ts` — sealing tears that POUR the zone's own
  kin, `rift_born` capped), `pyres` (`data/pyres.ts` — kindled bowls that
  ARE registered lightwells: the objective pushes the Gloaming back), and
  `unearth` (`data/digsites.ts` — dug mounds spill through the spoils law
  + may spring ambushes). Progress rides Zone Memory charge arrays
  (`riftCharges`/`pyreCharges`/`digCharges`); fixtures re-place in their
  finished faces. Docs in `docs/engine/objectives.md`; probe
  `balance/probe_objectives.ts`.
  THE ATTUNEMENT FABRIC (crystals take the color of the blow):
  `MonsterDef.tune` bodies re-tune to a landed hit's dominant ROLLED type
  (conversions honored) and pulse `attuned_<tone>` onto friend and foe
  alike — engine/tuning.ts + the `attuned_*` status family; docs in
  `docs/engine/attunement.md`. THE PUZZLE FABRIC (activity riddles as
  data): lights-out lattices, singing refrains, attunement chords, rising
  tempos (rank-pulsed voices struck slowest-first — read, never
  memorized), twin accords (opposite tone-paired seats both rung inside a
  linger — the shipped spill:'all' consumer; `PuzzleKindDef.quantize`
  keeps paired rings whole at the placer) and ember rings (keep every
  struck coal alight through its gutter window at once) as open
  `PUZZLE_KINDS` + `PUZZLES` presets (engine/puzzles.ts +
  `data/puzzles.ts`), placed at zone LOAD on a salted stream, offered
  per-biome via `TilesetDef.puzzles`, askable as the `'puzzle'` objective;
  strike routing obeys THE KNOCK/SPILL/HUM LAWS (`knock`/`spill`/`hum`
  dials, spec → kind → `PUZZLE_CFG`): any LANDED damaging blow rings a
  node however mitigated (full septic forgo included; tone reads
  pre-forgo — DoT ticks never knock), one blow rings ONE facing-aligned
  bell (a wide cleave can't falter the refrain by clipping a neighbor),
  and THE HUM swallows echoes at BLOW grain — a fan-out's bells hum
  together until a later blow's fresh bell claims the ledger — knocks
  queue per frame (`drainPuzzleKnocks`), kinds stay pure;
  `ZoneDef.scenery` plants ambient object-actor rows the same way — docs
  in `docs/engine/puzzles.md`, probe `balance/probe_puzzles.ts`;
  items: `items.ts` (gear schema + every ITEM_CFG tunable), `itemgen.ts`
  (the one roller/compiler/describer), `inventory.ts` (tetris bag grid),
  `loot.ts` (nestable loot tables + DROP_CFG kill-path levers). THE SPOILS
  LAW (`ZoneDef.spoils: 'none'`): a zone that MINTS no loot — every drop
  primitive (gems/gear/vestiges/essences) seals through
  `World.spoilsSealed()` while XP + orbs flow; OWED pay (quest payouts,
  corpse reclaims — the `owed` flag) and OWNED movement (discards, looter
  sacks, memory restores) always pass; the Pit is the debut (a level-scaled
  XP arena, deliberately not a gear farm) — docs in `docs/engine/spoils.md`,
  probe `balance/probe_spoils.ts`.
  THE PATRON'S HOLD (`data/vendors.ts` VENDOR_CFG + `World.vendorHolds` —
  counter state, not weather): reserved shelf slots as a Vault ladder
  (capacity = owned rungs of `VENDOR_CFG.lock.ladder`; the catalog rows are
  DERIVED from that list) — a reserved ware rides every restock/reload as
  the same object until bought or released; THE STANDING ORDER commissions
  one KNOWN gem per counter (the DROP INDEX: `account.ledger['gemdrop:<id>']`
  bumped ONLY at genuine mint sites — dropGemAt + the Bonewright's fixed
  spoils; discards/reclaims/purchases never count — the bestiary's doctrine
  on the gem shelf) and resolves every away restock beat at the shelf's TRUE
  odds (`commissionOdds` reads the roller's own pools/weights; seeded
  worldSeed × counter × gem × beat, so reloads replay the identical find);
  `VENDOR_CFG.gemBracket` 'shopper' anchors gem rolls to the buyer like the
  gear shelf ('zone' = the old starter-bracket). Holds persist in
  `WorldStateSave.vendorHolds` (keep-what-stands sanitizer; empty is NOT
  load-bearing) — docs in `docs/engine/vendors.md`, probe
  `balance/probe_vendorlocker.ts`.
  THE MEMORY LAW (2026-09-12, her ruling — "skill and support drops happen
  as the memories rather than the explicit skill and support drops"): a gem
  that DROPS arrives as a MEMORY pouch; a gem arrives NAMED only where it is
  OFFERED (the counter's shelf, the bounty board's card, the class kit, the
  recall). `World.dropGemAt` is the one drop chokepoint every lane rides
  (kill trickle, per-def counts, boss guarantees, elite spills, loot-table
  'gem' payouts through `mintLootResult`, event/objective/breakable payouts,
  quest pay, the Bonewright's built spoils), so the law is ONE policy read:
  `GEM_DROP_CFG.memoryShare` (1 = whole; 0 = the pre-law bare gem) decided
  per mint OFF THE SEALED SEED (`memoryFormOf`/`memoryKindForSeed` in
  engine/memories.ts — zero extra draws, THE STREAM LAW at every lane).
  THE EVENT FACTS a unit may carry beside `{d, s}` (`RoughMemoryUnit`): `e`
  the dropper's rolled elite tier (`MEMORY_CFG.tierRarityLean` × the boss
  lean — `memoryRarityLean`), `t` the flooring tileset it fell on (THE
  GROUND — the recall reads `GEM_FLOORS` for where it was FOUND), `g` THE
  PROMISE (`MemoryPin` — a pinned exact grant recalled verbatim; pins ride
  rough pouches and group APART via `memoryGroupKey`, the recall intent's
  `dropper` = the group key). Provenance: a def id + tier through
  `World.provenanceOf(actor)`, else the registered words in
  `MEMORY_FOUND_SOURCES` ('found' default, 'chest', 'quest'). THE MINT LAW
  stamps at the recall. THE OFFERED GRADE: the board's named gem rolls
  `BOUNTY_BOARD_CFG.lanes.gem.rarityWeights` (never below Magic, the card
  prints the floor; `rollSkillRarityWeighted`/`skillRarityFloor`). THE
  COUNTER'S BUY-BACK: a pouch SELLS whole at the scrap counter
  (`sellMemoryYield` × `SELL_CFG.memoryUnit`), the bench still refuses,
  sweeps spare it, and a STACK asks first through THE SALE PROMPT
  (`Settings.confirmMemorySale`, Options → Gameplay; `MEMORY_CFG.sell.
  confirmFrom`). Docs: docs/design/skill-items.md §4 lane 3,
  docs/design/bounty-board.md §6 R4, docs/engine/vendors.md; probe
  `balance/probe_memories.ts` rigs R–W (+ probe_vendorlocker C,
  probe_scaldkit P3, probe_worldbossloot D3 re-aimed).
  THE COUNTER GLASS + THE MARKET CHAIN (2026-07-22; ONE-SHELF fold
  2026-08-23, skill-items M3): every counter renders ONE FACE — the whole
  shelf packed D2-style by `World.vendorGridPack` through the player bag's
  own board-parameterized cell law (gear by footprint; gem finds + the
  Memory pouches as 1×1 tiles; deterministic, display-only, capacity
  probe-derived from the catalog's worst case; tiles buy on click, a
  corner pip reserves, the Standing Order strip beneath). The tabs + the
  gem case's FACE seal are RETIRED: `FEATURE.VENDOR_GEMS` (THE MEMORY
  COUNTER) re-aims to the shelf's TRUE-GEM share at the STOCK builders
  (`buildVendorStock` + `mintDelverStock` read `vendorGemsOpen` — what
  stands is honestly buyable), while Rough/Preformed Memory pouches stock
  from the first day (`VENDOR_CFG.pouches`, TRADED-provenance units on the
  foreordained beat stream, per-unit `VENDOR_MEMORY_PRICE`, bought stacks
  merge onto the standing bag pouch); THE TRADE GATE
  (`VENDOR_CFG.trade`, `World.vendorTradeRefusal` — the swapRefusal shape,
  ONE predicate for engine refusals and panel disables) shuts ALL
  purchasing until the Salvage Station is owned (browsing free); the
  BROADER-WARES ladder (`VENDOR_CFG.wares.ladder` — rung rows carry
  {gems, gear, gate?}; rung 1 wears the legacy brandt_extra_gems flag)
  widens BOTH halves through the ONE `waresBonus` fold; the delver keeps
  tradeGate/entryLock by data. Co-op: THE KEEPER'S GATE — all reads ride
  the world-keeper's account, mirrored to clients via snapshot verdict
  bits.
  THE BEAT LAW (2026-07-22): ONE counter clock — restockSeconds() =
  VENDOR_CFG.restock.baseSec (300) − owned RUSH rungs (derived "Rush Order"
  rows; legacy brandt_fast_restock = rung 1), floored at minSec; the live
  mark always sits on the lattice boundary ((beat+1)×sec — countdown, tick
  and commission beats can never drift), the tick fires only where a
  counter NPC stands, the panel face reads m:ss (fmtRestock). THE
  FOREORDAINED SHELF: armVendorStock rolls under withSeededRandom
  (core/rng.ts — swap-and-restore, no other stream moves) seeded
  (worldSeed, counter, beat) and THE STANDING SHELF keeps stock arrays
  alive across zone hops (re-arm only on a TURNED beat, vendorArmedBeat;
  adoptWorldState clears the memory so restored holds re-seat) — re-entry
  and reload meet the SAME shelf, purchases stay spliced, re-roll scumming
  means waiting out the beat. THE WALL-TIME ANCHOR: the standing order's
  watch remembers VendorHold.watchedSec (seconds, never beat indices) so a
  rush rung bought mid-run re-buckets honestly — no phantom catchup, no
  re-opened beats (legacy ordinal converts once at rebuild). THE COUNTER
  LAW (dwell): vendor/chandler/delver roles read 'roof' reach
  (DWELL_CFG.npcReach → dwellReachable): a roofed counter serves only
  under its OWN roof (Brandt's open apron no longer auto-opens the panel);
  open-air counters degrade to 'sight' by the mode's law.
  THE GATEWORK (meta/gates.ts — the unlocks OF the unlocks as data): an
  open avenue vocabulary (GateRow: ledger / ledgerPrefix / unlock /
  feature / level / vocation / quest sugars) composed any-of or all-of;
  `UnlockBase.reqAnyOf` gates any catalog row on "whichever road the
  player crosses first", `tease` hangs a chain's next rung SEALED in the
  Vault (named, priced, roads printed with met-marks) once its structure
  is walked; THE MILESTONE DERIVATION (`catalogLevelMilestones` → the
  grantSeatXp sweep) stamps every level the catalog's own gates ask about
  — authoring a level gate IS registering its signal (the old dead
  reached_level_15 gate now lives); quest turn-ins stamp
  `quest_done:<id>` run + account immediately (the grantVocation
  durability precedent). Market chain: early Broader Wares I→II→III; IV→V require Magic Wares
  (ten craft-writ bounties then a Vault investment). Wares I → Memory Counter → Reserved Wares →
  Standing Order (needs one ORDERABLE gem via gemdrop: prefix) — docs in
  `docs/meta/gatework.md`, probes `balance/probe_vendorlocker.ts` E/F.
  THE OBJECTIVE WEB + THE MASTERY LADDER + THE RUNESCRIPT (her ruling
  2026-09-05 — a class is EARNED, never bought): every non-starter class
  hangs in the Vault SHROUDED once its parent ownership chain opens.
  `ClassBundleDef.rumor` supplies identity prose without class names or
  recipes; `classRumorRead` shares its progress-based runic reveal across
  cards, hover, and deal teasers. Each objective reads plain at its own
  `CLASS_WEB_CFG.revealFrac` (25%); detailed hints wait until every row is
  readable. The title stays a generic runic placeholder until earned.
  Vestiges share `data/runescript.ts` as lore, never translation progress.
  `ClassUnlockSpec` compiles ANY-of gameplay deeds and optional ownership
  chains onto `reqAnyOf`/`requiresUnlock`; levels remain mastery-only.
  Earned entries cost zero and refuse investment. `pendingClassUnlocks`
  persists newly discovered cards on Classes; the free Vault Unlock click
  activates selection before shelving them under Owned. `isClassUnlocked`
  excludes pending discoveries, and `unlockedClassCount` gates class slots
  on that same pool. Mu reveals pending classes as named background vessels,
  never dealt or contract-offered. See `docs/meta/class-deeds.md` and
  `balance/vault-discovery-ui.cjs` for the reveal and acknowledgement contract.
  THE CLAIM: `settleClassUnlocks` (the live sweep every `sweepSec` against
  `World.ledgerView()` — the merged account+run fold — plus the Vault, the
  deal, the run's end) hands the class over, gems dropping from the next
  kill. Mortal Essence buys MASTERY instead: `CLASS_TIERS`
  (data/classTiers.ts — Novice/Adept/Expert/Master at class level
  10/30/60/100) × `ClassDef.kit` rows (`replaces` alternates + the Master's
  outright grant) mint `kind:'classtier'` rows (sequenced, behind the earned
  class, unveiled by the derived class milestone —
  `catalogClassLevelMilestones` joins the XP sweep; nothing moot surfaces);
  THE OPENING (`meta/classkit.ts` — `kitChoicesFor`/`resolveClassKit`/
  `rememberKitPicks`, `Account.unlockedClassTiers` + `kitPicks`) resolves
  the wake's bar against OWNED rungs (the class card's chooser →
  `startGame(…, kitPicks)` → `createPlayer({ kit })`; THE CAPSTONE LAW: a
  Master grant may outreach the wake's attributes, cast-gated until the
  build grows; `classOpeningSkills` feeds the class-skill lane). Debuts:
  the four starters' ladders (Necromancer: Shambling Horde — the retuned
  `shambler_horde`, one `grave_shambler` bomber per cast — / Corpse
  Explosion / Bone Golem (`summon_bone_golem` + `bone_golem`) / Grave
  Tide). Docs `docs/meta/discovery.md` + `docs/meta/class-mastery.md`;
  probes `balance/probe_unlocks.ts` + `balance/probe_classmastery.ts`.
  THE STAMPED OPENING (2026-09-13 — the re-kindle hatch follows the actual
  selection): the wake stamps the resolved kit on the seat as
  `PlayerMeta.opening` (saved as `CharacterSave.opening`, wired as
  `SeatMetaW.op`, never re-derived from the account; absent → the class
  bar); `World.reacquireSkill` and the sheet's starter strip read THE STAMP,
  never `ClassDef.bar` — a Warrior who took Carve over Cleave re-kindles
  Carve and Cleave is a stranger; the Master's gift re-kindles too. WORTHLESS
  IS NOT LICENSED: the hatch's `granted` spark passes the learn gate like any
  bag gem, so `castReqRefusal` binds it (THE CAPSTONE LAW holds after a
  respec below); only THE DEV GIFT (`SkillInstance.devGift` — the throng/grab
  dev levers' straight-to-book seat, transient) is exempt. Docs
  `docs/meta/class-mastery.md` §The hatch; probes `probe_classmastery` G +
  `probe_castreq` F.
  THE LEGEND FABRIC (2026-09-08, her ruling: a unique is a BUILD, never a
  stat pool — docs/engine/legends.md, probe `balance/probe_legends.ts`):
  THE GRANTED SKILL — the `skillgrant_<skillId>` stat family
  (engine/skills.ts `skillGrantStat`; value = the skill's LEVEL, grantors
  SUM, clamped to the skill's own max; one registered stat per catalog
  skill at the data/skills.ts tail) folds at `World.recalcSeat` into ONE
  identity-stable SkillInstance per id on `Seat.grantedInsts` — never the
  learned book (WORN, NOT OWNED: no unlearn, no essence leveling, no learn
  gate); bindable, castable, socketable, with THE RESIDENCE ON THE ITEM
  (`ItemInstance.grantState` — sockets + tree picks written back every
  recalc onto the first granting piece, `packGrantState`/
  `restoreGrantState`), OPTIONAL SEATING (`GRANT_CFG.autoSeat` defaults
  off; triggers use the item copy without a seat; an equipped learned copy
  gains the folded grant level as a derived bonus and keeps its investment), THE ONE LOOKUP (`World.seatSkillById` — book, then
  the granted lane, minting a worn grant on demand off the gear so a saved
  or wired bar seats it where it stood) and the ledger `Seat.grantedSkills`
  the panels read; class bonus levels, tree grafts and worn grafts iterate
  the WIELDED set (learned + granted). THE OPEN DOOR — `registerProc`
  (data/procs.ts) registers a legend's trigger beside the item
  (`LEGEND_PROCS` in data/uniques.ts), with THE PROC POWER
  (`procPower_<id>`, base 1 — the magnitude dial beside the chance, folded
  once by `scaleProcEffect`), THE OWN-COPY LAW (`ProcCastSpec.own` — the
  payload plays the caster's HELD instance: level, sockets, tree; opt-in),
  THE BLOW'S TYPE GATE (`ProcDef.hitType` on the packet's dominant rolled
  type) and the 'cast' trigger's carried AIM. ACCUMULATORS AS PLAIN STATE:
  THE STRIDE (`strideReach` + the `'strided'` ConditionId over
  `Actor.strideDist`, banked post-clamp by moveActor only while armed,
  spent by a depth-0 landed blow at the next timer tick), THE ROOTED RAMP
  (the `'still'` derived gauge, `GAUGE_CFG.stillCap`), THE BLOOM
  (`minionBloom`/`minionBloomPower` → `Actor.bloomIn` + the `blooming`
  marker; the lifespan sweep detonates through explodeActor in
  `BLOOM_CFG.type` and ends the body as an expiry), THE EXTRA LANE
  (`extraAs_<type>` — additive beside conversion, folded once at
  applyConversion). THE SPOKEN LINE (`speakLineText`: `{v}`/`{v%}`/`{v0}`).
  THE DEFINING LAW: the probe refuses a legend whose every line an affix
  could roll. Roster: Wanderer's Wake (the stride), The Emberbrand (grants
  Firebolt + The Rekindling), Gravebloom (the bloom), Stormcall (the
  answer, chance + power), The Unmoved (+ the rooted ramp), Bloodletter's
  Girdle (the letting), Fleetfeather (the second refusal), The Miser's Loop
  (the whisper), Titan's Grasp (melee MORE, slower), the Halo (the count),
  The Hollow Sovereign (less taken while the shield holds) and THE
  CINDERVIGIL — the flagship (two granted skills, the spell-cast trigger
  firing the granted copy, the extra lane). THE RELIC LEGENDS (`data/uniques/relics.ts`, probe
  `balance/probe_relicuniques.ts`): six chase pieces for THE RELIQUARY
  riding THE SEAT LAW (`engine/seatlaw.ts` — `seatPower_outward` /
  `_solitude` / `_communion` amplifier stats THE CONTAINER FOLD reads off
  board GEOMETRY as one single-hop factor per seated piece; the
  `seated:<container>` derived gauge), an independent companion grant (the Idol maintains a Stone Golem
  without a bar slot or reservation; a manual golem can coexist and also
  reserves no mana via `summonReservation_<id>`; `engine/companionGrants.ts`) and a rolled
  sunder element.
  Unique grant audit and three additional builds: `docs/design/unique-accords.md`,
  `data/uniques/accords.ts`, `balance/probe_uniqueaccords.ts`. Item grant hosts
  preserve separate socket/tree residence through `grantedHostUid`; companions
  refresh live owner investment without healing. `manaUseCost` discounts only
  Mana spent on use, after conversion, leaving Life and reservation intact.
  THE WORN GRAFT (slot grafts — supports granted BY POSITION): the
  `slotgraft_<slot>_<gemId>` stat family (engine/skills.ts `slotGraftStat`,
  slot 1-based "Skill Slot N"; value = granted gem LEVEL, grantors SUM,
  clamped `MAX_SUPPORT_LEVEL`) binds a support gem to a BAR SEAT — the
  player aims it by binding skills; `World.recalcSeat` derives the grant
  onto whatever sits there through the FULL socket-time gate (misfits
  dormant + self-lifting) and the forward lane's no-second-copy law (a
  socketed copy wins), recorded on `Seat.wornGrafts` (the ledger the
  panels speak dormancy from). ANY modifier source grants one (affix,
  unique line, vestige, passive); the ROLLED catalog (`SLOTGRAFT_CFG`,
  itemaffixes.ts) generates one "of the Nth Finger" suffix per (wild gem ×
  `BAR_SLOTS`) under a TOTAL-mass budget weighted by each gem's own drop
  share — weight-0 gems are structurally unrollable, so ITEM-EXCLUSIVE
  supports ride the same family via unique lines. The Rote Hand now rolls
  one to four distinct support grafts across random skill slots; unsupported
  combinations stay honestly dormant (see `docs/design/reactive-uniques.md`).
  Derived, never saved; census-invisible (bare sim instances wear no
  gear) — docs in `docs/engine/slotgrafts.md`, probe
  `balance/probe_slotgraft.ts`.
  THE FIELD DISCIPLINE (loadout surgery is a camp habit): skill UNLEARN +
  support SOCKET/UNSOCKET gate on cold blades (`World.lastCombatAt` +
  calmSec), no live non-passive hostiles in foeRadius (dummies never
  count, structurally), and — unlearn alone — the skill's own quiet clock
  (off cooldown, not mid-cast); SANCTUARY WAIVES ALL (zone objective
  'safe': Lastlight, the sim arena — the workshop law, so the rack tests
  free and the balance harness is untouched by construction). ONE
  predicate `World.swapRefusal` serves engine gates AND panel buttons —
  refusals speak the same words everywhere; dials in
  `SWAP_DISCIPLINE_CFG` (engine/skills.ts) — docs in
  `docs/engine/discipline.md`, probe `balance/probe_fielddiscipline.ts`.
- `src/data/` — content as data: `skills.ts`, `supports.ts`, `monsters.ts`,
  `passives.ts`, `classes.ts`, `zones.ts`, `tilesets.ts`, `procs.ts`,
  `beacons.ts` (survey-spire objective tuning); items:
  `itembases.ts` (base families), `itemaffixes.ts` (the affix gamut via
  `fam()`), `uniques.ts`, `loottables.ts`, `vestiges.ts` (socketables +
  Epitaph words). Adding content here needs no engine changes.
- `src/packages/` — optional per-run world-event overlays (Warbands, Breach,
  Contagion, …). THE QUICKENING (defs+overlays/quickening.ts) is the
  Terror-Zone lane: a WALKED, outgrown zone's ZoneDef.level surges to a band
  around the hero's for one world-clock window — contents re-mint (zone-memory
  drop at BOTH edges), event density + kill-path bounty fold live, kin wear
  `quickborn`, a champion SURGE ECHO anchors it, the 'quickened_air'
  eventOnly weather dresses it — then reverts EXACTLY (engine reconcile
  stamps/reverts off the overlay's arcs; ZoneDef.quickened remembers home).
  Its SLAYER support lane (overmatch/giantsbane/regicide — vs higher-level /
  far-heavier / empowered victims — plus limbreaver, vs a composite's
  ANCHORED PARTS) folds once at mitigateTyped
  (`SLAYER_CFG`) as plain stats anything may grant. Docs
  `docs/engine/quickening.md`; probe `balance/probe_quickening.ts`.
  THE DESCENT (defs+overlays/descent.ts — the Delver's boundless abyss)
  runs on ONE config (`DescentSurge`): THE DEEP LEDGER (kills bank essence
  units × depth, packets tint up `payoutTierRungs` on the DEPTH axis, haul
  lands in real wallets on resurface × keptOnDeath — the ONE economy, no
  echo purse), THE PRESSURE LADDER (live `zone.level = base + depth ×
  levelPerDepth`; brood presence evaluated at `broodAnchor + depth` so the
  heavy kin never swim shallow; cap+batch density tide), THE PROVING LAW
  (`delverShopOpen` — no counter until THIS shaft's dive resolves), THE
  LOCKED SHELF (once-minted seeded Brandt-grammar stock in `descentStocks`,
  per-entry DEPTH LOCKS via the generic `VendorDef.entryLock` seam vs the
  `descentDeepest` witness), THE ABYSSAL REGISTER (weight-0 reserved affix
  families `DESCENT_AFFIX_FAMILIES`, forced via `withFamily` at
  depth-scaled chances — THE RESERVED-WORD LAW: the economy audit classes
  weight-0 as reserved, never dead), and THE EASE LAW
  (`survivalEase_<resource>` stat family, ONE fold at
  `World.survivalDrainRate`, row-capped — the Lampkeeper suffix's debut).
  Docs `docs/engine/descent.md`; probe `balance/probe_descent.ts`.
  THE ANATOMY GAMUT (data/monsters.ts) fields `MonsterDef.parts` composites
  BELOW boss tier as ordinary spawn-table citizens — one break-lesson each
  (crack the wall / silence the blessing / pick the riders / break the gun /
  pop the sacs / choose the head / burst the idol) — beside trash-tier
  hittable worms (marrow whip; coil matriarch retrofit). Every part is a
  full MonsterDef (forge composables); probe `balance/probe_anatomy.ts`
  also pins the repo-wide kit nets: every monster skill exists + carries an
  ai hint + is affordable from the def's own mana pool, and every look part
  kind resolves to a painter.
- `src/sim/` — the browser-safe half of the balance harness: headless boot
  (`arena.ts`: shims + the quiet `sim_arena` zone), build injection through
  `world.adoptSavedMeta` (`builds.ts`), input-source pilots, the seeded
  episode runner, tap-fed metrics; scenario/build/target LIBRARIES as data
  in `src/sim/data/`. Observation flows through `src/engine/tap.ts` —
  optional chokepoint taps in `damage.ts`/`world.ts`, observe-only,
  null-cost when unset. Node stops at `balance/cli.ts`; per-run reports
  land in `balance/reports/` (gitignored), committed baselines in
  `balance/baselines/`.
- `src/render/` — Canvas 2D renderer + the VISUAL FABRIC (`render/vis/`):
  materials registry (one flat def color → full shaded look), sprite bake
  cache, baked actor bodies, ground texture chunks, the doodad painter
  library (kinds map to painters via `src/data/doodadVisuals.ts` — a new
  doodad kind needs ONE data entry, no renderer edits), the dynamic light
  layer (doodad `light` specs as data; THE BREATHING LIGHT
  `LightSpec.radiance` lerps any lamp on the sky's radiance — lantern
  flora opens at dusk, cave twilight half-lights it under shelter — and
  THE CARRIED LAMP `MonsterDef.light` puts glowing BODIES on the layer
  as live-marched movers; both debut in the grove country's firefly
  fabric with the `'fireflies'` ambientFx kind, docs in
  `docs/engine/grove.md`; THE SHARE LAW `VIS_CFG.lights.share` caps each
  MOVER class's slice of the light budget so an eruption's volley can
  never evict the terrain glow, and an over-full cluster field drops
  FARTHEST from the bin-quantized view centre — the lit set never
  reshuffles as the camera pans), and weather particles under THE
  ANCHORED SKY (`vis/weatherFx.ts` + `VIS_CFG.weather.anchor`): a front
  is a PLACE, never a screen filter — its node-space footprint (the SAME
  pos+radius the engine's rim-falloff sample scores; event pins carry
  their own via `EventFrontPin.pos/radius`, the Demon Storm pins its
  true epicenter) projects into the zone (`skyGeoOf` — FIELD zones
  through their own authored mapping) and the wash + veil draw AS that
  field, dense at the storm's heart, thinning to its rim, fixed in the
  world as the camera pans and sweeping as the front drifts;
  `skyRawIntensity` inverts the rim falloff at the sample point so
  drawn == tested in the sky; particle sheets + wind streamlines
  counter-ride the camera (`WeatherFxDef.parallax`, overclouds idiom).
  STATUS overlays (frost rim, blind iris, low-life, survival vignettes)
  are exempt by law — they happen TO the player and stay screen-anchored
  (`veil.anchor: 'view'` = the same exception as data). Probe:
  `balance/probe_transience.ts` G.
  DOODAD FAMILIES (`engine/doodadFamilies.ts` — scoped invalidation as an
  open registry): consumers that cache against the doodad list (convex
  nav grid, canopy veil index, light clusters, ground bake gather)
  register the predicate that defines their slice and key on
  `World.doodadFamilyRev(id)`; mutation sites that know their doodad
  pass it to `markDoodadsChanged(d)` and only that kind's families
  re-derive (a drying pool's radius steps stop rebuilding the nav grid —
  the churn-cascade fix), a no-arg call bumps all, and unreported
  pushes/splices stay caught by the length key — probe
  `balance/probe_doodadfams.ts`. Session
  hygiene rides THE CACHE STEWARD (`render/vis/caches.ts` — every render
  cache registers; zone/run boundaries trim + release), full-screen washes
  ride the baked EDGE-OVERLAY fabric (`render/vis/overlays.ts`), and
  engine-hostile canvas features gate on the measured CAPABILITY PROBE
  (`render/vis/canvasCaps.ts` — e.g. `VIS_CFG.statusFx.desatMode`).
  THE PORTRAIT FABRIC (`render/vis/portrait.ts`, vis-pure) draws any def AS
  ITSELF in a standalone tile via the same bakes the world blits — measured
  zoom-to-fit, worm trails, composite parts, silhouette mode, an animated
  clock path — feeding the bestiary book (`BESTIARY_CFG.portrait`), per-def
  dials on `MonsterDef.portrait`, and the WEBSITE database via the
  `npm run build:portraits` bundle (`site/assets/portraits.js`, CI-built +
  gitignored beside the `export-web-data` JSON — site pixels can no more
  drift from src/ than site facts can).
  THE SPEECH FABRIC + THE WORD LAYER (`render/vis/speech.ts` + renderer
  `queueSpeech`/`drawSpeeches`): NPC talk as wrapped BUBBLES with a
  typewriter reveal — pure wrap/reveal/fold laws, `VIS_CFG.speech` ←
  `MonsterDef.speech` ← per-call style under the `Settings.speechTyping`
  master switch; every world-anchored line of text (labels, bubbles,
  floaters, scene HUD, reticle) composites ABOVE the room veil's wash —
  the veils decide WHETHER text shows (`labelRevealAt` at the speaker's
  feet: the same-view gate), never get to drown what they revealed —
  docs in `docs/render/speech.md`; probe `balance/probe_speech.ts`.
  THE PORTRAIT DIALOGUE (`ui/dialogue.ts`, `engine/dialogue.ts`,
  `data/dialogue.ts`) is its default reader: live actor portraits shared
  with ultimate cutaways, paged reveal/advance, explicit finish, walk-away
  dismissal, cooldown from completion, and queued functional updates.
  NPC folio leaves share `ui/serviceWorkspace.ts` for stable placement. Player
  ribbons (including Character) use an independent group; overlap never merges
  them. Brandt's Shop opens the existing vendor and becomes the return default.
  The canonical contract is `docs/ui/service-workspace.md`.
  `UI.dialogueContext` owns coexistence, `ui/dialogueLayout.ts` the reader's
  NPC panel. Verify `dialogue-services-ui.cjs` and `inventory-pages-ui.cjs`.
  `DIALOGUE_CFG.presentation` retains the bubble comparison. Contract:
  `docs/ui/dialogue.md`; probe_speech rig L + `balance/dialogue-ui.cjs`.
  Authored state/quest rules, Mireille's optional road invitation, Brandt's
  hammer foreshadowing and fresh-life flask provision are documented in
  `docs/design/town-welcome.md`; verify `probe_townwelcome.ts` and the hidden
  `balance/town-welcome-ui.cjs` harness. Brandt’s white-to-magic stock, five-tier
  market ladders, exact craft-writ bounty progress, board introduction and
  quest-driven hammer appearance: `docs/design/brandt-progression.md`; verify
  `probe_brandtprogression.ts` and `balance/brandt-progression-ui.cjs`.
  THE SPEECH FOCUS now gates presentation through `World.npcSpeechView`:
  `engine/dwellFocus.ts` selects by priority then stable distance, requires
  idle dwell, and admits the winner to the existing telling/cooldown clock.
  `data/speechAttention.ts` folds purpose → role → MonsterDef.speechAttention;
  functional counters outrank ambient talk. Docs `docs/render/speech.md`,
  probe_speech rig K + `balance/speech-focus-ui.cjs` pin the integration.
  THE TRANSIENT TELLING (`engine/speech.ts` — the fabric's WORLD half,
  `SPEECH_CFG`): a folk line is an UTTERANCE, not a caption — it begins on
  A FRESH APPROACH (the nearness EDGE, never the level), stands its whole
  window wherever the hero walks (`holdSec` + THE READING ALLOWANCE
  `holdPerChar`), disperses, then THE HELD TONGUE runs `cooldownSec` on
  the world clock (out-and-back-in earns nothing); per-LANE overrides
  (seat / folk / resident — the line's source), `Infinity` the perpetual
  dial; `speechTell` the ONE pure fold, `World.residentPrompt` its one
  consumer (the read IS the poll; memory per world, never persisted, never
  on the wire), the renderer dumb; the counters' prompts incl. Mireille's
  flask lesson are EXEMPT by lane — docs `docs/render/speech.md` +
  `docs/design/townsfolk-life.md` §1.4; probe rig J. WHAT is said is THE
  SPEECH GRAMMAR (`engine/speechGrammar.ts` — see the town paragraph
  above; docs `docs/engine/speech-grammar.md`).
  Tunables in `render/vis/visConfig.ts`; docs in `docs/render/README.md`.
- `src/ui/`, `src/net/`, `src/meta/` — DOM panels, co-op transport, and the
  account / save / permadeath meta-layer. THE FOLIO (`ui/folio.ts` — docs
  `docs/ui/folio.md`, probe `balance/probe_folio.ts`): dwell dialogs that
  would overlap bind into ONE tabbed book instead of painting over each
  other — the first opened holds the front (THE MASTER LAW), later ones
  arrive as shelved tabs on a thumb index seated on the front's measured
  rect; a walked-away master yields (THE STANDING LAW), a same-arrival tie
  fronts the nearer station (THE NEARER LAW), books never cross owners or
  declared bays unless drawn rects truly overlap (THE MEASURED LAW),
  companions never bind, Esc closes the FRONT leaf through its own close.
  THE PRIMACY LAW (2026-09-16): a leaf has a `kind` ranked by
  `FOLIO_CFG.primacy` (page < station < modal) — a dwell dialog fronts
  over the bag's always-available pages (the Skills drawer stays one tab
  away when the bench opens), a page the bag merely REMEMBERS lands behind
  an open counter, and only THE CALL'S WORD (`adopt(id, 'front')` —
  `InventoryPages.request` for development pages) outranks the ladder; THE
  DEPARTURE LAW: a leaf the player can no longer reach (`reach()`, else
  `engaged()`, on the per-frame sync) closes through its own close — the
  tab goes down where the work is refused; suite members reach through
  `World.stationReach`, `FOLIO_CFG.departureCloses` is the dial.
  A new dialog enrolls with one `folioLeaf` row + one `folio.adopt` at its
  show; the folio keeps no open flag of its own (the SELF-HEAL sync binds
  and drops off each panel's own flag), so one dialog up is byte-identical.
  THE SUITE (`data/suites.ts` + `World.stationReach`): a counter's dialog
  SUMMONS the station dialogs that stand genuinely unlocked in the zone —
  Brandt's counter gathers the bench + the stone as quiet tabs, their WORK
  allowed from the counter through the ONE reach predicate every action
  gate reads, closing with their anchor (one Esc leaves the workbench).
  Inventory owns Skills, Passives, skill trees and container boards through
  `ui/inventoryPages.ts`. Their canonical lifecycle, selection, layout and
  extension contract is `docs/ui/inventory-pages.md`; verify with the hidden
  `balance/inventory-pages-ui.cjs` and `balance/inventory-tabs-ui.cjs` harnesses.
  THE PANEL MOVE (`ui/panelmove.ts`): independent windows drag by their `h2` — the
  zoom law (screen px ÷ the .panel zoom), THE KEEP (never fully off
  screen), double-click resets, the couch dock wins, and a folio book
  MOVES AS ONE (the new front takes the shelved front's seat); THE LAYOUT
  (`Settings.layout`, Options → Layout) is the OPT-IN — "Movable UI" OFF
  by default, seats persist as viewport fractions + per-panel 🔓/🔒 locks,
  a reset re-homes everything. Inventory pages follow the bag's measured
  edge and have no separate saved position (docs/ui/folio.md).
  THE MENU BAR (`ui/menubar.ts` — docs `docs/ui/menu.md`, probe
  `balance/probe_menubar.ts`): ONE Menu button on the HUD's edge (Tab /
  L3, `panelMenu`) fanning a TRAY of every page as DATA rows
  (`data/menu.ts` MenuEntryDef: icon · group · host VERB · bind · gatework
  `gate` · `usable` read) folded by `engine/menu.ts` into hidden / sealed /
  open — THE EXISTENCE LAW (an unowned page is ABSENT, gates over the merged
  ledger) + THE REACH LAW (a station page seals on the SAME near-read its
  dwell fires on: `nearHarborBoard` / `nearMusterHorn` / `mercParley` joined
  the world for it); ATTENTION rows (pips: passive points, banked tree
  points; lessons: Mireille's flasks → the inventory) roll up onto the
  button — THE BUTTON IS THE TELL, the hero's "N passive points — press P"
  line is retired; anchors `MENU_ANCHORS` (`bar` seats off the renderer's
  published `hudClusterRects` — drawn == seated), THE DOCK opt-in, movable
  by its grip under THE LAYOUT; glyphs are `ui/icons.ts` rows.
- Dynamic desktop branches: `launcher/branches.cjs` and the `launcher-branches`
  workflow provide live GitHub selection, verified cached games, per-branch saves,
  and local Main fallback. Contract: `docs/engine/launcher-branches.md`; verify
  `npm run test:launcher`, `smoke:launcher`, `smoke:update`, `smoke`, and `check`.
- `launcher/` — the Electron desktop shell (plain CJS, type-checked via
  `tsconfig.launcher.json`): `main.cjs` (windows, git update flow + the
  packaged DIRECT UPDATE (GitHub-Releases download → silent install →
  relaunch), build
  stamping, IPC, smoke modes, and the full-reset wipe: `saves/` + Chromium
  storage behind a native confirm), `updates.cjs` (THE RELEASE CHANNEL's pure
  brain — channel registry, `pickUpdate`, the probe, the digest-verified
  download; keep it Electron-free), `server.cjs` (loopback HTTP server for `dist/`
  that re-implements the Vite disk-save `/__save/:slot` endpoints — SAME
  `saves/` folder as dev; keep the two implementations in sync), `preload.cjs`
  + `launcher.html` (the launcher UI). Tunables live in `launcher.config.json`
  (committed defaults) deep-merged with `launcher.config.local.json`
  (gitignored, machine-local) — never hardcode window/port/repo values.
- Entry point: `index.html` → `src/main.ts`.
- Opening progression and item readability: `PROGRESSION` owns the starting
  passive budget (zero; first point on level-up); `render/itemIcons.ts` shares
  inventory/drop glyphs and support stars, and `engine/bagsort.ts` groups
  duplicates in adjacent blocks when space permits. Extension notes:
  `docs/design/item-readability.md`; probe `balance/probe_itemreadability.ts`.

Some data files are very large (`src/data/skills.ts`, `src/engine/world.ts`).
Prefer targeted `grep` over reading whole files.

## Save compatibility during prototype development
- Accounts and saved runs are disposable. Prefer deliberate resets over keeping
  legacy gameplay/generation code solely to preserve old saves.
- `SAVE_COMPATIBILITY` in `src/meta/saveCompatibility.ts` is the central policy:
  bump `run` for incompatible character/world changes; bump `account` to reset
  progression and all characters. Compatible updates leave both unchanged.
  Update the player-facing reason. See `docs/engine/save-compatibility.md`.

## README.md — THE DURABLE OVERVIEW
- `README.md` is deliberately short and names NOTHING ordinary development
  changes: no counts, rosters, class lists, file maps, command inventories,
  keybinds or version strings (every one went stale there within weeks).
  **A new system, skill batch or tool does NOT earn a README line** — it earns
  a line HERE and a contract under `docs/`. THE README TEST: would a session
  adding content or a system ever need to edit the line? Then it does not
  belong there.
- Its living facts ride ZERO-COMMIT sources, so no session ever touches the
  file to keep it current: shields.io badges over the GitHub API (stable /
  nightly / checks) and over the Pages-published `data/meta.json` that
  `scripts/export-web-data.ts` rebuilds from `src/data` on every push (the
  badges read `counts.*` BY NAME — rename a key, move the README's query).
- Edit it only when the game's identity, its install path or the four run
  commands change. Its prose follows the site's copy rules (no em dashes).

## License — THE CLEAN TREE
- Hollow Wake is **PolyForm Noncommercial 1.0.0** (`LICENSE.md`; SPDX id in
  `package.json`): anyone may read, run, modify and share it noncommercially;
  every COMMERCIAL right stays with the author. The PolyForm text in
  `LICENSE.md` is VERBATIM from `polyformproject/polyform-licenses@1.0.0` —
  never reword it; only the preface above its rule is ours.
- Those rights hold only while the tree stays CLEAN, as it is today: ZERO
  runtime dependencies, no vendored third-party code, no bundled third-party
  fonts / images / audio (the site's fonts load by URL). So: **never paste in
  code from another project, never commit an asset you did not generate here,
  and never add a runtime dependency, without the author's word.** Dev tooling
  under MIT / Apache-2.0 / BSD / ISC is fine. Copyleft (GPL/AGPL/LGPL) code
  and NC- or ND-licensed assets are NEVER fine — either one would encumber
  the very rights the license reserves. The coming AUDIO pass is the classic
  trap: every sample must be generated in-repo or carry a license that permits
  commercial use, recorded beside the file.

## Commit convention
- After a meaningful change, run `npx tsc --noEmit` (or `npm run build`) and make
  sure it is clean **before** committing.
- Commit with a clear, imperative message saying what changed and why, e.g.
  `Add Frost Nova skill with cold-shatter threshold`.
- Keep commits focused — one logical change each where practical.
- Push when the user asks.
- Never commit generated or personal files: `node_modules/`, `dist/`, `saves/`,
  and `.claude/settings.local.json` are gitignored on purpose. Machine-specific
  settings belong in `.claude/settings.local.json` (stays local, never pushed).

## Concurrent sessions — THE OWNERSHIP GATE
Several Claude Code sessions work this repo AT ONCE, sharing one working tree
(plus the `claude/*` worktrees). **The staged index is shared state.** A
`git commit -a`, or a careless `git add <file>`, silently swallows whatever
a co-session had in flight — and the loss is invisible until they go looking.
The protocol has four steps.

**1. Declare what you own, at session start.** Name the files this session owns
WHOLE, and the distinctive tokens it owns inside SHARED files (`world.ts`,
`skills.ts`, `monsters.ts`, `package.json`, this file). Keep the declaration
session-local — `.claude/ownership.*` is gitignored:

```
# session: the armed list
[files]
balance/probe_applyarm.ts      # new file — mine whole

[tokens]
armedFamily                    # in shared files, hunks naming these are mine
staticallyArmed
STAT_TRADES
```

**2. Stage at hunk grain in shared files.** Never `git add -A` or
`git commit -a`. Use `git add <path>` only for files you own whole; in a shared
file use `git add -p <path>` and take ONLY your own hunks — THE HUNK ROUTER:
route each hunk by a distinctive content token it touches.

**3. Run the gate before every commit.** It reads the staged index (not the
working tree), so run it after staging and before `git commit`:

```bash
node scripts/ownership-gate.mjs --allow .claude/ownership.local.txt
```

`npm run gate -- --allow <file>` is the same thing. It reports EVERY staged
hunk with its file + hunk header and one verdict — `OWNED-FILE`, `OWNED`,
`MIXED` (owned and foreign tokens in one hunk; passes, warns), `FOREIGN`, or
`UNATTRIBUTABLE` — and exits 1 if any hunk is unattributed. `--own-file` /
`--own-token` declare inline without a file, `--strict` also gates MIXED
hunks, `--ignore-token` quiets noise, `--json` is machine-readable; `--help`
carries the declaration format and the rest of the dials.

**Merges:** during a two-parent merge, the gate reconstructs the automatic merge
from `HEAD` and `MERGE_HEAD`. It attributes that baseline to the parent commits,
then checks every staged conflict resolution and additional edit against it.
Declare ownership of those departures, not of incoming committed work. The
report names both parents and the baseline tree. Unresolved index entries,
leftover conflict markers, unsupported multi-parent merges and reconstruction
errors refuse the check; there is no arbitrary baseline or force option.
The reconstruction may need write access to Git's object directory. Gate
regressions run with `node --test scripts/test-ownership-gate.mjs`.

**4. When it fires, re-stage at finer grain — NEVER force.**

```bash
git restore --staged <file>
git add -p <file>
```

If a listed hunk really is yours, DECLARE it — add its token, or the file —
and re-run; the declaration is the honest record of what you touched. Never
widen a declaration to cover a hunk you did not write, and never commit past a
red gate. There is no `--force`, on purpose.

THE UNATTRIBUTABLE VERDICT is the one that matters most. A hunk changing only
numbers or whitespace carries no quotable text, so THE HUNK ROUTER cannot route
it and no token can attribute it — that is precisely the hole this gate exists
to close. Because it keys on OWNERSHIP rather than on recognizable prose, such
a hunk is reported with its raw changed lines instead of passing silently: read
them, decide whose they are, then declare the file or unstage it. (Git's hunk
header names the enclosing symbol as provenance, but it NEVER attributes — it
is git's heuristic guess, not your declaration.)

Two habits keep the gate cheap: prefer NEW files for new work (a file you own
whole needs no token bookkeeping), and land your own change promptly rather
than letting it sit staged across another session's landing.
