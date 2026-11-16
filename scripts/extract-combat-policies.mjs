import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {transform} from 'esbuild';
import {root, sha256, writeJSON} from './reference-utils.mjs';

// Rules still owned by World's combat conductor after the reusable SDK
// controllers were extracted. No general World update, AI, quests or saving.
const methods = [
  'applyThorns', 'releasePrimedPours', 'bankPools', 'triggerEligible', 'rollTriggers',
  'bankStatusTriggers', 'bankDamageTakenTriggers', 'sweepDefenseEvents', 'recordCast',
  'paySkillCost', 'consumeChargeCost', 'consumeStealth', 'bankRune',
  'consumeAmmunition', 'consumeRemnants', 'rollKillRemnants',
  'victimGate', 'isEliteVictim', 'minionsOfSkill', 'minionsOfGroup', 'minionServes', 'companionsOfSkill',
  'tickChannelSupports', 'actorTurnRate', 'castTurnRate',
  'assaultBladeHit', 'healAlliesInArea',
  'enemiesOf', 'skillOcclusion', 'spawnAftershocks', 'castChrono',
  'isPrey', 'failNote',
  'forwardSummonSockets', 'bakeMinionOwnerStats', 'conjurationLifeline', 'armAmbush', 'applyPartyScale',
  'relayStatus', 'presenceMoment',
  'releaseStruckSummons', 'updateSummonReforms', 'clearSummonReleaseFields', 'clearTreeFields', 'clearTreeConstructs', 'accumulateDotText',
  'emergeBody', 'updateEmergences', 'showRecoveryCue', 'showCompanionCue',
  'attackSequenceBurst', 'challengeBurst', 'challengeHit', 'companionCapOf', 'companionPulseHit',
  'guardArtCooldown', 'guardArtHit', 'guardBash', 'inheritedFlight', 'retireOwnedZone', 'plantSpiritTotem', 'shedOrb',
  'pushActor',
  'springAmbush', 'reflectParriedProjectile', 'resolveParryDamage', 'tryGuardBlock', 'guardianFor', 'tryShellBlock', 'tryShellPool',
  'noteLightningTravel', 'carriedEffectContext',
  'movementMoment', 'affordedDest',
  'hivecallRoster', 'hivecallCap', 'hivecallPayload', 'hivecallDeath', 'hivecallTransform', 'hivecallReturn', 'hivecallMeta', 'syncHivecallFormDamage',
  'throngBodiesOf', 'throngRosterCount', 'throngCapOf', 'throngRecruitCap', 'throngGain', 'throngKeepMinimum', 'throngEvolutionHit', 'throngEvolutionBurst',
  'mintThrongBody', 'onPartBroken', 'ringBell', 'rollKillOrbs',
  'clingRelease', 'setLure', 'throngOnHit', 'throngOnKill', 'throngSources', 'throngYieldCount', 'mintThrongFind', 'mintThrongHusk',
  'liteKindOf', 'litePromoteNearest', 'promoteLite', 'liteNoteDeath', 'litePocketDisturb',
  'liteProjectileSweep', 'liteCarve', 'litePooledHit', 'liteBiteVictim', 'liteSteerAndBite', 'liteDemoteSweep',
  'minionNeedsFullDurability',
  'reqShortfall',
  'companionBondsOfSkill', 'updateThrongEvolution', 'updateThrong', 'updateClings',
  'claimThrongHusk', 'wornThrongAnchorsOf', 'wornThrongAnchored', 'driveUntamedThrong', 'throngMoteSpot',
  'noteMovementTravel', 'resolveImpactHit', 'sweepBodySlam',
  'updateHivecall', 'updateMinionMeta', 'updateReplenishment', 'updateLeaps', 'updateStrobes', 'updateVents', 'updateDischarges',
  'checkMinionDetonations', 'updateSummonShells', 'echoSympathy', 'sympathyPotency', 'applySympathyEcho',
  'updateOrbs', 'pourOrb', 'updateRemnants', 'pickupSeat', 'refundOnOrb',
  'updatePendingContagions',
  'grantedPocketsFor', 'insideGrantedPocket', 'inGrantedRefuge', 'syncPocketGrants', 'updateGrantedTrails',
  'updateDownedCompanions', 'seatIdle', 'updateCompanionGrants', 'updateWorms', 'updateParts', 'graftPart',
  'separateActors', 'updateSquish',
  'resyncMinionSupports', 'clearSummonTreeBodies', 'useMetaSkill',
];
const file = 'src/engine/world.ts';
const bytes = fs.readFileSync(path.join(root, '.reference', file));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
assert.equal(sha256(bytes), lock.files[file]);
const ast = ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true);
const world = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'World');
const selected = methods.map(name => {
  const m = world.members.find(m => (ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m)) && m.name.getText(ast) === name);
  assert(m, name); return m;
});
const printer = ts.createPrinter({removeComments: true});
let treeBuffRetirements = 0;
const transformed = ts.transform(selected, [context => rootNode => {
  function visit(node) {
    if (ts.isIfStatement(node) && node.expression.getText(ast) === 'this.devIgnoreSkillAttributes && !this.clientActionHook && seat === this.localSeat') return ts.factory.createEmptyStatement();
    if (node.getText(ast) === 'Math.random') return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'random');
    if (ts.isIfStatement(node) && node.expression.getText(ast) === 'v.dead && credit === this.player && this.deedEnemy(v)') {
      return ts.factory.createExpressionStatement(ts.factory.createCallChain(
        ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'observers'), 'pooledKill'),
        ts.factory.createToken(ts.SyntaxKind.QuestionDotToken), undefined,
        ['v', 'credit'].map(name => ts.factory.createIdentifier(name))));
    }
    if (ts.isIfStatement(node) && node.expression.getText(ast) === 'guardian === this.player && this.deedEnemy(attacker) && rawDamage > 0') {
      return ts.factory.createExpressionStatement(ts.factory.createCallChain(
        ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'observers'), 'guardBlocked'),
        ts.factory.createToken(ts.SyntaxKind.QuestionDotToken), undefined,
        ['guardian', 'attacker', 'rawDamage'].map(name => ts.factory.createIdentifier(name))));
    }
    if (node.getText(ast) === 'SIM_TAP.current') return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'observers');
    if (node.getText(ast) === 'this.zone.level') return ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'encounter'), 'level');
    if (ts.isForOfStatement(node) && node.expression.getText(ast) === 'this.actors' && node.getText(ast).includes('this.treeBuffSources.get')) {
      treeBuffRetirements++;
      return ts.factory.createExpressionStatement(ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'retireTreeBuffs'), undefined,
        [ts.factory.createIdentifier('caster'), ts.factory.createIdentifier('inst')]));
    }
    if (node.getText(ast) === 'this.seatOf(caster) === this.localSeat ? reliquaryPower(this.account.reliquary) : 0')
      return ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'relicPower'), undefined, [ts.factory.createIdentifier('caster')]);
    if (node.kind === ts.SyntaxKind.ThisKeyword) return ts.factory.createIdentifier('w');
    return ts.visitEachChild(node, visit, context);
  }
  return ts.visitNode(rootNode, visit);
}]);
let body;
try {body = transformed.transformed.map(node => printer.printNode(ts.EmitHint.Unspecified, node, ast)).join('\n');}
finally {transformed.dispose();}
assert.equal(treeBuffRetirements, 1, 'Expected one shared tree-buff retirement');
const js = (await transform('class Policies {\n' + body + '\n}', {loader: 'ts', target: 'es2022', legalComments: 'none'})).code
  .replaceAll('Math.random()', 'w.random()');
