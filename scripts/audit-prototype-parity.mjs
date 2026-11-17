import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {parityDirectory, readParitySource, sourceDifference} from './prototype-parity-tools.mjs';

const {lock, files} = readParitySource();
const previousBytes = fs.readFileSync(path.join(root, 'baseline/source-lock.json'));
assert.equal(sha256(previousBytes), lock.previous.sha256);
const previous = JSON.parse(previousBytes), auditPath = path.join(parityDirectory, 'audit.json');
const audit = JSON.parse(fs.readFileSync(auditPath));
assert.deepEqual(audit.changes.map(({file, change, beforeSha256, afterSha256, bytes}) => ({file, change, beforeSha256, afterSha256, bytes})), sourceDifference(previous.files, files));
const hostFiles = new Set([
  'core/rng', 'data/aiIntent', 'data/adventureForms', 'data/adventureRegions', 'data/biomeDecoration', 'data/bountyboard', 'data/codex',
  'data/menu', 'data/scenes', 'data/structures', 'data/tilesets', 'data/tutorialObjectives', 'data/zones',
  'engine/altarBodies', 'engine/biomeDecoration', 'engine/chestInteraction', 'engine/codexSightings', 'engine/creep',
  'engine/doodadMovement', 'engine/doodadNavigation', 'engine/encounterCombat', 'engine/genkit', 'engine/interiorGen',
  'engine/landmarkComplexGen', 'engine/layoutRecipes', 'engine/levelgen', 'engine/lite', 'engine/localeGen',
  'engine/movementDiagnostics', 'engine/nativeRecipeGround', 'engine/nativeStructureProof', 'engine/npcDialogues',
  'engine/puzzles', 'engine/tap', 'engine/tells', 'engine/watchGaze', 'engine/worldgen',
  'meta/codex', 'meta/death', 'meta/persistence', 'meta/settings', 'meta/worldstate',
]);
const mixedFiles = new Set(['engine/actor', 'engine/world', 'engine/ai', 'engine/aiActions', 'engine/brain', 'engine/companionStances',
  'engine/accountReliquary', 'meta/character', 'meta/reliquary', 'meta/unlocks', 'net/intent', 'net/snapshot', 'net/couch', 'quests/vocations']);
const uiBuild = new Set(['containerPane', 'panels', 'reliquary', 'stash', 'storedSupports', 'tooltip']);
function classify(file) {
  if (file.startsWith('balance/') || file.startsWith('src/sim/')) return {lane: 'verification', reason: 'Source behavior checks, observations and simulation tooling; select relevant courses without importing the game host.'};
  if (!file.startsWith('src/')) return {lane: 'tooling', reason: 'Prototype build, launcher, authoring or documentation; not SDK runtime.'};
  const short = file.slice(4).replace(/\.ts$/, '');
  if (mixedFiles.has(short)) return {lane: 'mixed', reason: 'Review combat/build declarations separately; leave account, persistence, navigation and general AI orchestration with the host.'};
  if (hostFiles.has(short) || /^(dev|loading|showcase|world)\//.test(short) || short === 'main') return {lane: 'host', reason: 'Generation, campaign, general AI, rendering, diagnostics or application lifecycle; preserve outside the required SDK.'};
  if (/^render\//.test(short)) return {lane: 'presentation', reason: 'Renderer implementation stays in the consuming game; preserve semantic cues and identifiers in SDK state.'};
  if (/^ui\//.test(short)) return {lane: uiBuild.has(short.slice(3)) ? 'mixed-ui' : 'presentation', reason: uiBuild.has(short.slice(3))
    ? 'Inventory rules and actions require SDK support; DOM layout, artwork and styling remain client-owned.' : 'Client layout, artwork, menus and interactions; no renderer transplant into the SDK.'};
  if (/^data\//.test(short) && /(Visuals|Looks|Glyphs|Cues|glyphParts|looks)$/.test(short)) return {lane: 'presentation-data', reason: 'Portable semantic presentation definitions; client decides rendering, SDK supplies accurate effect state.'};
  assert(/^(data|engine)\//.test(short), 'Unclassified source area: ' + file);
  return {lane: 'required', reason: 'Combat, skill, build, authored encounter or Inventory rule; must be ported or shown equivalent.'};
}
const changes = audit.changes.map(row => ({...row, ...classify(row.file)}));
const printer = ts.createPrinter({removeComments: true});
function declarations(file, bytes) {
  if (!bytes) return new Map();
  const source = ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true), rows = new Map();
  const record = (name, node) => rows.set(name, {kind: ts.SyntaxKind[node.kind], sha256: sha256(printer.printNode(ts.EmitHint.Unspecified, node, source)), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1});
  for (const node of source.statements) {
    if (ts.isClassDeclaration(node)) for (const member of node.members) record(node.name.text + '.' + (ts.isConstructorDeclaration(member) ? 'constructor' : member.name?.getText(source)), member);
    else if (ts.isVariableStatement(node)) for (const variable of node.declarationList.declarations) record(variable.name.getText(source), variable);
    else if (node.name) record(node.name.getText(source), node);
  }
  return rows;
}
const declarationChanges = changes.filter(r => /\.ts$/.test(r.file) && ['required', 'mixed', 'mixed-ui'].includes(r.lane)).map(row => {
  const beforeFile = path.join(root, '.reference', row.file), beforeBytes = previous.files[row.file] ? fs.readFileSync(beforeFile) : undefined;
  if (beforeBytes) assert.equal(sha256(beforeBytes), previous.files[row.file]);
  const before = declarations(row.file, beforeBytes), after = declarations(row.file, files.get(row.file));
  return {file: row.file, lane: row.lane, declarations: [...new Set([...before.keys(), ...after.keys()])].filter(name => before.get(name)?.sha256 !== after.get(name)?.sha256)
    .map(name => ({name, before: before.get(name) ?? null, after: after.get(name) ?? null, disposition: 'review-required'}))};
});
const counts = Object.fromEntries(Object.entries(Object.groupBy(changes, row => row.lane)).map(([key, rows]) => [key, rows.length]));
const result = {...audit, status: 'file-scope-classified; declaration review and release qualification are separate', counts, changes};
if (process.argv.includes('--check')) {
  assert.deepEqual(audit, result);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(parityDirectory, 'declarations.json'))), declarationChanges);
} else {
  writeJSON(auditPath, result); writeJSON(path.join(parityDirectory, 'declarations.json'), declarationChanges);
}
console.log(JSON.stringify({source: lock.commit, changedFiles: changes.length, counts,
  inventoriedDeclarations: declarationChanges.reduce((n, row) => n + row.declarations.length, 0),
  reviewLedger:'baseline/prototype-parity/boundary-review.json'}));
