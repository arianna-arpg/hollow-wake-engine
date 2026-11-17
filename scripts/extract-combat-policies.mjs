import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {transform} from 'esbuild';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {readParitySource, parityDirectory} from './prototype-parity-tools.mjs';

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
  'movementLocked', 'castMoveFactor', 'channelMobility', 'moveActor', 'levitating', 'mountUnlink', 'mountWidowed',
];
const file = 'src/engine/world.ts';
const prototype=process.argv.includes('--prototype'), pinned=prototype?readParitySource():undefined;
const bytes = pinned?.files.get(file)??fs.readFileSync(path.join(root, '.reference', file));
const lock = pinned?.lock??JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
assert.equal(sha256(bytes), lock.files[file]);
const ast = ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true);
const world = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'World');
const changed=prototype?new Set(JSON.parse(fs.readFileSync(path.join(parityDirectory,'declarations.json'))).find(r=>r.file===file).declarations.map(r=>r.name.replace(/^World\./,''))):undefined;
const activeMethods=methods.filter(name=>!changed||changed.has(name));
const selected = activeMethods.map(name => {
  const m = world.members.find(m => (ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m)) && m.name.getText(ast) === name);
  assert(m, name); return m;
});
const printer = ts.createPrinter({removeComments: true});
let treeBuffRetirements = 0;
const transformed = ts.transform(selected, [context => rootNode => {
  function visit(node) {
    // Geography remains a host fact. Preserve the original combat mover and
    // replace only its region/boat/weather multipliers and development noclip.
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'regionScale')
      return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type,
        ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'walkScale'), undefined,
          [ts.factory.createIdentifier('a'), ts.factory.createBinaryExpression(ts.factory.createIdentifier('dx'), ts.SyntaxKind.SlashToken, ts.factory.createIdentifier('len')), ts.factory.createBinaryExpression(ts.factory.createIdentifier('dy'), ts.SyntaxKind.SlashToken, ts.factory.createIdentifier('len'))]));
    if (ts.isVariableDeclaration(node) && ['boatScale', 'windScale', 'snowScale'].includes(node.name.getText(ast)))
      return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, ts.factory.createNumericLiteral(1));
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === 'gale')) return ts.factory.createEmptyStatement();
    if (ts.isIfStatement(node) && node.expression.getText(ast) === 'gale') return ts.factory.createEmptyStatement();
    if (node.getText(ast) === '(this.devNoclip && a === this.player) || a.flying')
      return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('a'), 'flying');
    if (node.getText(ast) === '!this.sailing') return ts.factory.createTrue();
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
const displacement = ['NOCLIP_DISP','LEVITATE_DISP'].map(name => {
  const row=ast.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(ast)===name);
  assert(row,name);return row;
});
const localQueries = (await transform(statusReqs.getText(ast) + '\nconst ' + stealth.getText(ast) + ';\n' + isStealthed.getText(ast)
  + '\n' + displacement.map(row=>'const '+row.getText(ast)+';').join('\n'), {loader: 'ts', target: 'es2022', legalComments: 'none'})).code;
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
export const combatPolicyMethods = Object.freeze(${JSON.stringify(activeMethods)});
`;
const output = prototype?'adapters/embedded/combat-prototype-policies.mjs':'adapters/embedded/combat-policies.mjs';
const manifestPath=prototype?path.join(parityDirectory,'policies-extraction.json'):path.join(root,'baseline/combat-policies-extraction.json');
const manifest = {schemaVersion: 1, sourceCommit: lock.commit, source: file, sourceSha256: sha256(bytes),
  methods: Object.fromEntries(selected.map(m => [m.name.getText(ast), sha256(m.getText(ast))])),
  localQueries: {statusReqs: sha256(statusReqs.getText(ast)), STEALTH_CHARGE: sha256(stealth.getText(ast)), isStealthed: sha256(isStealthed.getText(ast)),
    ...Object.fromEntries(displacement.map(row=>[row.name.getText(ast),sha256(row.getText(ast))]))},
  queries: reads, outputs: {[output]: sha256(code)},
  changes: ['Bind combat conductor to one internal SDK owner', 'Use per-owner random stream and shared damage service',
    'Read reliquary power from the admitted character projection, without account access',
    'Reuse SDK inheritance and attribute bequests', 'Reuse the shared SDK tree-buff retirement ledger',
    'Route optional original simulation taps to per-owner observers', 'Read current combat encounter level without a world owner',
    'Report guard blocks through an optional observer without campaign deed evaluation',
    'Preserve ordinary combat locomotion; accept region/boat/weather speed as a host fact without importing geography or development noclip']};
if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(path.join(root, output), 'utf8'), code);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath)), manifest);
} else {
  if (process.argv.includes('--update-draft')) {
    const previous = JSON.parse(fs.readFileSync(manifestPath));
    assert.equal(sha256(fs.readFileSync(path.join(root, output))), previous.outputs[output], 'Generated policies have other edits');
  } else assert(!fs.existsSync(path.join(root, output)), 'Refusing to overwrite combat policies');
  fs.writeFileSync(path.join(root, output), code);
  writeJSON(manifestPath, manifest);
}
console.log({passed: true, methods: activeMethods.length, queries: reads.length});
