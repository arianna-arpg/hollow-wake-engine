import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';

export const scopePath='docs/combat-inventory-capabilities.json';
export const readScope=()=>JSON.parse(fs.readFileSync(path.join(root,scopePath),'utf8'));
const relative=file=>path.relative(root,file).replaceAll('\\','/');
function typeOnly(node){
 if(node.isTypeOnly||node.importClause?.isTypeOnly)return true;
 const clause=node.importClause?.namedBindings??node.exportClause;
 return !node.importClause?.name&&clause?.elements?.length>0&&clause.elements.every(element=>element.isTypeOnly);
}
/** Static imports are the production contract; dynamic/foreign imports fail.
 * Overrides are in-memory negative controls, never edits to production files. */
export function sourceGraph(entry,{includeTypes=false,overrides=new Map()}={}){
 const visited=new Set(),sources={};
 const visit=file=>{
  file=path.resolve(file);if(visited.has(file))return;
  assert(file.startsWith(path.join(root,'src')+path.sep),'Source import escaped runtime: '+relative(file));visited.add(file);
  const name=relative(file),code=overrides.get(name)??fs.readFileSync(file,'utf8');sources[name]=sha256(code);
  const ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true);
  const walk=node=>{
   if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||node.expression.getText(ast)==='require'))throw Error('Dynamic runtime dependency: '+name);
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier){
    if(!includeTypes&&typeOnly(node))return;
    assert(ts.isStringLiteral(node.moduleSpecifier),'Nonliteral runtime dependency: '+name);
    const specifier=node.moduleSpecifier.text;assert(specifier.startsWith('.'),'External runtime dependency: '+specifier);
    visit(path.resolve(path.dirname(file),specifier.replace(/\.js$/,'.ts')));
   }
   ts.forEachChild(node,walk);
  };walk(ast);
 };visit(entry);return{files:[...visited].map(relative).sort(),sources};
}
export function checkScope({manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),scope=readScope(),overrides=new Map()}={}){
 assert.equal(scope.schemaVersion,1);assert.equal(scope.delivery,'combat-and-inventory-build-sdk');
 for(const[file,hash]of [[scope.baseline.lock,scope.baseline.lockSha256],[scope.baseline.catalogue,scope.baseline.catalogueSha256]])assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,'Changed agreed baseline: '+file);
 assert.equal(Object.keys(manifest.dependencies??{}).length,0,'New runtime dependency requires an explicit scope decision');
 assert.deepEqual(Object.keys(manifest.exports).sort(),Object.keys(scope.exports).sort(),'Unclassified public entry');
 const ids=new Set(),covered=new Set();
 for(const row of scope.capabilities){
  assert(!ids.has(row.id)&&row.required===true);ids.add(row.id);
  assert(row.remaining.task&&row.remaining.acceptance&&[2,3,4].includes(row.remaining.milestone));
  for(const evidence of row.evidence)assert(fs.existsSync(path.join(root,evidence)),evidence);
  for(const entry of row.entries){assert(scope.exports[entry],entry);covered.add(entry);}
 }
 const extensions=new Set(scope.extensionRoots.map(name=>'src/'+name+'.ts')),graphs={},sources={};
 for(const[name,entry]of Object.entries(manifest.exports)){
  const module=typeof entry==='string'?entry:entry.import,classification=scope.exports[name];
  assert.equal(classification.module,module,'Changed entry requires scope review: '+name);
  assert(['required-rule','legacy-mixed','optional-extension','content'].includes(classification.classification));
  if(classification.classification==='required-rule')assert(covered.has(name),'Required entry has no capability task: '+name);
  if(!module.endsWith('.js'))continue;
  const file=path.join(root,module.replace('./dist/','src/').replace(/\.js$/,'.ts'));
  const runtime=sourceGraph(file,{overrides}),types=sourceGraph(file,{overrides,includeTypes:true});Object.assign(sources,runtime.sources,types.sources);
  graphs[name]={runtime:runtime.files,types:types.files,extensionDependencies:runtime.files.filter(f=>extensions.has(f)),typeExtensionDependencies:types.files.filter(f=>extensions.has(f))};
 }
 for(const entry of scope.minimalEntries){const graph=graphs[entry];assert(graph,entry);assert.deepEqual(graph.extensionDependencies,[],'Minimal runtime depends on an extension: '+entry);assert.deepEqual(graph.typeExtensionDependencies,[],'Minimal declarations depend on an extension: '+entry);}
 for(const row of scope.knownCouplings)assert(ids.has(row.task)&&graphs[row.entry],row.id);
 return{schemaVersion:1,passed:true,baseline:scope.baseline,capabilities:scope.capabilities.length,exports:Object.keys(scope.exports).length,graphs,sources,knownCouplings:scope.knownCouplings,minimalEntries:scope.minimalEntries,allCapabilitiesComposed:false,devicePerformanceQualified:false};
}
