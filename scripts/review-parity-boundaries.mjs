import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=path.join(root,'baseline/prototype-parity');
const declarations=JSON.parse(fs.readFileSync(path.join(directory,'declarations.json')));
const rules=new Map(),world=new Map();
const rule=(names,disposition,evidence,note)=>{for(const name of names.split(' ')){assert(!rules.has(name),name);rules.set(name,{disposition,evidence,note});}};
const methods=(names,disposition,evidence,note)=>{for(const name of names.split(' ')){assert(!world.has('World.'+name),name);world.set('World.'+name,{disposition,evidence,note});}};
rule('castSequence strikeTiming groundDevices buffSource projectileArts summonArts cohortArts frameArts channelFormation summonPacts battleDoctrines minionTransmutation',
 'source-derived-controller',['scripts/extract-prototype-mechanics.mjs','baseline/prototype-parity/mechanics-extraction.json'],
 'Complete pinned modules, with owner-scoped RNG, identity and explicit host ports. Query imports compile from the same source lock.');
rule('battleDoctrineSpec cohortSpec frameSpec projectileArtsSpec summonArtsSpec summonPactSpec satelliteSpec skills skillPreview castingCues skillFieldVisual handling',
 'current-query-and-contract',['scripts/compile-combat-hit-queries.mjs','scripts/compile-combat-queries.mjs','scripts/compile-character-builds.mjs'],
 'Current source supplies read rules and data contracts; public sessions expose detached behavior and presentation facts.');
rule('actor','ported-actor-state-and-rules',['scripts/compile-combat-actor-state.mjs','src/status-lifecycle.ts','src/skill-pricing.ts','src/restoration-streams.ts','adapters/embedded/combat-actor.mjs'],
 'Actor defaults are compiled from the pin; status clocks, cost, charge timing and pin struggle are maintained SDK rules. AI scheduling fields carry no autonomous planner.');
rule('stats','ported-stat-rules',['src/stats.ts','test/stat-fork.test.mjs','test/prototype-parity-rules.test.mjs'],
 'Current catalogue, resistance-neutral reductions and bounded/unbounded query semantics.');
rule('status','current-status-content',['scripts/combat-registry-data.mjs','src/status-lifecycle.ts','test/status-lifecycle.test.mjs'],
 'Current status definitions; independent stack clocks are owned by SDK actors.');
rule('damage','ported-damage-rules',['src/damage-pipeline.ts','src/damage-pipeline-types.ts','test/damage-pipeline.test.mjs'],
 'Typed vulnerability, resistance-neutral wound basis, interceptor and observer ordering.');
rule('assault replenishment','source-derived-command-rules',['scripts/extract-combat-command-controllers.mjs','baseline/prototype-parity/commands-extraction.json'],
 'Current command controllers are separate from general AI scheduling.');
rule('attackSequences','ported-sequences',['src/attack-sequences.ts','adapters/embedded/combat-prototype-hit-ports.mjs'],'Source attribution and landing callbacks retain owner scope.');
rule('challenges challengeSpec','ported-challenges',['src/challenges.ts','adapters/embedded/combat-prototype-hit-ports.mjs'],'Current delivery/query contracts, source attribution and effect-layer propagation.');
rule('companionBonds','ported-companion-hit',['src/companion-bonds.ts','adapters/embedded/combat-prototype-hit-ports.mjs'],'Partner payloads retain source skill attribution.');
rule('guardArts','ported-guard-buffs',['src/guard-arts.ts','adapters/embedded/combat-prototype-hit-ports.mjs'],'Plate and sync buffs carry the authored skill source.');
rule('minionInheritance','ported-inheritance',['src/minion-inheritance.ts','adapters/embedded/combat-body-services.mjs'],'Sylvan inheritance uses an empty stat sheet while retaining the summon instance modifiers.');
rule('summonContracts','ported-capacity',['src/summon-contracts.ts','test/summon-contracts.test.mjs'],'Frame consolidation changes live body count after reservation accounting.');
rule('bodySweep','host-geometry',['docs/boundary-contract.md','adapters/embedded/combat-session.d.ts'],'Continuous scenery collision belongs to the host; it returns resolved physical poses.');
rule('ai aiActions brain companionStances','host-ai',['docs/boundary-contract.md','adapters/embedded/combat-session.mjs'],'General planning remains host-owned. Authored summon tactics and shared issueCommand/obedience rules are included separately.');
rule('intent','host-ai-with-combat-tells',['scripts/extract-prototype-mechanics.mjs','adapters/embedded/combat-body-services.mjs'],'General intent scheduling stays host-owned; bodyTellSpecs is compiled for authored combat bodies.');
rule('accountReliquary','optional-custody',['src/character-session.ts','src/character-context.ts','scripts/test-prototype-character.mjs'],'Canonical Relic retirement is a synchronous optional host capability; the required character owner needs no account or save.');
methods('collectDeedDot applyDeedDot loseBagRelicsOnDeath recordDeath recordSeatDeath loadZone updateFractures adoptWorldState grantSupportGemItem armBountyBoard nemesisActive nemesisEligible manifestNemeses vocationMenuOffers updateVocationSites spawnPlayerCorpses nearPlayerCorpse updatePlayerCorpses reclaimCorpse dropSavedLoot memoryRecallView corpseTargetsView openChest updateChests updateShrines trackDeedDot summonDotShares codexSightings touchers',
 'optional-world-or-progression',['docs/boundary-contract.md','docs/prototype-parity.md'],'Campaign, account, persistence, exploration and reward production remain outside the required combat/build graph.');
