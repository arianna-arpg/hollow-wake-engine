import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {readCatalogue} from './catalogue-tools.mjs';
import {buildCombatQueries} from './compile-combat-queries.mjs';
import {buildCombatHitQueries} from './compile-combat-hit-queries.mjs';
import {buildCombatActorState} from './compile-combat-actor-state.mjs';
import {combatStaticRules} from './compile-combat-static-rules.mjs';
import {itemPack} from './compile-item-content.mjs';
import {acceptedCombatData} from './combat-registry-data.mjs';
import {characterBuildPack} from './compile-character-builds.mjs';
import {prototypeBuildPack} from './prototype-content.mjs';

/** One standalone authored module. Original source and compiler scratch remain
 * build-time inputs, never requirements of an installed combat consumer. */
export async function buildCombatContent(destination,profile) {
  assert(!fs.existsSync(destination), 'Refusing to overwrite combat content');
  const parent = fs.realpathSync(path.join(root, '.artifacts'));
  const work = fs.mkdtempSync(path.join(parent, 'm3-combat-content-owned-'));
  try {
    const skills = await buildCombatQueries(path.join(work, 'skills'),profile);
    const hits = await buildCombatHitQueries(path.join(work, 'hits'),profile);
    const actors = buildCombatActorState(path.join(work, 'actors'),profile);
    const literal = combatStaticRules(profile);
    const catalogue = profile?.catalogue??readCatalogue();
    const table = name => Object.fromEntries(catalogue.tables[name].map(row => [row.id, row.value]));
    const builds=profile?prototypeBuildPack(characterBuildPack(),profile):characterBuildPack();
    const statistics = {characterBuildId: builds.contentId, stats: table('stats'), statTrades: table('rules').statTrades, items: itemPack(), carried: profile?.runtime.carried??acceptedCombatData('carried-effects').rules,
      ...(profile?{prototypeMechanics:true}:{})};
    const source = `
      import {combatSkillQueries, combatActorRules} from './skills/queries.mjs';
      import {combatHitQueries} from './hits/hit-queries.mjs';
      import {initializeCombatActor, combatActorTiming} from './actors/actor-state.mjs';
      const staticRules = ${JSON.stringify(literal.rules)};
      const statistics = ${JSON.stringify(statistics)};
      function freezeData(value, seen = new Set()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value);
        for (const child of Object.values(value)) freezeData(child, seen);
        return Object.freeze(value);
      }
      freezeData(staticRules); freezeData(statistics);
      // Read-only rule/definition objects are shared by sessions; transient
      // actor, casting, status, charge and controller state is created per owner.
      freezeData(combatHitQueries); freezeData(combatSkillQueries); freezeData(combatActorRules);
      export const combatContent = Object.freeze({
        capability: 'combat-content/v1', sourceCommit: ${JSON.stringify(literal.sourceCommit)},
        queries: combatSkillQueries, hitQueries: combatHitQueries, actorRules: combatActorRules,
        actorTiming: combatActorTiming, initializeActor: initializeCombatActor,
        staticRules, ...statistics,
      });
    `;
    const compiled = await build({absWorkingDir: root, stdin: {contents: source, loader: 'js', resolveDir: work},
      bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', minify: true,
      write: false, metafile: true, logLevel: 'silent'});
    for (const output of Object.values(compiled.metafile.outputs)) assert.equal(output.imports.length, 0);
    const code = compiled.outputFiles[0].text;
    const manifest = {schemaVersion: 1, capability: 'combat-content/v1', sourceCommit: literal.sourceCommit,
      inputs: {skills, hits, actors, literal, statisticsSha256: sha256(JSON.stringify(statistics))},
      files: {'content.mjs': {sha256: sha256(code), bytes: Buffer.byteLength(code)}}};
    fs.mkdirSync(destination, {recursive: true});
    fs.writeFileSync(path.join(destination, 'content.mjs'), code);
    writeJSON(path.join(destination, 'manifest.json'), manifest);
    return manifest;
  } finally {
    assert.equal(path.dirname(fs.realpathSync(work)), parent);
    fs.rmSync(work, {recursive: true, maxRetries: 3});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert(process.argv.length === 4 && process.argv[2] === '--out');
  const destination = path.resolve(process.argv[3]);
  console.log({directory: destination, ...(await buildCombatContent(destination)).files});
}
