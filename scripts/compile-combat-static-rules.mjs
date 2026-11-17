import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';
import {root, sha256, writeJSON} from './reference-utils.mjs';

/** Read selected literal rules without loading a World, AI, account or campaign
 * module. A new executable expression is an explicit compiler refusal. */
export function combatStaticRules(profile) {
  const lock = profile?.lock ?? JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
  const directory = profile?.directory ?? path.join(root, '.reference');
  const sources = {};
  function constant(file, name, property) {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    sources[file] = sha256(source); assert.equal(sources[file], lock.files[file], file);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const variables = new Map();
    for (const s of ast.statements) if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) {
      if (ts.isIdentifier(d.name)) variables.set(d.name.text, d.initializer);
    }
    const active = new Set();
    function value(n) {
      assert(n, 'Missing literal: ' + file + ':' + name);
      if (ts.isAsExpression(n) || ts.isParenthesizedExpression(n)) return value(n.expression);
      if (ts.isNumericLiteral(n)) return Number(n.text);
      if (ts.isStringLiteral(n)) return n.text;
      if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (n.kind === ts.SyntaxKind.NullKeyword) return null;
      if (ts.isArrayLiteralExpression(n)) return n.elements.map(value);
      if (ts.isObjectLiteralExpression(n)) return Object.fromEntries(n.properties.map(p => {
        assert(ts.isPropertyAssignment(p), 'Nonliteral rule property');
        assert(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name));
        return [p.name.text, value(p.initializer)];
      }));
      if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken) return -value(n.operand);
      if (ts.isNewExpression(n) && n.expression.getText(ast) === 'Set' && n.arguments?.length === 1) return value(n.arguments[0]);
      if (ts.isIdentifier(n) && variables.has(n.text) && !active.has(n.text)) {
        active.add(n.text); const result = value(variables.get(n.text)); active.delete(n.text); return result;
      }
      throw Error('Nonliteral combat rule: ' + file + ':' + n.getText(ast).slice(0, 100));
    }
    let node = variables.get(name);
    if (property) {
      while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression;
      assert(node && ts.isObjectLiteralExpression(node), 'Expected literal rule record');
      node = node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(ast) === property)?.initializer;
    }
    return value(node);
  }
  const rules = {
    mimic: constant('src/engine/mimic.ts', 'MIMIC_CFG'),
    stances: constant('src/engine/companionStances.ts', 'COMPANION_STANCE_CFG'),
    companionStances: constant('src/data/companionStances.ts', 'COMPANION_STANCES'),
    dormantTags: constant('src/engine/ai.ts', 'DORMANT_TAGS'),
    lowLifeFlashSeconds: constant('src/engine/world.ts', 'LOW_LIFE_FLASH_SEC'),
    monsterGrowth: constant('src/engine/world.ts', 'MONSTER_LEVEL_SCALE'),
    xpScale: constant('src/engine/world.ts', 'XP_SCALE'),
    mercenaryPartyWeight: constant('src/meta/mercs.ts', 'MERC_CFG', 'partyScaleWeight'),
    partyRecovery: {
      mercsCanRevive: constant('src/meta/mercs.ts', 'MERC_CFG', 'mercsCanRevive'),
      radius: constant('src/engine/world.ts', 'REVIVE_RADIUS'),
      dwell: constant('src/engine/world.ts', 'REVIVE_DWELL'),
      lifeFraction: constant('src/engine/world.ts', 'REVIVE_LIFE_FRAC'),
      idleGrace: constant('src/engine/world.ts', 'DWELL_IDLE_GRACE'),
    },
    corpses: constant('src/engine/world.ts', 'CORPSE_CFG'),
    cosmetics: constant('src/data/cosmetics.ts', 'COSMETIC_CFG'),
    conjure: constant('src/engine/flux.ts', 'CONJURE_CFG'),
    forwarding: constant('src/engine/skills.ts', 'CONSTRUCT_FORWARD_CFG'),
    unleash: constant('src/engine/skills.ts', 'UNLEASH_CFG'),
    elements: constant('src/engine/stats.ts', 'ELEMENTAL_TYPES'),
    madden: constant('src/engine/world.ts', 'MADDEN_CFG'),
    pushDamping: constant('src/engine/world.ts', 'PUSH_DAMPING'),
    pushMaxSpeed: constant('src/engine/world.ts', 'PUSH_MAX_SPEED'),
    tetherTick: constant('src/engine/world.ts', 'TETHER_TICK'),
    grab: {...constant('src/engine/grab.ts', 'GRAB_CFG'), markers: constant('src/engine/grab.ts', 'GRAB_MARKER'),
      labels: constant('src/engine/grab.ts', 'GRAB_VERB_LABEL'), physicalColor: constant('src/engine/stats.ts', 'DAMAGE_COLOR', 'physical')},
    possession: constant('src/engine/possess.ts', 'POSSESS_CFG'),
    commands: constant('src/engine/ai.ts', 'COMMAND_CFG'),
    throng: constant('src/engine/throng.ts', 'THRONG_CFG'),
    lite: constant('src/engine/lite.ts', 'LITE_CFG'),
    projectiles: {
      childDepthMax: constant('src/engine/world.ts', 'PROJ_CHILD_DEPTH_MAX'),
      auraTick: constant('src/engine/world.ts', 'PROJ_AURA_TICK'),
      shrapnelSkill: constant('src/engine/world.ts', 'SHRAPNEL_SKILL'),
      catchSpotLook: constant('src/data/looks.ts', 'CATCH_SPOT_LOOK'),
      headSegment: constant('src/engine/segments.ts', 'SEG_CFG', 'HEAD'),
      frameEdgePad: constant('src/engine/fourthwall.ts', 'FOURTH_WALL_CFG', 'proj').edgePad,
      frameFlashPad: constant('src/engine/fourthwall.ts', 'FOURTH_WALL_CFG', 'proj').flashPad,
      sequelMaxDepth: constant('src/engine/skills.ts', 'SEQUEL_CFG', 'maxDepth'),
      elementColors: constant('src/engine/stats.ts', 'DAMAGE_COLOR'),
    },
  };
  const ai = ts.createSourceFile('ai.ts', fs.readFileSync(path.join(directory, 'src/engine/ai.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  rules.commandKinds = ai.statements.filter(ts.isExpressionStatement).map(n => n.expression)
    .filter(n => ts.isCallExpression(n) && n.expression.getText(ai) === 'registerCommandKind')
    .map(n => {
      const record = n.arguments[0]; assert(ts.isObjectLiteralExpression(record));
      const id = record.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(ai) === 'id')?.initializer;
      assert(id && ts.isStringLiteral(id), 'Nonliteral built-in command identity'); return id.text;
    });
  assert(rules.commandKinds.length > 0);
  rules.commandKinds.push(...Object.values(rules.companionStances).map(row => rules.stances.kindPrefix + row.id));
  return {schemaVersion: 1, sourceCommit: lock.commit, sources, rules};
}
export function buildCombatStaticRules(destination) {
  const data = combatStaticRules();
  fs.mkdirSync(destination, {recursive: true});
  writeJSON(path.join(destination, 'static-rules.json'), data.rules);
  const bytes = fs.readFileSync(path.join(destination, 'static-rules.json'));
  const manifest = {...data, rules: undefined, files: {'static-rules.json': {bytes: bytes.length, sha256: sha256(bytes)}}};
  writeJSON(path.join(destination, 'static-rules-manifest.json'), manifest);
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert(process.argv.length === 4 && process.argv[2] === '--out');
  const destination = path.resolve(process.argv[3]);
  assert(!fs.existsSync(destination), 'Refusing to overwrite combat static rules');
  console.log(buildCombatStaticRules(destination).files);
}