methods('imminentThreatTo updateWatch targetingFinds pressBarred','host-ai',['docs/boundary-contract.md'],'AI selection helpers; ordinary cast admission and authored summon tactics remain in the SDK.');
methods('effectTentacleSwing effectMawReel effectDescentTrap effectCrystalBeam effectLavaOrb mintHazardCloud fireStrikeAt fireMeteor setDoorState burnRain sweepHazardSurface frontSplash updateTerrainEffects pathField clampPos steppedClamp applyEnvDamage groundAt addTempGround updateWindPush',
 'host-physical-or-environmental',['adapters/embedded/combat-session.d.ts','adapters/embedded/combat-host-services.mjs','adapters/embedded/combat-field-services.mjs'],
 'Host owns scenery, environment and collision. Combat effects retain explicit floors and pass them through host ports; no world-generation transplant.');
methods('applyInputs applyAction slotFaceOf setSummonSchools breakOneItem salvageItem salvageBulk canRetireRelics recalcSeat',
 'ported-public-build-or-input',['adapters/embedded/combat-session.mjs','src/character-progression-commands.ts','src/character-rebuild.ts','src/crafting-actions.ts','scripts/test-prototype-character.mjs'],
 'Input and Inventory commands use the memory-only owner; school choices persist in portable investment; Relic custody is optional and explicit.');
methods('createMonster spawnMinion spawnConstruct tameCompanion hatchPod releaseContract updateSummonContracts',
 'ported-body-lifecycle',['adapters/embedded/combat-body-services.mjs','adapters/embedded/combat-birth-services.mjs','src/summon-birth.ts','src/construct-birth.ts','src/companion-claims.ts'],
 'Current native tuning, summon kits, support forwarding, pact identity, frame capacity, companion conversion and hatch floors.');
methods('kill runDeath','ported-death',['src/combat-death.ts','adapters/embedded/combat-death-services.mjs','test/prototype-parity-rules.test.mjs'],'Single retirement, deferred frame death, undying original cause and all combat-controller callbacks. Rewards remain optional observers.');
methods('hostileTo castReqRefusal pressUsable useSkill castPress updateCasting update','ported-clock-and-admission',['adapters/embedded/combat-clock-services.mjs','adapters/embedded/combat-casting-services.mjs','src/skill-request.ts','src/skill-dispatch.ts'],
 'Required combat phases and admission are composed in SDK-owned order; general World update is not imported.');
methods('spawnProjectile returnTarget nearestProjTarget kinkProjectile advanceProjectile explodeProjectile projTouches shedFlightShrapnel updateProjectiles pendingSalvos updateRepeats',
 'ported-projectiles',['src/projectiles.ts','src/projectile-delivery.ts','src/projectile-schedules.ts','baseline/prototype-parity/layers-v2-acceptance.json'],
 'Owned art hooks, original effect floors, salvos, orbit contacts and return behavior.');
methods('strikeZoneSurfaces detonateFissureSegment updateZones updateZoneDomain zoneVictims zoneSees',
 'ported-fields',['src/field-simulation.ts','test/field-simulation.test.mjs','baseline/prototype-parity/layers-v2-acceptance.json'],
 'Field floors, surface callbacks, stacking groups and delayed secondary effects.');
methods('applyHeal ringAfflictions updateAuras','ported-restoration-and-status',['src/aura-ticking.ts','src/status-effects.ts','src/restoration-streams.ts','adapters/embedded/combat-recovery-services.mjs'],
 'Caster-life healing, independent status stack clocks, heal observers and source identity.');
methods('assaultDoomCull burstDamage resolveHit executeProc updatePendingBursts ruptureBank ruptureStatus updateGrabs',
 'ported-damage-and-feedback',['src/hit-status.ts','src/status-effects.ts','src/death-bursts.ts','src/delayed-bursts.ts','src/grab.ts','adapters/embedded/combat-prototype-hit-ports.mjs'],
 'Shared damage changes, effect floors, reentrant status removal and owner-local damage-text bursts.');
