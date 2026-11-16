import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {transform} from 'esbuild';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {renderBodyFactory} from '../adapters/hollow-wake/integrate-body-factory.mjs';
import {renderBodyLevels} from '../adapters/hollow-wake/integrate-body-levels.mjs';
import {renderSummonBirth} from '../adapters/hollow-wake/integrate-summon-birth.mjs';
import {renderAuraActivation} from '../adapters/hollow-wake/integrate-aura-activation.mjs';
import {renderAuraRetirement} from '../adapters/hollow-wake/integrate-aura-retirement.mjs';
import {renderAuraLedgerWorld} from '../adapters/hollow-wake/integrate-aura-ledgers.mjs';
import {renderAuraTick} from '../adapters/hollow-wake/integrate-aura-ticking.mjs';

// Reuse the reviewed prototype bindings, then remove links supplied internally
// by createCombatHits. The authored runtime owns the remaining SDK controllers;
// these bindings are never supplied by a consuming game's host.
const groups = {
  damage: ['damage-pipeline', 'createDamagePipeline', ['onHit', 'onDot']],
  preparation: ['hitPreparation', 'createHitPreparation', ['roll', 'continue']],
  landing: ['hitLanding', 'createHitLanding', ['applyHit', 'continue', 'bindDeeds', 'recordSelfDamage', 'metaActive', 'deedEnemy', 'deedOwned', 'recordDeed', 'trackHurt', 'refreshMimic', 'captureMimic']],
  sustain: ['hitSustain', 'createHitSustain', []],
  reactions: ['hitReactions', 'createHitReactions', []],
  statuses: ['hitStatuses', 'createHitStatuses', ['mitigateTyped', 'landLifeDamage', 'statusIds']],
  effects: ['hitEffects', 'createHitEffects', ['status', 'absorbAmount', 'dormant']],
  aftermath: ['hitAftermath', 'createHitAftermath', ['dischargeStatuses', 'plantImpale', 'prepareStatuses', 'applyRiders', 'dispatchEffects', 'applyGrantedStatuses', 'resolveHit', 'resistance']],
  statusEffects: ['statusEffects', 'createStatusEffects', ['mitigateTyped', 'resistValue', 'recordIndirectDamage']],
  challenges: ['challenges', 'super', ['allocate', 'damageBands']],
  sequences: ['attack-sequences', 'super', []],
  guards: ['guardArts', 'record', ['spendAbsorb']],
  companions: ['companionBonds', 'super', ['stanceId', 'stance', 'setStance']],
  procDelivery: ['procDelivery', 'createProcDelivery', ['heal', 'restore', 'cooldown', 'ward', 'delayed', 'mitigate', 'summonCount']],
  procCasting: ['procCasting', 'createProcCasting', []],
  resourceEvents: ['resourceEventAdapter', 'ResourceEvents', ['elite']],
  statusDelivery: ['statusDelivery', 'createStatusDelivery', ['mitigateTyped']],
  bodies: ['renderBodyFactory', 'EngineBodyFactory', ['allocate', 'appearance', 'rollItem', 'skillLevel', 'xpScale']],
  levels: ['renderBodyLevels', 'EngineBodyLevels', []],
  summons: ['renderSummonBirth', 'EngineSummonBirth', ['reservation', 'accrueSummon']],
  offspring: ['renderSummonBirth', 'EngineSummonOffspring', []],
  inheritance: ['minionInheritance', 'MinionInheritanceResolver', []],
  bequests: ['bequests', 'AttributeBequests', ['registerStat']],
  auraActivation: ['renderAuraActivation', 'EngineAuraActivation', []],
  auraRetirement: ['renderAuraRetirement', 'EngineAuraRetirement', []],
  auraLedgers: ['renderAuraLedgerWorld', 'EngineAuraLedgers', []],
  auraTick: ['renderAuraTick', 'EngineAuraTick', ['convert', 'resistance']],
};
const renderers = {renderBodyFactory, renderBodyLevels, renderSummonBirth, renderAuraActivation, renderAuraRetirement, renderAuraLedgerWorld, renderAuraTick};
const rendererSources = {renderBodyFactory: 'integrate-body-factory', renderBodyLevels: 'integrate-body-levels', renderSummonBirth: 'integrate-summon-birth',
  renderAuraActivation: 'integrate-aura-activation', renderAuraRetirement: 'integrate-aura-retirement', renderAuraLedgerWorld: 'integrate-aura-ledgers', renderAuraTick: 'integrate-aura-ticking'};
