import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256, writeJSON} from './reference-utils.mjs';

// The checked interfaces are also the assembly checklist. Inherited methods
// (including Pick<> contracts) must not disappear when a service is connected.
const interfaces = {
  preparation: ['src/cast-preparation-types.ts', 'PreparationPorts'],
  aftermath: ['src/cast-aftermath-types.ts', 'AftermathPorts'],
  area: ['src/area-delivery-types.ts', 'AreaDeliveryPorts'],
  fields: ['src/field-delivery-types.ts', 'FieldDeliveryPorts'],
  fieldAftermath: ['src/field-aftermath-types.ts', 'AftermathFieldPorts'],
  direct: ['src/direct-deliveries.ts', 'DirectPorts'],
  constructLifecycle: ['src/construct-lifecycle-types.ts', 'ConstructLifecyclePorts'],
  fieldSimulation: ['src/field-simulation-types.ts', 'FieldSimulationPorts'],
  projectiles: ['src/projectile-types.ts', 'ProjectilePorts'],
};
const program = ts.createProgram([...new Set(Object.values(interfaces).map(([file]) => path.join(root, file)))], {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true, noEmit: true,
});
const checker = program.getTypeChecker(), contracts = {}, sources = {};
for (const [name, [file, declaration]] of Object.entries(interfaces)) {
  const ast = program.getSourceFile(path.join(root, file)); assert(ast, file);
  const node = ast.statements.find(n => ts.isInterfaceDeclaration(n) && n.name.text === declaration); assert(node, declaration);
  const type = checker.getTypeAtLocation(node);
  contracts[name] = checker.getPropertiesOfType(type).map(p => {
    const member = checker.getTypeOfSymbolAtLocation(p, node);
    assert(checker.getSignaturesOfType(member, ts.SignatureKind.Call).length, 'Noncallable combat port: ' + p.name);
    return p.name;
  }).sort();
}
// FieldDeliveries adds this presentation operation as an intersection on its
// constructor. Keep it explicit until that signature is folded into the named
// interface; the mechanical source extraction remains unchanged.
contracts.fields.push('flash'); contracts.fields.sort();
for (const ast of program.getSourceFiles()) {
  const file = path.relative(root, ast.fileName).replaceAll('\\', '/');
  if (file.startsWith('src/')) sources[file] = sha256(fs.readFileSync(ast.fileName));
}
const original = fs.readFileSync(path.join(root, '.reference/src/engine/world.ts'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
assert.equal(sha256(original), lock.files['src/engine/world.ts']);
const ast = ts.createSourceFile('world.ts', original.toString(), ts.ScriptTarget.Latest, true);
const needed = new Set(Object.values(contracts).flat().filter(name => /^(instance|skill\w+Voice$|grantedTags$|hostSockets$|effectiveSkillLevel$|payloadTransition$|statusReqs$|feedingCueFlash$|combatCueFlash$)/.test(name)));
const queries = [];
for (const n of ast.statements.filter(ts.isImportDeclaration)) {
  const b = n.importClause?.namedBindings;
  if (n.importClause?.isTypeOnly || !b || !ts.isNamedImports(b)) continue;
  for (const e of b.elements) if (!e.isTypeOnly && needed.has(e.name.text)) queries.push({name: e.name.text, imported: (e.propertyName ?? e.name).text, source: n.moduleSpecifier.text});
}
const output = 'adapters/embedded/combat-port-contracts.mjs';
const code = `// Generated from checked SDK service interfaces.\nexport const combatPortContracts = Object.freeze(${JSON.stringify(contracts, null, 2)});\n`;
const manifestPath = path.join(root, 'baseline/combat-port-contracts-extraction.json');
const manifest = {schemaVersion: 1, sourceCommit: lock.commit, sources, queries, outputs: {[output]: sha256(code)}};
if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(path.join(root, output), 'utf8'), code);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath)), manifest);
} else {
  if (process.argv.includes('--update-draft')) {
    const previous = JSON.parse(fs.readFileSync(manifestPath));
    assert.equal(sha256(fs.readFileSync(path.join(root, output))), previous.outputs[output]);
  } else assert(!fs.existsSync(path.join(root, output)), 'Refusing to overwrite combat contracts');
  fs.writeFileSync(path.join(root, output), code); writeJSON(manifestPath, manifest);
}
console.log({passed: true, interfaces: Object.keys(contracts).length, ports: Object.values(contracts).reduce((n, list) => n + list.length, 0), queries: queries.length});
