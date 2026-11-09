import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root } from './reference-utils.mjs';

const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const artifacts = path.join(root, '.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const [packed] = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', artifacts, '--cache', path.join(artifacts, 'npm-cache')],
  { cwd: root, encoding: 'utf8' }));
assert.ok(packed.files.every(file => !/^(baseline|reference|scripts|test|src|\.reference|node_modules)\//.test(file.path)), 'Development or original-game files leaked into package');
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-wake-consumer-'));
let result;
try {
fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
execFileSync(process.execPath, [npmCli, 'install', path.join(artifacts, packed.filename),
  '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--cache', path.join(consumer, 'cache')],
{ cwd: consumer, stdio: 'pipe' });
fs.writeFileSync(path.join(consumer, 'run.mjs'), `
import fs from 'node:fs';
import assert from 'node:assert/strict';
Math.random = () => { throw new Error('ambient RNG called'); };
globalThis.fetch = () => { throw new Error('network called'); };
for (const key of ['window', 'document', 'localStorage']) Object.defineProperty(globalThis, key, { get() { throw new Error(key + ' accessed'); } });
const { Engine, CastRuntime, TimedDamage, Inventory } = await import('@hollow-wake/engine');
const {SkillRackActions,restoreLearnedSeatIds}=await import('@hollow-wake/engine/skills/rack');
const {SkillBarActions,restoreSkillSlotMemory,rememberSkillSlot,planSkillSlots}=await import('@hollow-wake/engine/skills/bar');
assert.equal(typeof SkillBarActions,'function');
assert.deepEqual(restoreSkillSlotMemory({kept:0,invalid:-1}),{kept:0});
const preferred={};assert(rememberSkillSlot(preferred,{def:{id:'new'}},1,true,()=>true));
assert.deepEqual([...planSkillSlots(['new','kept'],['kept',null],preferred)],[['kept',0],['new',1]]);
const {PouchRecall}=await import('@hollow-wake/engine/inventory/pouch-recall');
const pouchContent=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/engine/content/pouch-recall.json')),'utf8'));
const recall=new PouchRecall(pouchContent).forActor({level:10,all:false,skills:[],supports:[]});
assert.deepEqual(recall.cut({d:'crypt_lich',s:1,g:{k:'skill',id:'firebolt',r:'legendary',l:3}}),
  {name:'Firebolt',gem:{kind:'skill',skillId:'firebolt',level:3,rarity:'legendary',sockets:[null,null,null,null]}});
assert.equal(typeof SkillRackActions,'function');
assert.deepEqual(restoreLearnedSeatIds(['fireball'],['firebolt','fireball'],3),['fireball','firebolt',null]);
const bridge = await import('@hollow-wake/engine/hollow-wake');
const { InventoryHost } = await import('@hollow-wake/engine/inventory/host');
const { StashPolicy } = await import('@hollow-wake/engine/inventory/stash');
const { ContainerLayout, ContainerPolicy, SeatRules, SeatGeometry } = await import('@hollow-wake/engine/inventory/containers');
const { relicCanManage } = await import('@hollow-wake/engine/inventory/actions');
const { equipmentTierLevel } = await import('@hollow-wake/engine/inventory/equipment');
assert.equal(equipmentTierLevel(4,[1,6]),6);
assert.equal(relicCanManage({ownHosted:false,oracleReach:()=>{throw new Error('Unauthorized host read');}}),false);
assert.equal(bridge.HOLLOW_WAKE_ADAPTER_VERSION, 1);
assert.equal(bridge.castDuration(.1), .2);
const content = JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/engine/content/milestone-one.json')), 'utf8'));
const engine = new Engine(content, 42);
const hero = engine.character({ classId: 'magician', passivePoints: 1 });
hero.equip('lapis-reference', 'ring1');
hero.allocate('cross_int_pursuit');
const skill = engine.skill({ id: 'ruin', level: 5, sockets: 2, treePoints: 1,
  supports: [{ id: 'corrosion', level: 2 }, { id: 'measured_blows', level: 1 }], nodes: ['ruin_studies'] });
const result = engine.resolveHit(hero, skill, engine.target({ life: 500 }));
assert.ok(result.damage > 0 && result.life < 500);
assert.equal(engine.planBuilds, 1);
const casting = new CastRuntime({ mana: 100, life: 100 });
assert.equal(casting.press(engine.castProfile(hero, skill)).kind, 'started');
assert.equal(casting.advance(10).kind, 'completed');
const burning = new TimedDamage({ id: 'burn', damageType: 'fire', duration: 4, reapply: 'strongest', clock: 'hollow-wake-frame/v1' });
burning.apply(10);
assert.equal(burning.advance(.5), 5);
assert.equal(TimedDamage.restore(burning.snapshot()).remaining, 3.5);
const bag = new Inventory({ w: 3, h: 3, rows: ['###', '#.#', '###'] });
assert.equal(bag.insert({ id: 'ring', w: 1, h: 1, data: { affixes: ['retained'] } }), true);
assert.equal(bag.move('ring', 1, 1), 'blocked');
assert.equal(Inventory.restore(JSON.parse(JSON.stringify(bag.snapshot()))).at(0, 0), 'ring');
const live = new InventoryHost(item => item), liveBag = [], item = { uid: 'live', w: 1, h: 1, payload: { retained: true } };
assert(live.autoPlace(liveBag, item, { w: 2, h: 2 }));assert.equal(liveBag[0], item);
item.x = 1; item.y = 1;
assert.deepEqual(live.firstFit([...liveBag], { uid: 'next', w: 1, h: 1 }, { w: 2, h: 2 }), { x: 0, y: 0 });
assert.equal(live.remove(liveBag, 'live'), item);assert.equal(item.payload.retained, true);
const storage = new StashPolicy(item => item), storageDef = { id: 'locker', board: { w: 2, h: 1 }, initialPages: 1, maxPages: 2, pageCostBase: 40, accepts: () => true };
const stored = [{ key: 'body', item }], layout = storage.restore(storageDef, stored);
assert.deepEqual(layout.cells.body, { page: 0, x: 0, y: 0 });
const plan = storage.plan(storageDef, stored, layout, stored[0], { page: 0, x: 1, y: 0 });
assert.equal(plan.cells.body.x, 1);assert.equal(layout.cells.body.x, 0);assert.equal(item.x, undefined);
const caseLayout = new ContainerLayout([{ feature: 'case', cells: ['##'] }]), caseBoard = caseLayout.board(new Set(['case']));
const casePolicy = new ContainerPolicy({ footprint: i => i, base: () => ({ category: 'relic', tags: [] }), level: () => 1, unique: () => undefined });
assert.equal(casePolicy.landing({ label: 'Case', accepts: { categories: ['relic'] } }, caseBoard, [], item, 'bag', 0, 0, 1).verdict, 'place');
const seatRules = new SeatRules({ amplifiers: [{ stat: 'seatPower_outward', mode: 'outward' }], relicCaps: [{ stat: 'damage', cap: null }], relicBaseline: .2 });
const seats = new SeatGeometry(i => i, (mods, mode) => seatRules.power(mods, mode));
const left = { uid: 1, x: 0, y: 0, w: 1, h: 1 }, right = { uid: 2, x: 1, y: 0, w: 1, h: 1 };
assert.equal(seats.amplification(caseBoard, [left, right], () => [{ stat: 'seatPower_outward', kind: 'flat', value: .5 }]).get(right), 1.5);
console.log(JSON.stringify({ installedConsumer: true, damage: result.damage, randomDraws: result.randomDraws }));
`);
result = execFileSync(process.execPath, ['run.mjs'], {
  cwd: consumer, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' },
});
} finally {
  assert.equal(path.dirname(fs.realpathSync(consumer)),fs.realpathSync(os.tmpdir()));
  fs.rmSync(consumer,{recursive:true});
}
const jsBytes = packed.files.filter(file => file.path.endsWith('.js')).reduce((sum, file) => sum + file.size, 0);
const itemJsBytes = packed.files.filter(file => /^dist\/item-.*\.js$/.test(file.path) && file.path !== 'dist/item-restoration.js').reduce((sum, file) => sum + file.size, 0);
const passiveJsBytes = packed.files.filter(file => /^dist\/passive-.*\.js$/.test(file.path)).reduce((sum, file) => sum + file.size, 0);
const inventoryHostJsBytes = packed.files.filter(file => file.path === 'dist/inventory-host.js').reduce((sum, file) => sum + file.size, 0);
const stashJsBytes = packed.files.filter(file => file.path === 'dist/stash-policy.js').reduce((sum, file) => sum + file.size, 0);
const containerJsBytes = packed.files.filter(file => /^dist\/(container-layout|container-policy|seat-rules)\.js$/.test(file.path)).reduce((sum, file) => sum + file.size, 0);
const relicJsBytes = packed.files.filter(file => file.path === 'dist/relic-custody.js').reduce((sum, file) => sum + file.size, 0);
const actionJsBytes = packed.files.filter(file => file.path === 'dist/relic-actions.js').reduce((sum, file) => sum + file.size, 0);
const equipmentJsBytes = packed.files.filter(file => file.path === 'dist/equipment-actions.js').reduce((sum, file) => sum + file.size, 0);
const progressionJsBytes = packed.files.filter(file => file.path === 'dist/character-progression.js').reduce((sum, file) => sum + file.size, 0);
const skillJsBytes = packed.files.filter(file => /^dist\/skill-.*\.js$/.test(file.path) && !['dist/skill-bar.js', 'dist/skill-admission.js', 'dist/skill-instances.js', 'dist/skill-intent.js', 'dist/skill-request.js', 'dist/skill-dispatch.js'].includes(file.path)).reduce((sum, file) => sum + file.size, 0);
const continuationJsBytes = packed.files.filter(file => file.path === 'dist/casting-continuation.js').reduce((sum, file) => sum + file.size, 0);
const bankJsBytes = packed.files.filter(file => file.path === 'dist/channel-banks.js').reduce((sum, file) => sum + file.size, 0);
const actorGaugeJsBytes = packed.files.filter(file => file.path === 'dist/actor-gauges.js').reduce((sum, file) => sum + file.size, 0);
const actorConditionJsBytes = packed.files.filter(file => file.path === 'dist/actor-conditions.js').reduce((sum, file) => sum + file.size, 0);
const dispatchJsBytes = packed.files.filter(file => file.path === 'dist/skill-dispatch.js').reduce((sum, file) => sum + file.size, 0);
const requestJsBytes = packed.files.filter(file => file.path === 'dist/skill-request.js').reduce((sum, file) => sum + file.size, 0);
const intentJsBytes = packed.files.filter(file => /^dist\/(cast-seals|skill-instances|skill-intent)\.js$/.test(file.path)).reduce((sum, file) => sum + file.size, 0);
const admissionJsBytes = packed.files.filter(file => file.path === 'dist/skill-admission.js').reduce((sum, file) => sum + file.size, 0);
const supportJsBytes = packed.files.filter(file => /^dist\/support-.*\.js$/.test(file.path)).reduce((sum, file) => sum + file.size, 0);
const resourceJsBytes = packed.files.filter(file => /^dist\/(charge-runtime|resource-gauges|resource-content|resource-events)\.js$/.test(file.path)).reduce((sum, file) => sum + file.size, 0);
const chargedCastJsBytes = packed.files.filter(file => file.path === 'dist/charged-casting.js').reduce((sum, file) => sum + file.size, 0);
const interactiveCastJsBytes = packed.files.filter(file => file.path === 'dist/interactive-casting.js').reduce((sum, file) => sum + file.size, 0);
const ammunitionJsBytes = packed.files.filter(file => file.path === 'dist/ammunition.js').reduce((sum, file) => sum + file.size, 0);
const channelCastJsBytes = packed.files.filter(file => file.path === 'dist/channel-casting.js').reduce((sum, file) => sum + file.size, 0);
const guardCastJsBytes = packed.files.filter(file => file.path === 'dist/guard-casting.js').reduce((sum, file) => sum + file.size, 0);
const paymentJsBytes = packed.files.filter(file => file.path === 'dist/resource-payment.js').reduce((sum, file) => sum + file.size, 0);
const procJsBytes = packed.files.filter(file => /^dist\/proc-.*\.js$/.test(file.path) && !['dist/proc-effects.js', 'dist/proc-casting.js', 'dist/proc-delivery.js', 'dist/proc-delivery-types.js'].includes(file.path)).reduce((sum, file) => sum + file.size, 0);
const procEffectJsBytes = packed.files.filter(file => file.path === 'dist/proc-effects.js').reduce((sum, file) => sum + file.size, 0);
const delayedJsBytes = packed.files.filter(file => file.path === 'dist/delayed-bursts.js').reduce((sum, file) => sum + file.size, 0);
const buffJsBytes = packed.files.filter(file => /^dist\/(buffs|buff-content)\.js$/.test(file.path)).reduce((sum, file) => sum + file.size, 0);
const cooldownJsBytes = packed.files.filter(file => /^dist\/(cooldowns|cooldown-content)\.js$/.test(file.path)).reduce((sum, file) => sum + file.size, 0);
const cooldownLifecycleJsBytes = packed.files.filter(file => file.path === "dist/cooldown-lifecycle.js").reduce((sum, file) => sum + file.size, 0);
const readyBankJsBytes = packed.files.filter(file => file.path === "dist/ready-cooldown-bank.js").reduce((sum, file) => sum + file.size, 0);
const sequenceRecoveryJsBytes = packed.files.filter(file => file.path === "dist/sequence-recovery.js").reduce((sum, file) => sum + file.size, 0);
const attackSequenceJsBytes = packed.files.filter(file => /^dist\/attack-sequence(?:s|-types|-content)\.js$/.test(file.path)).reduce((sum, file) => sum + file.size, 0);
const damageJsBytes = packed.files.filter(file => /^dist\/damage-pipeline(?:-types)?\.js$/.test(file.path)).reduce((sum, file) => sum + file.size, 0);
const statusJsBytes = packed.files.filter(file => /^dist\/status-lifecycle(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const statusEffectsJsBytes = packed.files.filter(file => /^dist\/status-effects(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const hitStatusJsBytes = packed.files.filter(file => /^dist\/hit-status(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const hitEffectsJsBytes = packed.files.filter(file => /^dist\/hit-effects(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const hitPreparationJsBytes = packed.files.filter(file => /^dist\/hit-preparation(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const hitLandingJsBytes = packed.files.filter(file => /^dist\/hit-landing(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const hitSustainJsBytes = packed.files.filter(file => /^dist\/hit-sustain(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const hitReactionsJsBytes = packed.files.filter(file => /^dist\/hit-reactions(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const hitAftermathJsBytes = packed.files.filter(file => /^dist\/hit-aftermath(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const statusDeliveryJsBytes = packed.files.filter(file => /^dist\/status-delivery(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const procCastingJsBytes = packed.files.filter(file => file.path === 'dist/proc-casting.js').reduce((sum,file)=>sum+file.size,0);
const procDeliveryJsBytes = packed.files.filter(file => /^dist\/proc-delivery(?:-types)?\.js$/.test(file.path)).reduce((sum,file)=>sum+file.size,0);
const vocationJsBytes = packed.files.filter(file => ['dist/vocations.js','dist/vocation-grants.js','dist/vocation-keys.js'].includes(file.path)).reduce((sum,file)=>sum+file.size,0);
const siteJsBytes = packed.files.filter(file => ['dist/vocation-sites.js','dist/vocation-site-placement.js'].includes(file.path)).reduce((sum,file)=>sum+file.size,0);
const characterJsBytes = packed.files.filter(file => ['dist/character-identity.js','dist/class-kits.js','dist/class-claims.js'].includes(file.path)).reduce((sum,file)=>sum+file.size,0);
const continuityJsBytes = packed.files.filter(file => ['dist/class-account.js','dist/class-rewards.js','dist/mercenary-identity.js','dist/character-continuity-content.js'].includes(file.path)).reduce((sum,file)=>sum+file.size,0);
const gateJsBytes = packed.files.filter(file => ['dist/progression-gates.js','dist/progression-gate-content.js'].includes(file.path)).reduce((sum,file)=>sum+file.size,0);
// Optional unlock/reward entries do not belong to the historical eager core.
// Keep every predecessor limit and give each new module an explicit growth cap.
const unlockModuleBudgets = {
  'memory-rewards': 8, 'memory-reward-content': 8, 'unlock-lifecycle': 26,
  'unlock-content': 21, 'unlock-predicates': 3, 'rune-script': 4,
};
const unlockModuleBytes = Object.fromEntries(Object.entries(unlockModuleBudgets).map(([name, kib]) => {
  const matches = packed.files.filter(file => file.path === `dist/${name}.js`);
  assert.equal(matches.length, 1, `Missing optional module ${name}`);
  assert.ok(matches[0].size > 0 && matches[0].size <= kib * 1024, `${name} exceeded its separate ${kib} KiB budget`);
  return [name, matches[0].size];
}));
const unlockJsBytes = Object.values(unlockModuleBytes).reduce((sum, size) => sum + size, 0);
const progressionSessionJsBytes = packed.files.filter(file => file.path === 'dist/progression-session.js').reduce((sum,file)=>sum+file.size,0);
const craftingModuleBytes = Object.fromEntries(Object.entries({crafting:12,'crafting-content':12,'crafting-actions':14}).map(([name,kib])=>{
  const matches=packed.files.filter(file=>file.path===`dist/${name}.js`);assert.equal(matches.length,1);
  assert.ok(matches[0].size>0&&matches[0].size<=kib*1024,`${name} exceeded its separate ${kib} KiB budget`);return [name,matches[0].size];
}));
const residenceModuleBytes = Object.fromEntries(Object.entries({'gem-residence':10,'item-restoration':3}).map(([name,kib])=>{
  const matches=packed.files.filter(file=>file.path===`dist/${name}.js`);assert.equal(matches.length,1);
  assert.ok(matches[0].size>0&&matches[0].size<=kib*1024,`${name} exceeded its separate ${kib} KiB budget`);return [name,matches[0].size];
}));
// Versioned account views add ~1.6 KiB of unminified session code; the complete
// Godot bundle has its own 102 KiB minified ceiling and measured action budget.
const craftingSessionModuleBytes = Object.fromEntries(Object.entries({'crafting-session':23,'crafting-session-data':18,'session-json':6}).map(([name,kib])=>{
  const matches=packed.files.filter(file=>file.path===`dist/${name}.js`);assert.equal(matches.length,1);
  assert.ok(matches[0].size>0&&matches[0].size<=kib*1024,`${name} exceeded its separate ${kib} KiB budget`);return [name,matches[0].size];
}));
const contentTableModuleBytes=Object.fromEntries(Object.entries({'content-table':8,'content-table-compiler':5,'immutable-content':3}).map(([name,kib])=>{
  const matches=packed.files.filter(file=>file.path===`dist/${name}.js`);assert.equal(matches.length,1);assert(matches[0].size>0&&matches[0].size<=kib*1024,`${name} exceeded its separate ${kib} KiB budget`);return [name,matches[0].size];
}));
const cargoFiles=['dist/cargo-inspection.js','dist/cargo-display.js'].map(name=>packed.files.find(f=>f.path===name));
assert(cargoFiles.every(Boolean),'Missing cargo inspection module');
const cargoJsBytes=cargoFiles.reduce((sum,f)=>sum+f.size,0);
assert(cargoJsBytes<=24*1024,'Optional cargo inspection exceeded 24 KiB');
const inspectionFiles=['dist/inspection.js','dist/inspection-format.js'].map(name=>packed.files.find(f=>f.path===name));
assert(inspectionFiles.every(Boolean),'Missing item inspection module');
const inspectionJsBytes=inspectionFiles.reduce((sum,f)=>sum+f.size,0);
assert(inspectionJsBytes<=18*1024,'Optional inspection exceeded its separate 18 KiB budget');
const rackFile=packed.files.find(f=>f.path==='dist/skill-rack.js');
assert(rackFile&&rackFile.size<=6*1024,'Optional skill rack exceeded 6 KiB or is missing');
const barFile=packed.files.find(f=>f.path==='dist/skill-bar.js');
assert(barFile&&barFile.size>0&&barFile.size<=4*1024,'Optional skill bar exceeded 4 KiB or is missing');
const bookFile=packed.files.find(f=>f.path==='dist/workshop-skill-book.js');
assert(bookFile?.size>0&&bookFile.size<=6*1024,'Optional learned book exceeded 6 KiB or is missing');
const workshopFile=packed.files.find(f=>f.path==='dist/workshop-rack.js');
assert(workshopFile&&workshopFile.size<=6*1024,'Optional workshop rack exceeded 6 KiB or is missing');
const supportWorkshop=packed.files.find(f=>f.path==='dist/workshop-supports.js');
assert(supportWorkshop&&supportWorkshop.size<=5*1024,'Optional workshop support custody exceeds 5 KiB or is missing');
const pouchModule=packed.files.find(f=>f.path==='dist/pouch-recall.js');
const pouchData=packed.files.find(f=>f.path==='content/pouch-recall.json');
assert(pouchModule?.size>0&&pouchModule.size<=16*1024,'Optional pouch module exceeds 16 KiB or is missing');
assert(pouchData?.size>0&&pouchData.size<=320*1024,'Optional pouch content exceeds 320 KiB or is missing');
const conduitModule=packed.files.find(f=>f.path==='dist/conduits.js');
const conduitContent=packed.files.find(f=>f.path==='dist/conduit-content.js');
assert(conduitModule?.size>0 && conduitModule.size<=6*1024,'Optional conduit execution exceeded 6 KiB or is missing');
assert(conduitContent?.size>0 && conduitContent.size<=1024,'Shared conduit validation exceeded 1 KiB or is missing');
const conduitCatalogue=packed.files.find(f=>f.path==='dist/conduit-catalogue.js');
const conduitData=packed.files.find(f=>f.path==='content/conduits.json');
assert(conduitCatalogue?.size>0 && conduitCatalogue.size<=4*1024,'Optional conduit catalogue exceeded 4 KiB or is missing');
assert(conduitData?.size>0 && conduitData.size<=4*1024,'Conduit data exceeded 4 KiB or is missing');
const conduitJsBytes=conduitModule.size+conduitContent.size+conduitCatalogue.size;
const vestigeJsBytes=Object.entries({'vestige-content':4,'vestige-inlays':4,'vestige-rules':1,'workshop-vestiges':3}).reduce((sum,[name,kib])=>{
  const member=packed.files.find(f=>f.path==='dist/'+name+'.js');
  assert(member?.size>0 && member.size<=kib*1024,'Missing or oversized '+name);return sum+member.size;
},0);
const vestigeData=packed.files.find(f=>f.path==='content/vestiges.json');
assert(vestigeData?.size>0&&vestigeData.size<=8*1024,'Vestige catalogue exceeds 8 KiB or is missing');
const accountWorkshopFile=packed.files.find(file=>file.path==='dist/account-workshop-session.js');
// Durable character v2 extends the previously 25 KiB account owner.
// Its explicit allowance changes to 27 KiB; the predecessor/core and
// independent 180 KiB account-only bundled-consumer budgets remain unchanged.
assert.ok(accountWorkshopFile?.size>0&&accountWorkshopFile.size<=27*1024,'Optional account/workshop owner exceeds 27 KiB or is missing');
const accountWorkshopJsBytes=accountWorkshopFile.size;
const equipmentSkillsFile=packed.files.find(file=>file.path==='dist/equipment-skills.js');
// A separate optional capability; retain every predecessor's existing bound.
// Cold bar restoration adds 1,435 bytes to the previously qualified rebuild module.
assert(equipmentSkillsFile?.size>0&&equipmentSkillsFile.size<=11*1024,'Optional equipment skill derivation and lookup exceeds 11 KiB or is missing');
const equipmentSkillsJsBytes=equipmentSkillsFile.size;
const equipmentDraftFile=packed.files.find(file=>file.path==='dist/equipment-skill-draft.js');
assert(equipmentDraftFile?.size>0&&equipmentDraftFile.size<=8*1024,'Optional equipment preparation exceeds 8 KiB or is missing');
const workshopBuildFile=packed.files.find(file=>file.path==='dist/workshop-build-preparation.js');
const buildContributionsFile=packed.files.find(file=>file.path==='dist/build-contributions.js');
const workshopCharacterFile=packed.files.find(file=>file.path==='dist/workshop-character.js');
assert(workshopCharacterFile&&workshopCharacterFile.size<8*1024,'Workshop character admission exceeded the 8 KiB bound');
assert(buildContributionsFile&&buildContributionsFile.size<6*1024,'Build contributions exceeded the 6 KiB bound');
assert(workshopBuildFile?.size>0&&workshopBuildFile.size<=4*1024,'Optional workshop build preparation exceeds 4 KiB or is missing');
const contentTableJsBytes=Object.values(contentTableModuleBytes).reduce((sum,size)=>sum+size,0),preContentTableJsBytes=jsBytes-workshopCharacterFile.size-buildContributionsFile.size-workshopBuildFile.size-equipmentDraftFile.size-bookFile.size-barFile.size-equipmentSkillsJsBytes-accountWorkshopJsBytes-contentTableJsBytes-inspectionJsBytes-cargoJsBytes-rackFile.size-workshopFile.size-supportWorkshop.size-pouchModule.size-conduitJsBytes-vestigeJsBytes;
const craftingSessionJsBytes=Object.values(craftingSessionModuleBytes).reduce((sum,size)=>sum+size,0),preCraftingSessionJsBytes=preContentTableJsBytes-craftingSessionJsBytes;
const residenceJsBytes=Object.values(residenceModuleBytes).reduce((sum,size)=>sum+size,0),preResidenceJsBytes=preCraftingSessionJsBytes-residenceJsBytes;
const craftingJsBytes=Object.values(craftingModuleBytes).reduce((sum,size)=>sum+size,0),preCraftingJsBytes=preResidenceJsBytes-craftingJsBytes;
assert.ok(progressionSessionJsBytes > 0 && progressionSessionJsBytes <= 20 * 1024, 'Optional progression session exceeds its separate 20 KiB budget or is missing');
const preSessionJsBytes = preCraftingJsBytes - progressionSessionJsBytes;
const preUnlockJsBytes = preSessionJsBytes - unlockJsBytes;
const preGateJsBytes = preUnlockJsBytes - gateJsBytes;
const preContinuityJsBytes = preGateJsBytes - continuityJsBytes;
const preCharacterJsBytes = preContinuityJsBytes - characterJsBytes;
const preSiteJsBytes = preCharacterJsBytes - siteJsBytes;
const preVocationJsBytes = preSiteJsBytes - vocationJsBytes;
const preProcDeliveryJsBytes = preVocationJsBytes - procDeliveryJsBytes;
// Preserve every historical component budget. The optional delivery capability
// adds at most 5 KiB and remains outside the eager core graph.
const predecessorJsBytes = preProcDeliveryJsBytes - hitSustainJsBytes - hitReactionsJsBytes - hitAftermathJsBytes - statusDeliveryJsBytes - procCastingJsBytes;
const tagContextJsBytes = packed.files.filter(file => file.path === 'dist/tag-context-cache.js').reduce((sum,file)=>sum+file.size,0);
// The new cache has its own growth bound. Count it in the retained core and
// whole-package limits; historical component bounds exclude only this new file.
const previousJsBytes = predecessorJsBytes - tagContextJsBytes - hitLandingJsBytes - hitPreparationJsBytes - damageJsBytes - statusJsBytes - statusEffectsJsBytes - hitStatusJsBytes - hitEffectsJsBytes;
const coreJsBytes = previousJsBytes + tagContextJsBytes - itemJsBytes - passiveJsBytes - inventoryHostJsBytes - stashJsBytes - containerJsBytes - relicJsBytes - actionJsBytes - equipmentJsBytes - progressionJsBytes - skillJsBytes - supportJsBytes - resourceJsBytes - chargedCastJsBytes - interactiveCastJsBytes - ammunitionJsBytes - channelCastJsBytes - guardCastJsBytes - paymentJsBytes - admissionJsBytes - intentJsBytes - requestJsBytes - dispatchJsBytes - continuationJsBytes - bankJsBytes - actorGaugeJsBytes - actorConditionJsBytes - procJsBytes - procEffectJsBytes - delayedJsBytes - buffJsBytes - cooldownJsBytes - cooldownLifecycleJsBytes - readyBankJsBytes - sequenceRecoveryJsBytes - attackSequenceJsBytes;
const contentBytes = packed.files.filter(file => file.path.startsWith('content/') && file.path.endsWith('.json')).reduce((sum, file) => sum + file.size, 0);
assert.ok(coreJsBytes <= 96 * 1024, 'Core runtime exceeded the retained 96 KiB unminified JS budget');
assert.ok(hitSustainJsBytes > 0 && hitSustainJsBytes <= 4 * 1024, 'Optional hit sustain exceeded its separate 4 KiB budget or is missing');
assert.ok(hitReactionsJsBytes > 0 && hitReactionsJsBytes <= 8 * 1024, 'Optional hit reactions exceeded its separate 8 KiB budget or is missing');
assert.ok(hitAftermathJsBytes > 0 && hitAftermathJsBytes <= 22 * 1024, 'Optional hit aftermath exceeded its separate 22 KiB budget or is missing');
assert.ok(statusDeliveryJsBytes > 0 && statusDeliveryJsBytes <= 5 * 1024, 'Optional status delivery exceeded its separate 5 KiB budget or is missing');
assert.ok(tagContextJsBytes > 0 && tagContextJsBytes <= 3 * 1024, 'Stat context cache exceeded its separate 3 KiB budget or is missing');
assert.ok(itemJsBytes <= 64 * 1024, 'Optional item entry exceeded its 64 KiB unminified JS budget');
assert.ok(passiveJsBytes <= 32 * 1024, 'Optional passive entry exceeded its 32 KiB unminified JS budget');
assert.ok(inventoryHostJsBytes <= 16 * 1024, 'Optional inventory host exceeded its 16 KiB unminified JS budget');
assert.ok(stashJsBytes <= 16 * 1024, 'Optional storage policy exceeded its 16 KiB unminified JS budget');
assert.ok(containerJsBytes <= 32 * 1024, 'Optional container and seat rules exceeded their 32 KiB unminified JS budget');
assert.ok(relicJsBytes <= 16 * 1024, 'Optional relic custody exceeded its 16 KiB unminified JS budget');
assert.ok(actionJsBytes <= 16 * 1024, 'Optional relic actions exceeded their 16 KiB unminified JS budget');
assert.ok(equipmentJsBytes <= 16 * 1024, 'Optional equipment actions exceeded their 16 KiB unminified JS budget');
assert.ok(progressionJsBytes <= 12 * 1024, 'Optional progression exceeded its 12 KiB unminified JS budget');
assert.ok(skillJsBytes <= 48 * 1024, 'Optional skill graph, economy, grants and actions exceeded their 48 KiB unminified JS budget');
assert.ok(supportJsBytes <= 32 * 1024, 'Optional support rules, actions and validation exceeded their 32 KiB unminified JS budget');
assert.ok(resourceJsBytes <= 40 * 1024, 'Optional resources exceeded their 40 KiB unminified JS budget');
assert.ok(chargedCastJsBytes <= 12 * 1024, 'Optional charged casting exceeded its 12 KiB unminified JS budget');
assert.ok(interactiveCastJsBytes <= 8 * 1024, 'Optional interactive casting exceeded its 8 KiB unminified JS budget');
assert.ok(ammunitionJsBytes <= 12 * 1024, 'Optional ammunition exceeded its 12 KiB unminified JS budget');
assert.ok(channelCastJsBytes <= 16 * 1024, 'Optional channel casting exceeded its 16 KiB unminified JS budget');
assert.ok(guardCastJsBytes <= 12 * 1024, 'Optional guard casting exceeded its 12 KiB unminified JS budget');
assert.ok(paymentJsBytes <= 8 * 1024, 'Optional resource payment exceeded its 8 KiB unminified JS budget');
assert.ok(admissionJsBytes <= 12 * 1024, 'Optional skill admission exceeded its 12 KiB unminified JS budget');
assert.ok(requestJsBytes <= 8 * 1024, 'Optional request preflight exceeded its 8 KiB unminified JS budget');
assert.ok(dispatchJsBytes <= 24 * 1024, 'Optional complete dispatch exceeded its 24 KiB unminified JS budget');
assert.ok(continuationJsBytes <= 10 * 1024, 'Optional casting continuation exceeded its 10 KiB unminified JS budget');
assert.ok(bankJsBytes <= 3 * 1024, 'Optional channel banks exceeded their 3 KiB unminified JS budget');
assert.ok(actorGaugeJsBytes <= 5 * 1024, 'Optional actor gauges exceeded their 5 KiB unminified JS budget');
assert.ok(intentJsBytes <= 12 * 1024, 'Optional skill intent exceeded its 12 KiB unminified JS budget');
assert.ok(actorConditionJsBytes <= 8 * 1024, 'Optional actor conditions exceeded their 8 KiB unminified JS budget');
assert.ok(procJsBytes <= 24 * 1024, 'Optional proc dispatch exceeded its 24 KiB unminified JS budget');
assert.ok(procEffectJsBytes > 0 && procEffectJsBytes <= 4 * 1024, 'Optional magnitude/ward exceeded its 4 KiB unminified JS budget or is missing');
assert.ok(delayedJsBytes > 0 && delayedJsBytes <= 8 * 1024, 'Optional delayed bursts exceeded the 8 KiB unminified JS budget or are missing');
assert.ok(buffJsBytes > 0 && buffJsBytes <= 18 * 1024, 'Optional buff runtime and content compiler exceeded their 18 KiB unminified JS budget or are missing');
assert.ok(cooldownJsBytes > 0 && cooldownJsBytes <= 8 * 1024, 'Optional cooldown execution/content exceeded the prospective 8 KiB unminified JS budget or are missing');
assert.ok(previousJsBytes - buffJsBytes - cooldownJsBytes - cooldownLifecycleJsBytes - readyBankJsBytes - sequenceRecoveryJsBytes - attackSequenceJsBytes <= 500 * 1024, 'Existing runtime exceeded its retained 500 KiB unminified JS budget');
assert.ok(previousJsBytes - cooldownJsBytes - cooldownLifecycleJsBytes - readyBankJsBytes - sequenceRecoveryJsBytes - attackSequenceJsBytes <= 518 * 1024, 'Pre-cooldown runtime exceeded its retained 500 + 18 KiB unminified JS budget');
assert.ok(cooldownLifecycleJsBytes > 0 && cooldownLifecycleJsBytes <= 6 * 1024, "Cooldown lifecycle exceeded its prospective 6 KiB budget");
assert.ok(previousJsBytes - cooldownLifecycleJsBytes - readyBankJsBytes - sequenceRecoveryJsBytes - attackSequenceJsBytes <= 526 * 1024, 'Pre-lifecycle runtime exceeded the retained 500 + 18 + 8 KiB unminified JS budget');
assert.ok(previousJsBytes - readyBankJsBytes - sequenceRecoveryJsBytes - attackSequenceJsBytes <= 532 * 1024, 'Pre-bank runtime exceeded its retained 532 KiB unminified JS budget');
assert.ok(readyBankJsBytes > 0 && readyBankJsBytes <= 3 * 1024, 'Ready bank exceeded its separate 3 KiB budget');
assert.ok(previousJsBytes - sequenceRecoveryJsBytes - attackSequenceJsBytes <= 535 * 1024, 'Pre-sequence runtime exceeded its retained 535 KiB unminified JS budget');
assert.ok(sequenceRecoveryJsBytes > 0 && sequenceRecoveryJsBytes <= 4 * 1024, 'Sequence recovery exceeded its separate 4 KiB budget');
assert.ok(previousJsBytes - attackSequenceJsBytes <= 535 * 1024, 'Previous runtime exceeded its retained 535 KiB unminified JS budget');
assert.ok(attackSequenceJsBytes > 0 && attackSequenceJsBytes <= 32 * 1024, 'Optional attack-sequence controller/content exceeded its prospective 32 KiB budget');
assert.ok(previousJsBytes <= 567 * 1024, 'Combined runtime exceeded its explicit 535 + 32 KiB unminified JS budget');
// Initial measured output is 32,770 bytes including the generated type-only
// module. This new growth guard does not change any predecessor budget.
assert.ok(damageJsBytes > 0 && damageJsBytes <= 33 * 1024, 'Optional shared damage exceeded its separate 33 KiB budget');
assert.ok(predecessorJsBytes - hitLandingJsBytes - hitPreparationJsBytes - statusJsBytes - statusEffectsJsBytes - hitStatusJsBytes - hitEffectsJsBytes <= 600 * 1024, 'Previous runtime exceeded the retained 600 KiB budget');
assert.ok(statusJsBytes > 0 && statusJsBytes <= 16 * 1024, 'Optional statuses exceeded the separate 16 KiB budget');
assert.ok(predecessorJsBytes - hitLandingJsBytes - hitPreparationJsBytes - statusEffectsJsBytes - hitStatusJsBytes - hitEffectsJsBytes <= 616 * 1024, 'Previous runtime exceeded the retained 616 KiB budget');
assert.ok(statusEffectsJsBytes > 0 && statusEffectsJsBytes <= 16 * 1024, 'Optional status effects exceeded the separate 16 KiB budget');
assert.ok(predecessorJsBytes - hitLandingJsBytes - hitPreparationJsBytes - hitStatusJsBytes - hitEffectsJsBytes <= 632 * 1024, 'Previous runtime exceeded the retained 632 KiB budget');
assert.ok(hitStatusJsBytes > 0 && hitStatusJsBytes <= 16 * 1024, 'Optional hit/status policy exceeded the separate 16 KiB budget');
assert.ok(predecessorJsBytes - hitLandingJsBytes - hitPreparationJsBytes - hitEffectsJsBytes <= 648 * 1024, 'Previous runtime exceeded the retained 648 KiB budget');
assert.ok(hitEffectsJsBytes > 0 && hitEffectsJsBytes <= 10 * 1024, 'Optional hit-effect dispatch exceeded its separate 10 KiB budget');
assert.ok(predecessorJsBytes - hitLandingJsBytes - hitPreparationJsBytes <= 658 * 1024, 'Previous runtime exceeded the retained 658 KiB budget');
assert.ok(hitPreparationJsBytes > 0 && hitPreparationJsBytes <= 8 * 1024, 'Optional hit preparation exceeded its separate 8 KiB budget');
assert.ok(predecessorJsBytes - hitLandingJsBytes <= 666 * 1024, 'Previous runtime exceeded the retained 666 KiB budget');
assert.ok(hitLandingJsBytes > 0 && hitLandingJsBytes <= 8 * 1024, 'Optional hit landing exceeded its separate 8 KiB budget');
assert.ok(preProcDeliveryJsBytes - statusDeliveryJsBytes - procCastingJsBytes <= 674 * 1024, 'Previous runtime exceeded the retained 674 KiB budget');
assert.ok(preProcDeliveryJsBytes - procCastingJsBytes <= 679 * 1024, 'Previous runtime exceeded the retained 679 KiB budget');
assert.ok(procCastingJsBytes > 0 && procCastingJsBytes <= 4 * 1024, 'Optional proc casting exceeded its separate 4 KiB budget or is missing');
assert.ok(preProcDeliveryJsBytes <= 683 * 1024, 'Previous runtime exceeded the retained 683 KiB budget');
assert.ok(procDeliveryJsBytes > 0 && procDeliveryJsBytes <= 10 * 1024, 'Optional proc delivery exceeded its separate 10 KiB budget or is missing');
assert.ok(preVocationJsBytes <= 693 * 1024, 'Previous runtime exceeded the retained 693 KiB budget');
assert.ok(vocationJsBytes > 0 && vocationJsBytes <= 4 * 1024, 'Optional vocation runtime exceeded its separate 4 KiB budget or is missing');
assert.ok(preSiteJsBytes <= 697 * 1024, 'Previous runtime exceeded its retained 697 KiB budget');
assert.ok(siteJsBytes > 0 && siteJsBytes <= 6 * 1024, 'Optional site runtime exceeded its separate 6 KiB budget or is missing');
assert.ok(preCharacterJsBytes <= 703 * 1024, 'Previous runtime exceeded its retained 703 KiB budget');
assert.ok(characterJsBytes > 0 && characterJsBytes <= 7 * 1024, 'Optional character rules exceeded their separate 7 KiB budget');
assert.ok(preContinuityJsBytes <= 710 * 1024, 'Previous runtime exceeded its retained 710 KiB budget');
assert.ok(continuityJsBytes > 0 && continuityJsBytes <= 10 * 1024, 'Optional continuity runtime exceeded its separate 10 KiB budget');
assert.ok(preGateJsBytes <= 720 * 1024, 'Previous runtime exceeded its retained 720 KiB budget');
assert.ok(gateJsBytes > 0 && gateJsBytes <= 12 * 1024, 'Optional gate runtime and content exceeded their separate 12 KiB budget');
assert.ok(preUnlockJsBytes <= 732 * 1024, 'Previous runtime exceeded the retained 732 KiB budget');
assert.ok(preSessionJsBytes <= (732 + 70) * 1024, 'Previous runtime exceeded the retained 732 + 70 KiB budget');
assert.ok(preCraftingJsBytes <= (732 + 70 + 20) * 1024, 'Previous runtime exceeded its retained 732 + 70 + 20 KiB budget');
assert.ok(preCraftingSessionJsBytes <= (732 + 70 + 20 + 38) * 1024, 'Previous runtime exceeded the retained 732 + 70 + 20 + 38 KiB budget');
assert.ok(preContentTableJsBytes <= (732 + 70 + 20 + 38 + 44) * 1024, 'Combined runtime exceeded the explicit 904 KiB budget');
assert.ok(contentBytes-pouchData.size-conduitData.size-vestigeData.size <= 64 * 1024, 'First-slice content exceeded the 64 KiB JSON budget');
fs.writeFileSync(path.join(artifacts, 'package-verification.json'), JSON.stringify({
  equipmentSkillsJsBytes,
  equipmentDraftJsBytes:equipmentDraftFile.size,
  workshopBuildJsBytes:workshopBuildFile.size,
  buildContributionsJsBytes:buildContributionsFile.size,
  workshopCharacterJsBytes:workshopCharacterFile.size,
  skillBarJsBytes:barFile.size,
  workshopSkillBookJsBytes:bookFile.size,
  accountWorkshopJsBytes,contentTableModuleBytes,contentTableJsBytes,preContentTableJsBytes,craftingSessionModuleBytes,craftingSessionJsBytes,preCraftingSessionJsBytes,residenceModuleBytes,residenceJsBytes,preResidenceJsBytes,craftingModuleBytes,craftingJsBytes,preCraftingJsBytes,progressionSessionJsBytes, preSessionJsBytes, unlockModuleBytes, unlockJsBytes, preUnlockJsBytes, gateJsBytes, preGateJsBytes, continuityJsBytes, preContinuityJsBytes, characterJsBytes, preCharacterJsBytes, siteJsBytes, preSiteJsBytes, vocationJsBytes, preVocationJsBytes, procDeliveryJsBytes, preProcDeliveryJsBytes,
  cargoJsBytes, inspectionJsBytes, runtimeJsBytes: jsBytes, procCastingJsBytes, statusDeliveryJsBytes, hitAftermathJsBytes, hitSustainJsBytes, hitReactionsJsBytes, predecessorJsBytes, tagContextJsBytes, hitLandingJsBytes, hitPreparationJsBytes, previousJsBytes, damageJsBytes, statusJsBytes, statusEffectsJsBytes, hitStatusJsBytes, hitEffectsJsBytes, coreJsBytes, itemJsBytes, passiveJsBytes, inventoryHostJsBytes, stashJsBytes, containerJsBytes, relicJsBytes, actionJsBytes, equipmentJsBytes, progressionJsBytes, skillJsBytes, supportJsBytes, resourceJsBytes, chargedCastJsBytes, interactiveCastJsBytes, ammunitionJsBytes, channelCastJsBytes, guardCastJsBytes, paymentJsBytes, admissionJsBytes, intentJsBytes, requestJsBytes, dispatchJsBytes, continuationJsBytes, contentBytes, packageBytes: packed.size, unpackedBytes: packed.unpackedSize,
  bankJsBytes, actorGaugeJsBytes, actorConditionJsBytes, procJsBytes, procEffectJsBytes, delayedJsBytes, buffJsBytes, cooldownJsBytes, cooldownLifecycleJsBytes, readyBankJsBytes, sequenceRecoveryJsBytes, attackSequenceJsBytes, isolatedConsumer: JSON.parse(result), node: process.version,
}, null, 2) + '\n');
console.log(result.trim());
console.log(`Packaged runtime ${jsBytes} bytes JS; selected content ${contentBytes} bytes; archive ${packed.size} bytes.`);
