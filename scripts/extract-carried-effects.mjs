import fs from 'node:fs'; import assert from 'node:assert/strict'; import ts from 'typescript';
import {sha256} from './reference-utils.mjs';
const lock = JSON.parse(fs.readFileSync('baseline/source-lock.json')), sources = {};
const read = name => {
  const file = 'src/engine/' + name + '.ts', text = fs.readFileSync('.reference/' + file, 'utf8');
  sources[file] = sha256(text); assert.equal(sources[file], lock.files[file]);
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
};
const printer = ts.createPrinter({removeComments: true}), tables = [], statements = [], types = [];
for (const [module, root, family] of [['satelliteSpec', 'SATELLITE', 'satellites'], ['auroraSpec', 'AURORA', 'auroras'],
  ['guardianSpec', 'GUARDIAN', 'guardians'], ['creeperSpec', 'CREEPER', 'creepers']]) {
  const ast = read(module), registry = root === 'SATELLITE' ? 'SATELLITES' : root + 'S';
  tables.push(`const ${registry}=rules.${family}.definitions,${root}_IDS=rules.${family}.ids,${root}_CFG=rules.${family}.config;`);
  for (const n of ast.statements) {
    if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) types.push(printer.printNode(ts.EmitHint.Unspecified, n, ast));
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) {
      if (d.name.getText(ast).endsWith('Stat')) tables.push('const ' + printer.printNode(ts.EmitHint.Unspecified, d, ast) + ';');
    }
  }
}
const modules = ['satelliteFlights', 'satellites', 'auroras', 'guardians', 'creepers'];
for (const module of modules) {
  const ast = read(module);
  const rename = new Map(['alive', 'tau', 'Context'].map(name => [name, module + name]));
  const transform = context => {
    const visit = n => ts.isIdentifier(n) && rename.has(n.text) ? context.factory.createIdentifier(rename.get(n.text)) : ts.visitEachChild(n, visit, context);
    return n => ts.visitNode(n, visit);
  };
  for (const node of ast.statements) {
    if (ts.isImportDeclaration(node)) continue;
    if (ts.isInterfaceDeclaration(node) && node.name.text.endsWith('Visual')) {
      types.push(printer.printNode(ts.EmitHint.Unspecified, node, ast)); continue;
    }
    const result = ts.transform(node, [transform]);
    statements.push(printer.printNode(ts.EmitHint.Unspecified, result.transformed[0], ast).replace(/^export /, ''));
    result.dispose();
  }
}
const content = `// Pinned carried definitions and visual records. No mutable registry.\nimport type {CombatPoint as Vec2} from './combat-geometry.js';\ntype SkillTag=string;type OrbPaint=unknown;\n${types.join('\n')}\n`;
const body = `// Mechanically extracted carried combat controllers; see the source manifest.\n` +
  `import {pointSegDist} from './segment-geometry.js';import type {CombatPoint as Vec2} from './combat-geometry.js';\n` +
  `import type {SatelliteDef,SatelliteEmission,AuroraDef,GuardianDef,CreeperDef,SatelliteFlightVisual,SatelliteVisual,AuroraVisual,GuardianVisual,CreeperVisual} from './carried-effect-content.js';\n` +
  `import type {CarriedActor,CarriedRules,CarriedEffects,CarriedEffectContext as EffectContext} from './carried-effects-types.js';\nexport type * from './carried-effects-types.js';\n` +
  `export function createCarriedEffects<A extends CarriedActor<A>,I>(rules:CarriedRules):CarriedEffects<A,I>{\n` +
  `type Actor=A;type SkillInstance=I;type SkillTag=string;type CarriedEffectContext=EffectContext<A,I>;\n` +
  'const carriedAllegiance=(a:A):string=>`' + '${a.team}:${a.faction}:${a.owner?.id ?? \'\'}`;\n' +
  tables.join('\n') + '\n' + statements.join('\n') + '\n' +
  `return {satellites:new Satellites(),auroras:new Auroras(),guardians:new Guardians(),creepers:new Creepers()};\n}\n`;
const outputs = {'src/carried-effect-content.ts': content, 'src/carried-effects.ts': body};
if (process.argv.includes('--check')) {
  for (const [file, text] of Object.entries(outputs)) assert.equal(sha256(fs.readFileSync(file)), sha256(text), file);
  console.log({passed: true, controllers: modules});
} else {
  for (const file of Object.keys(outputs)) assert(!fs.existsSync(file), 'Refusing to overwrite ' + file);
  for (const [file, text] of Object.entries(outputs)) fs.writeFileSync(file, text);
  fs.writeFileSync('baseline/carried-effects-extraction.json', JSON.stringify({sourceCommit: lock.commit, sources,
    files: Object.fromEntries(Object.entries(outputs).map(([file, text]) => [file, sha256(text)])),
    changes: ['instance-owned registries', 'generic actor and skill identities', 'isolated closure names'], controllers: modules}, null, 2) + '\n');
}