const statusReqs = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'statusReqs');
assert(statusReqs);
const stealth = ast.statements.filter(ts.isVariableStatement).flatMap(n => [...n.declarationList.declarations])
  .find(n => ts.isIdentifier(n.name) && n.name.text === 'STEALTH_CHARGE');
assert(stealth && ts.isStringLiteral(stealth.initializer));
const isStealthed = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'isStealthed');
assert(isStealthed);
const localQueries = (await transform(statusReqs.getText(ast) + '\nconst ' + stealth.getText(ast) + ';\n' + isStealthed.getText(ast), {loader: 'ts', target: 'es2022', legalComments: 'none'})).code;
const identifiers = new Set();
const inspect = ts.createSourceFile('policies.js', js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const visit = n => {if (ts.isIdentifier(n)) identifiers.add(n.text); ts.forEachChild(n, visit);};
visit(inspect);
visit(ts.createSourceFile('locals.js', localQueries, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
const queries = [];
for (const statement of ast.statements.filter(ts.isImportDeclaration)) {
  if (statement.importClause?.isTypeOnly || !statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
  for (const item of statement.importClause.namedBindings.elements) {
    if (item.isTypeOnly || !identifiers.has(item.name.text)) continue;
    queries.push({name: item.name.text, imported: (item.propertyName ?? item.name).text, source: statement.moduleSpecifier.text});
  }
}
const local = new Set(['rand', 'randInt', 'chance', 'pick', 'mitigateTyped', 'resistValue', 'applyHit', 'landLifeDamage', 'rollSkillDamage', 'skillAbsorbAmount', 'resolveMinionInheritance', 'applyMinionPlyBonus', 'syncAttributeBequests', 'companionCueFlash', 'companionCueSpec', 'isDormant']);
local.add('shellArcFactor');
local.add('cosmeticSkillPaint'); local.add('affordTravel');
local.add('summonReservationUnit');
local.add('issueCommand');
local.add('COMMAND_CFG');
const reads = queries.filter(r => !local.has(r.name));
const code = `// Generated combat conductor rules. w is the internal SDK owner.
import {bodySkillLevel as monsterSkillLevelOf} from '../../dist/body-levels.js';
import {inAoe} from '../../dist/combat-geometry.js';
export function createCombatPolicies(w, q) {
  const {${reads.map(r => r.name).join(', ')}} = q;
  const rand = (a, b) => a + w.random() * (b - a);
  const randInt = (a, b) => Math.floor(a + w.random() * (b + 1 - a));
  const chance = p => w.random() < p;
  const pick = values => values[Math.floor(w.random() * values.length)];
  const mitigateTyped = (...args) => w.damage.mitigateTyped(...args);
  const resistValue = (...args) => w.damage.resistValue(...args);
  const applyHit = (...args) => w.damage.applyHit(...args);
  const landLifeDamage = (...args) => w.damage.landLifeDamage(...args);
  const rollSkillDamage = (...args) => w.damage.rollSkillDamage(...args);
  const skillAbsorbAmount = (...args) => w.damage.skillAbsorbAmount(...args);
  const resolveMinionInheritance = (...args) => w.minionInheritance.resolve(...args);
  const applyMinionPlyBonus = (...args) => w.applyMinionPlyBonus(...args);
  const syncAttributeBequests = (...args) => w.bequests.sync(...args);
  const companionCueFlash = (...args) => w.companionCueFlash(...args);
  const companionCueSpec = (...args) => w.companionCueSpec(...args);
  const isDormant = actor => w.isDormant(actor);
  const shellArcFactor = (...args) => w.shellArcFactor(...args);
  const cosmeticSkillPaint = (_owner, actor, id) => w.host.presentation?.cosmetic?.(actor.id, id) ?? {};
  const affordTravel = (_owner, ...args) => w.host.space.travelHit(...args);
  const summonReservationUnit = (...args) => w.summonContracts.reservation(...args);
  const issueCommand = (...args) => w.issueCommand(...args);
  const PUSH_DAMPING = w.rules.pushDamping, PUSH_MAX_SPEED = w.rules.pushMaxSpeed;
  const XP_SCALE = w.rules.xpScale;
  const COMMAND_CFG = w.rules.commands;
  const TETHER_TICK = w.rules.tetherTick;
  const REVIVE_RADIUS = w.rules.partyRecovery.radius, REVIVE_DWELL = w.rules.partyRecovery.dwell;
  const DWELL_IDLE_GRACE = w.rules.partyRecovery.idleGrace;
  ${js}
  ${localQueries}
  w.statusReqs = statusReqs;
  w.isStealthed = isStealthed;
  return new Policies();
}
export const combatPolicyMethods = Object.freeze(${JSON.stringify(methods)});
`;
const output = 'adapters/embedded/combat-policies.mjs';
const manifest = {schemaVersion: 1, sourceCommit: lock.commit, source: file, sourceSha256: sha256(bytes),
  methods: Object.fromEntries(selected.map(m => [m.name.getText(ast), sha256(m.getText(ast))])),
  localQueries: {statusReqs: sha256(statusReqs.getText(ast)), STEALTH_CHARGE: sha256(stealth.getText(ast)), isStealthed: sha256(isStealthed.getText(ast))},
  queries: reads, outputs: {[output]: sha256(code)},
  changes: ['Bind combat conductor to one internal SDK owner', 'Use per-owner random stream and shared damage service',
    'Read reliquary power from the admitted character projection, without account access',
    'Reuse SDK inheritance and attribute bequests', 'Reuse the shared SDK tree-buff retirement ledger',
    'Route optional original simulation taps to per-owner observers', 'Read current combat encounter level without a world owner',
    'Report guard blocks through an optional observer without campaign deed evaluation']};
if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(path.join(root, output), 'utf8'), code);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'baseline/combat-policies-extraction.json'))), manifest);
} else {
  if (process.argv.includes('--update-draft')) {
    const previous = JSON.parse(fs.readFileSync(path.join(root, 'baseline/combat-policies-extraction.json')));
    assert.equal(sha256(fs.readFileSync(path.join(root, output))), previous.outputs[output], 'Generated policies have other edits');
  } else assert(!fs.existsSync(path.join(root, output)), 'Refusing to overwrite combat policies');
  fs.writeFileSync(path.join(root, output), code);
  writeJSON(path.join(root, 'baseline/combat-policies-extraction.json'), manifest);
}
console.log({passed: true, methods: methods.length, queries: reads.length});