const printer = ts.createPrinter({removeComments: true});
const pieces = [], imports = new Map(), sources = {};
const excluded = new Set(['WorldProcHitEvent', 'isStealthed', 'lowLifeFlashSeconds', 'resolveMinionInheritance', 'applyMinionPlyBonus', 'syncAttributeBequests']);
for (const [group, [file, factory, remove]] of Object.entries(groups)) {
  const sourcePath = renderers[file] ? '.reference/src/engine/world.ts' : 'adapters/hollow-wake/' + file + '.ts';
  const raw = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  sources[sourcePath] = sha256(raw);
  if (renderers[file]) {
    const rendererPath = 'adapters/hollow-wake/' + rendererSources[file] + '.mjs';
    sources[rendererPath] = sha256(fs.readFileSync(path.join(root, rendererPath)));
  }
  if (renderers[file]) assert.equal(sha256(raw), JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'))).files['src/engine/world.ts']);
  const source = renderers[file] ? renderers[file](raw, raw) : raw;
  const ast = ts.createSourceFile(file + '.ts', source, ts.ScriptTarget.Latest, true);
  const candidates = [];
  function find(node) {
    if (factory === 'record' && ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) candidates.push(node.expression);
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.expression.getText(ast) === factory && node.arguments?.[0] && ts.isObjectLiteralExpression(node.arguments[0])) candidates.push(node.arguments[0]);
    ts.forEachChild(node, find);
  }
  find(ast);
  assert.equal(candidates.length, 1, 'Unexpected binding: ' + file);
  const record = candidates[0];
  assert(ts.isObjectLiteralExpression(record), file);
  const kept = record.properties.filter(p => !remove.includes(p.name?.getText(ast)));
  const rewritten = ts.transform(ts.factory.updateObjectLiteralExpression(record, kept), [context => node => {
    function visit(n) {
      if (['this.zone.level', 'w.zone.level'].includes(n.getText(ast)))
        return ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'encounter'), 'level');
      if (n.kind === ts.SyntaxKind.ThisKeyword) return ts.factory.createIdentifier('w');
      if (ts.isCallExpression(n) && n.expression.getText(ast) === 'Math.random')
        return ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'random'), undefined, []);
      return ts.visitEachChild(n, visit, context);
    }
    return ts.visitNode(node, visit);
  }]);
  let text;
  try {text = printer.printNode(ts.EmitHint.Expression, rewritten.transformed[0], ast);}
  finally {rewritten.dispose();}
  const transformed = await transform('export const value = ' + text, {loader: 'ts', format: 'esm', target: 'es2022', legalComments: 'none'});
  const js = transformed.code.slice(transformed.code.indexOf('=') + 1, transformed.code.lastIndexOf('export')).trim().replace(/;$/, '');
  pieces.push(group + ': ' + js);
  const identifiers = new Set();
  const read = ts.createSourceFile('binding.js', js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = n => {if (ts.isIdentifier(n)) identifiers.add(n.text); ts.forEachChild(n, visit);};
  visit(read);
  for (const node of ast.statements.filter(ts.isImportDeclaration)) {
    if (node.importClause?.isTypeOnly || !node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)) continue;
    const specifier = node.moduleSpecifier.text;
    for (const item of node.importClause.namedBindings.elements) {
      if (item.isTypeOnly || !identifiers.has(item.name.text) || excluded.has(item.name.text)) continue;
      assert(!specifier.startsWith('@'), 'Internal controller leaked into query bindings');
      const value = {name: item.name.text, imported: (item.propertyName ?? item.name).text, source: specifier};
      if (imports.has(value.name)) assert.deepEqual(imports.get(value.name), value);
      else imports.set(value.name, value);
    }
  }
}
// RNG is a per-owner dependency, not a module singleton or replacement global.
for (const name of ['rand', 'randInt', 'chance', 'pick']) imports.delete(name);
for (const [source, names] of [
  ['./procCues', ['noteProcPop', 'tickProcCues']],
  ['./feedingCues', ['noteRestoreGain', 'tickRestoreGains']],
  ['../data/procs', ['PROC_LIST', 'PROC_RIDER_LIST']],
  ['./skills', ['treeNodeOf']],
  ['../data/skillTargetVisuals', ['skillTargetVoice', 'skillRiteVoice']],
  ['./bodyAction', ['markBodyAction']],
  ['./cling', ['clingBurrowed']],
  ['../data/monsters', ['factionStance', 'defLeavesRemains']],
  ['./bequests', ['ATTRIBUTE_BEQUESTS', 'ATTRIBUTE_BEQUEST_IDS']],
  ['./skills', ['CONSTRUCT_KIND_AIMS', 'ECHO_STRIKE_LIFE_MAX']],
  ['../data/looks', ['CONSTRUCT_LOOKS']],
  ['../data/skillPresenceVisuals', ['presenceProfile']],
  ['../data/conjury', ['CONJURE_RIDERS']],
  ['./clutch', ['CLUTCH_CFG', 'ORPHAN_FRENZY']],
  ['./presence', ['PRESENCE_BANDS']],
  ['./skills', ['TAME_CFG']],
  ['./encounterGroups', ['clearEncounterGroup']],
  ['../data/skillMovementVisuals', ['skillMovementVoice']],
  ['../data/skillSelfVisuals', ['skillSelfVoice']],
  ['./throng', ['isThrongBody']],
  ['./payloadCues', ['caromCapacity']],
  ['./bodyVoices', ['hitVoiceOf', 'skillBaseTypeOf']],
  ['./bodyVoices', ['deathVoiceOf']],
  ['./anatomyCues', ['anatomyFlash']],
  ['./weakpoints', ['takeWeakPointBreaks']],
  ['../data/transit', ['transitRadius', 'transitDwell', 'transitReach']],
  ['./lite', ['LitePool']],
  ['./gauges', ['DERIVED_GAUGES', 'GAUGE_CFG']],
  ['./actorGrid', ['ActorGrid']],
]) for (const name of names) imports.set(name, {name, imported: name, source});
const names = [...imports.keys()].sort();
const code = `// Generated by extract-combat-hit-bindings.mjs from reviewed SDK bindings.
// Internal assembler input: w owns all combat services; q is the compiled content.
import {inAoe} from '../../dist/combat-geometry.js';
export function combatHitBindings(w, q) {
  const {${names.join(', ')}} = q;
  const rand = (a, b) => a + w.random() * (b - a);
  const randInt = (a, b) => Math.floor(a + w.random() * (b + 1 - a));
  const chance = p => w.random() < p;
  const pick = values => values[Math.floor(w.random() * values.length)];
  const isStealthed = a => w.isStealthed(a);
  const resolveMinionInheritance = (...args) => w.minionInheritance.resolve(...args);
  const applyMinionPlyBonus = (...args) => w.applyMinionPlyBonus(...args);
  const syncAttributeBequests = (...args) => w.bequests.sync(...args);
  const lowLifeFlashSeconds = w.rules.lowLifeFlashSeconds;
  const MONSTER_LEVEL_SCALE = w.rules.monsterGrowth;
  class WorldProcHitEvent {
    constructor(packet, dealt, depth, crit, lethal, elite, tags, extra) {
      Object.assign(this, {packet, dealt, depth, crit, lethal, elite, tags, extra});
    }
    get dominantType() {return w.dominantType(this.packet.amounts);}
    get rollT() {return this.packet.rollT;}
  }
  const result = {${pieces.join(',\n')}};
  result.landing.refreshMimic = (actor, time) => w.mimic.refresh(actor, time);
  result.landing.captureMimic = (actor, source, definition) => w.mimic.capture(actor, source, definition, w.time);
  result.statuses.statusIds = () => w.statusIds;
  result.effects.absorbAmount = (actor, inst, base) => w.damage.skillAbsorbAmount(actor, inst, base);
  result.effects.dormant = actor => w.isDormant(actor);
  result.statusEffects.mitigateTyped = (...args) => w.damage.mitigateTyped(...args);
  result.statusEffects.resistValue = (...args) => w.damage.resistValue(...args);
  result.statusDelivery.mitigateTyped = (...args) => w.damage.mitigateTyped(...args);
  result.statusEffects.recordIndirectDamage = (...args) => w.observers.indirectDamage?.(...args);
  result.challenges.allocate = (name, team, pos) => w.allocateActor(name, team, pos);
  result.challenges.damageBands = (...args) => w.damage.skillDamageBands(...args);
  result.guards.spendAbsorb = (...args) => w.damage.spendAbsorbLayers(...args);
  result.companions.stanceId = (owner, inst) => w.stances.id(w.seatOf(owner) ?? w.seats.find(s => s.home === owner), inst.def.id);
  result.companions.stance = id => w.stances.definition(id);
  result.companions.setStance = (actor, id) => {actor.standingOrder = id ? w.stances.order(id) : undefined;};
  result.damage.onHit = (...args) => w.observers.hit?.(...args);
  result.damage.onDot = (...args) => w.observers.dot?.(...args);
  return result;
}
`;
const output = 'adapters/embedded/combat-hit-bindings.mjs';
const manifest = {schemaVersion: 1, sources, queries: [...imports.values()], outputs: {[output]: sha256(code)},
  changes: ['Connect inter-phase links inside createCombatHits', 'Optional campaign observer omitted',
    'Use per-owner random stream', 'Use shared SDK mimic and damage services',
    'Read host dormancy fact without importing the general AI module']};
if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(path.join(root, output), 'utf8'), code);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'baseline/combat-hit-bindings-extraction.json'))), manifest);
} else {
  if (process.argv.includes('--update-draft')) {
    const previous = JSON.parse(fs.readFileSync(path.join(root, 'baseline/combat-hit-bindings-extraction.json')));
    assert.equal(sha256(fs.readFileSync(path.join(root, output))), previous.outputs[output], 'Generated binding has other edits');
  } else assert(!fs.existsSync(path.join(root, output)), 'Refusing to overwrite generated combat hit bindings');
  fs.writeFileSync(path.join(root, output), code);
  writeJSON(path.join(root, 'baseline/combat-hit-bindings-extraction.json'), manifest);
}
console.log({passed: true, groups: Object.keys(groups).length, queries: names.length});