methods('updateDetonations','ported-device-clock',['src/utility-deliveries.ts','adapters/embedded/combat-movement-services.mjs'],'Mine detonation countdown lives on the device and commands retain original scheduling.');
methods('updateConstructs','ported-construct-clock',['scripts/extract-prototype-mechanics.mjs','src/construct-lifecycle.ts','adapters/embedded/combat-construct-services.mjs'],'Current trap/mine branches use authored contacts, arming and countdown; the October profile explicitly retains its original construct switch.');
methods('grantTreeBuff','ported-buff-source',['src/cast-buffs.ts','adapters/embedded/combat-caster-services.mjs'],'Tree buffs retain source identity and owner-scoped retirement.');
methods('text damageText damageTextBursts','portable-feedback',['adapters/embedded/combat-host-services.mjs','adapters/embedded/combat-session.mjs'],'Numeric feedback grouping belongs to one owner; renderer consumes detached semantic cues.');
const policy=JSON.parse(fs.readFileSync(path.join(directory,'policies-extraction.json')));
for(const name of Object.keys(policy.methods))if(!world.has('World.'+name))methods(name,'source-derived-combat-policy',['scripts/extract-combat-policies.mjs','baseline/prototype-parity/policies-extraction.json'],'Reviewed World combat method, with the existing explicit host-boundary transforms.');
const mechanicNames='forwardSummonSockets resyncMinionSupports summonCrewSkills clearTreeFields clearSummonReleaseFields movementLocked tryShellBlock mintMetaInstance autonomousMetas deviceCommandUseful losCached echoCeiling consumeChargeCost mintAftermath dropLingerField layFissure moveBlast mintTrailPatch statTrailSpec clampGroundTarget enemiesOf healAlliesInArea spawnAftershocks releaseStruckSummons updateTerraforms doctrineGrowths updateDoodadEffects isEffectTarget nearestInReach effectGrowthLash chargesThroughSeat executeSkill projectileArts cohortArts frameArts summonArts channelFormations battleDoctrines summonPacts deviceContacts losMemo';
for(const name of mechanicNames.split(' '))if(!world.has('World.'+name))methods(name,'source-derived-combat-mechanics',['scripts/extract-prototype-mechanics.mjs','baseline/prototype-parity/mechanics-extraction.json'],'Current controllers, deliveries or selected combat conductor methods. Transient combat growths remain separate from static world scenery.');
const rows=[],pending=[];
for(const row of declarations)for(const declaration of row.declarations){
 const name=declaration.name,kind=(declaration.after??declaration.before).kind;let review;
 if(row.file==='src/engine/world.ts')review=name==='isValidMetaAction'
  ?{disposition:'public-input-admission',evidence:['src/character-progression-commands.ts','adapters/embedded/combat-session.mjs','adapters/node-godot/host.mjs'],note:'School choices and frame dismissal are admitted through explicit SDK commands; original network meta-action parsing stays with the game.'}:world.get(name);
 else if(row.file.startsWith('src/engine/'))review=rules.get(path.basename(row.file,'.ts'));
 else if(row.file.startsWith('src/data/'))review=['src/data/sheet.ts','src/data/validate.ts'].includes(row.file)
  ?{disposition:'authoring-or-ui-metadata',evidence:['docs/prototype-parity.md'],note:'Sheet labels and original authoring validation stay with the client/reference; runtime registries are separately compiled and validated.'}
  :{disposition:'current-authored-content',evidence:['scripts/capture-parity-content.mjs','scripts/combat-registry-data.mjs','scripts/prototype-content.mjs','baseline/prototype-parity/content-acceptance.json'],note:'Pinned current data and dependent registry initialization; original catalogue observations are hash-verified.'};
 else if(row.file.startsWith('src/ui/'))review={disposition:'host-ui',evidence:['adapters/embedded/combat-session.d.ts','src/character-progression-commands.ts'],note:'DOM/layout stays client-owned. Required school choice and Dismiss Frame actions are public SDK operations; no UI transplant.'};
 else if(row.file.startsWith('src/net/'))review={disposition:'host-network',evidence:['adapters/node-godot/index.d.ts','adapters/embedded/combat-session.d.ts'],note:'Original co-op protocol stays host-owned; SDK exposes detached build, combat and effect state.'};
 else if(row.file.startsWith('src/meta/')||row.file.startsWith('src/quests/'))review={disposition:'optional-persistence-or-quests',evidence:['src/gem-residence.ts','scripts/test-prototype-character.mjs'],note:'Original save/campaign architecture remains optional; portable school choices round-trip independently.'};
 if(!review&&['InterfaceDeclaration','TypeAliasDeclaration'].includes(kind))review={disposition:'host-or-internal-data-type',evidence:['adapters/embedded/combat-session.d.ts'],note:'Internal World wire shape; required combat state is represented by SDK-owned types and detached public views.'};
 if(!review){pending.push(row.file+':'+name);continue;}
 rows.push({file:row.file,name,before:declaration.before?.sha256??null,after:declaration.after?.sha256??null,...review});
}
const evidence=Object.fromEntries([...new Set(rows.flatMap(r=>r.evidence))].sort().map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))]));
const result={schemaVersion:1,status:'declarations-reviewed; release-qualification-separate',declarationsSha256:sha256(fs.readFileSync(path.join(directory,'declarations.json'))),evidence,rows,pending};
const file=path.join(directory,'boundary-review.json');
if(process.argv.includes('--check'))assert.equal(sha256(JSON.stringify(JSON.parse(fs.readFileSync(file)))),sha256(JSON.stringify(result)),'Boundary review evidence changed');else writeJSON(file,result);
console.log(JSON.stringify({reviewed:rows.length,pending},null,2));if(pending.length)process.exitCode=1;
