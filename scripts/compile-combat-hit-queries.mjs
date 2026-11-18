import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import ts from 'typescript';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {combatRegistryData, registryInitialization} from './combat-registry-data.mjs';

/** Compile the authored read rules used by the reviewed hit bindings. Runtime
 * output is standalone. Source hashes and ambient API checks are build gates. */
export async function buildCombatHitQueries(destination,profile) {
  const lockPath = path.join(root, 'baseline/source-lock.json');
  const baselineLock = JSON.parse(fs.readFileSync(lockPath));
  const lock = profile?.lock??baselineLock;
  const directory=profile?.directory??path.join(root,'.reference');
  const prefix=path.relative(root,directory).replaceAll('\\','/')+'/';
  const bindingPath = path.join(root, 'baseline/combat-hit-bindings-extraction.json');
  const bindings = JSON.parse(fs.readFileSync(bindingPath));
  const policyPath = path.join(root, 'baseline/combat-policies-extraction.json');
  const policies = JSON.parse(fs.readFileSync(policyPath));
  const castingPath = path.join(root, 'baseline/combat-casting-bindings-extraction.json');
  const casting = JSON.parse(fs.readFileSync(castingPath));
  const commandsPath = path.join(root, 'baseline/combat-command-controllers-extraction.json');
  const commands = JSON.parse(fs.readFileSync(commandsPath));
  const contractsPath = path.join(root, 'baseline/combat-port-contracts-extraction.json');
  const contracts = JSON.parse(fs.readFileSync(contractsPath));
  const phasesPath = path.join(root, 'baseline/combat-actor-phases-extraction.json');
  const phases = JSON.parse(fs.readFileSync(phasesPath));
  for (const [file, expected] of Object.entries(commands.sources)) assert.equal(expected, baselineLock.files[file]);
  assert.equal(policies.sourceSha256, baselineLock.files[policies.source]);
  assert.equal(phases.sourceSha256, baselineLock.files[phases.source]);
  for (const manifest of [bindings, policies, casting, commands, contracts, phases]) for (const [file, expected] of Object.entries(manifest.outputs)) {
    assert.equal(sha256(fs.readFileSync(path.join(root, file))), expected, 'Unreviewed generated combat binding: ' + file);
  }
  for (const [file, expected] of Object.entries({...bindings.sources, ...casting.sources, ...contracts.sources})) {
    assert.equal(sha256(fs.readFileSync(path.join(root, file))), expected, 'Unreviewed hit binding: ' + file);
  }
  const imports = new Map();
  const queries = new Map();
  const compatibility=profile?'function instanceStrikeTiming(inst){const rows=instanceStrikeTimings(inst);if(rows.length>1)throw Error("Combined strike timing requires the prototype timing controller");return rows[0];}\n':'';
  for (const name of ['ensureMovementTether','updateMovementTethers','refreshMovementTether','movementTetherLimit','movementTetherDistance'])
    queries.set(name, {name, imported:name, source:'./movementTether'});
  for (const name of ['nearestBody','bodyWhere','reachTo','segsHittable','segR','noteBodyHit'])
    queries.set(name,{name,imported:name,source:'./segments'});
  for (const row of [...bindings.queries, ...policies.queries, ...casting.queries, ...commands.queries, ...contracts.queries, ...phases.queries]) {
    if (queries.has(row.name)) assert.deepEqual(queries.get(row.name), row, 'Ambiguous combat rule: ' + row.name);
    else queries.set(row.name, row);
  }
  if(profile){
    const currentCommands=JSON.parse(fs.readFileSync(path.join(root,'baseline/prototype-parity/commands-extraction.json')));
    assert.equal(currentCommands.sourceCommit,profile.previous?.lock.commit??lock.commit);
    for(const [file,hash]of Object.entries(currentCommands.sources))assert.equal(hash,lock.files[file]);
    for(const [file,hash]of Object.entries(currentCommands.outputs))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
    for(const row of currentCommands.queries){
      if(queries.has(row.name))assert.deepEqual(queries.get(row.name),row,'Ambiguous prototype command rule: '+row.name);
      else queries.set(row.name,row);
    }
    const currentPolicies=JSON.parse(fs.readFileSync(path.join(root,'baseline/prototype-parity/policies-extraction.json')));
    assert.equal(currentPolicies.sourceCommit,profile.previous?.lock.commit??lock.commit);
    assert.equal(currentPolicies.sourceSha256,lock.files[currentPolicies.source]);
    for(const [file,hash]of Object.entries(currentPolicies.outputs))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
    for(const row of currentPolicies.queries){
      if(queries.has(row.name))assert.deepEqual(queries.get(row.name),row,'Ambiguous current combat rule: '+row.name);
      else queries.set(row.name,row);
    }
    const mechanics=JSON.parse(fs.readFileSync(path.join(root,'baseline/prototype-parity/mechanics-extraction.json')));
    assert.equal(mechanics.sourceCommit,profile.previous?.lock.commit??lock.commit);
    for(const [file,hash]of Object.entries(mechanics.sources))assert.equal(hash,lock.files[file]);
    for(const [file,hash]of Object.entries(mechanics.outputs))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
    for(const entry of mechanics.queries){
      const relative=path.posix.relative('src/engine',entry.source).replace(/\.ts$/,'');
      const row={...entry,source:relative.startsWith('.')?relative:'./'+relative};
      if(queries.has(row.name))assert.deepEqual(queries.get(row.name),row,'Ambiguous prototype rule: '+row.name);
      else queries.set(row.name,row);
    }
  }
  for (const row of queries.values()) {
    if(profile&&row.name==='instanceStrikeTiming')continue;
    const file = path.resolve(directory, 'src/engine', row.source + '.ts');
    const relative = path.relative(root, file).replaceAll('\\', '/');
    assert(relative.startsWith(prefix+'src/'), 'Hit query escaped source boundary');
    let rows = imports.get(relative);
    if (!rows) imports.set(relative, rows = []);
    rows.push(row.name === row.imported ? row.name : row.imported + ' as ' + row.name);
  }
  const registry = combatRegistryData(profile);
  const source = [...imports].map(([file, names]) => `import {${names.join(',')}} from './${file}';`).join('\n')
    + '\nconst registryData = ' + JSON.stringify(registry.registries) + ';\n' + registryInitialization([...queries.keys()])
    + '\n'+compatibility+'export const combatHitQueries = Object.freeze({' + [...queries.keys()].join(',') + '});';
  const result = await build({absWorkingDir: root, stdin: {contents: source, loader: 'js', resolveDir: root},
    bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', minify: true, write: false, metafile: true, tsconfigRaw: {}});
  const sources = {};
  for (const file of Object.keys(result.metafile.inputs)) {
    if (file === '<stdin>') continue;
    assert(file.startsWith(prefix+'src/'), 'Nonoriginal hit query dependency: ' + file);
    const hash = sha256(fs.readFileSync(path.join(root, file)));
    assert.equal(hash, lock.files[file.slice(prefix.length)], file);
    sources[profile?.previous?'prototype/'+lock.commit+'/'+file.slice(prefix.length):file]=hash;
  }
  for (const output of Object.values(result.metafile.outputs)) assert.equal(output.imports.length, 0);
  const code = result.outputFiles[0].text;
  const ast = ts.createSourceFile('hit-queries.mjs', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const forbidden = new Set(['globalThis', 'global', 'require', 'window', 'document', 'fetch', 'localStorage', 'performance', 'Date', 'process', 'eval', 'Function', 'setTimeout', 'requestAnimationFrame']);
  function check(node) {
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const key = (ts.isPropertyAssignment(p) || ts.isPropertyAccessExpression(p)) && p.name === node;
      if (!key) assert(!forbidden.has(node.text), 'Ambient API in hit queries: ' + node.text);
    }
    if (ts.isPropertyAccessExpression(node)) assert.notEqual(node.getText(ast), 'Math.random', 'Ambient random in hit queries: ' + code.slice(Math.max(0, node.pos - 140), node.end + 80));
    ts.forEachChild(node, check);
  }
  check(ast);
  const manifest = {schemaVersion: 1, sourceCommit: lock.commit, sourceLockSha256: sha256(profile?.lockBytes??fs.readFileSync(lockPath)), registrySha256: registry.sha256,
    bindingManifestSha256: sha256(fs.readFileSync(bindingPath)), policyManifestSha256: sha256(fs.readFileSync(policyPath)), castingManifestSha256: sha256(fs.readFileSync(castingPath)), commandManifestSha256: sha256(fs.readFileSync(commandsPath)), contractManifestSha256: sha256(fs.readFileSync(contractsPath)), actorPhasesManifestSha256: sha256(fs.readFileSync(phasesPath)), sources,
    files: {'hit-queries.mjs': {sha256: sha256(code), bytes: Buffer.byteLength(code)}}};
  fs.mkdirSync(destination, {recursive: true});
  fs.writeFileSync(path.join(destination, 'hit-queries.mjs'), code);
  writeJSON(path.join(destination, 'hit-queries-manifest.json'), manifest);
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert(process.argv.length === 4 && process.argv[2] === '--out', 'Use --out <new directory>');
  const destination = path.resolve(process.argv[3]);
  assert(!fs.existsSync(destination), 'Refusing to overwrite query output');
  console.log({directory: destination, ...(await buildCombatHitQueries(destination)).files});
}
