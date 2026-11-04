import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installWorldBinding} from './install-world-binding.mjs';

const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/vocation-sites/acceptance.json')));
const forwarders={
  zoneMatchesSiteFilter:'return this.engineVocationSites.matches(def, filter);',
  placeVocationSites:'this.engineVocationSites.place(def);',
  spawnVocationSite:'return this.engineVocationSites.spawn(vocId, at, rng);',
  updateVocationSites:'this.engineVocationSites.update();',
};

export function renderVocationSites(source) {
  const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);
  const world=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='World');
  assert(world&&!/\b(?:engineVocationSites|bindVocationSites)\b/.test(input),'Vocation site binding collision');
  const imports=ast.statements.filter(ts.isImportDeclaration),insertion=imports.at(-1).end;
  const edits=[[insertion,insertion,"\nimport {bindVocationSites} from './vocationSiteAdapter';"]];
  const ownedBodies=new Set();
  for(const [name,digest] of Object.entries(accepted.methodHashes)){
    const method=world.members.find(node=>ts.isMethodDeclaration(node)&&node.name.getText(ast)===name);
    assert(method?.body&&sha256(method.getText(ast))===digest,'Unreviewed vocation site method '+name);
    if(!Object.hasOwn(forwarders,name))continue;
    ownedBodies.add(method.body);
    edits.push([method.body.getStart(ast),method.body.end,'{ '+forwarders[name]+' }']);
    if(name==='zoneMatchesSiteFilter')edits.push([method.getStart(ast),method.getStart(ast),
      'private readonly engineVocationSites = bindVocationSites(this, hashStr);\n  ']);
  }
  assert.equal(ownedBodies.size,4);
  // TypeScript identifiers outside the acquired bodies keep their import.
  // Text in comments cannot keep an unused runtime import alive.
  const retained=new Set();
  function visit(node){
    if(ownedBodies.has(node)||ts.isImportDeclaration(node))return;
    if(ts.isIdentifier(node))retained.add(node.text);
    ts.forEachChild(node,visit);
  }
  visit(ast);
  const declarations=imports.filter(i=>i.moduleSpecifier.text==='../data/vocations');
  assert.equal(declarations.length,1,'Missing vocation data import');
  const names=declarations[0].importClause?.namedBindings;
  assert(names&&ts.isNamedImports(names));
  const removable=new Set(['vocationDiscoveryKey','vocationLedgerKey','VOCATION_CFG']);
  const kept=names.elements.filter(n=>!removable.has(n.name.text)||retained.has(n.name.text));
  if(kept.length!==names.elements.length)edits.push([names.getStart(ast),names.end,'{'+kept.map(n=>n.getText(ast)).join(', ')+'}']);
  let output=input;
  for(const [start,end,replacement] of edits.sort((a,b)=>b[0]-a[0]))output=output.slice(0,start)+replacement+output.slice(end);
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}

export function integrateVocationSites(game,install=true) {
  const world=path.join(game,'src/engine/world.ts'),source=fs.readFileSync(world,'utf8');
  const target=path.join(path.dirname(world),'vocationSiteAdapter.ts'),replacement=renderVocationSites(source);
  assert(!fs.existsSync(target),'Vocation site binding already exists');
  if(install)installWorldBinding(game,world,source,replacement,target,fs.readFileSync(path.join(root,'adapters/hollow-wake/vocationSiteAdapter.ts'),'utf8'));
  return {files:['src/engine/world.ts','src/engine/vocationSiteAdapter.ts'],decision:'SDK site filtering, seeded placement, spawn and discovery'};
}
