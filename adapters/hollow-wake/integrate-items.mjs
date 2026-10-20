import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {root,sha256} from '../../scripts/reference-utils.mjs';

/** Source-guarded first integration. Re-running never overwrites an existing bridge. */
export function renderItemAdapter(original) {
  const file='src/engine/itemgen.ts';
  let source=original.replaceAll('\r\n','\n');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const replacements=Object.entries({rollItem:'rollThroughSdk(opts, nextItemUid)',forgeItem:'forgeThroughSdk(opts, nextItemUid)',compileItemMods:'compileThroughSdk(item, nextItemUid)'})
    .map(([name,call])=>{
      const matches=ast.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name);
      assert.equal(matches.length,1,`Ambiguous item adapter target: ${name}`);
      const body=matches[0].body;assert.ok(body);
      return {start:body.getStart(ast),end:body.end,text:`{\n  ${name==='compileItemMods'?'':'ensureValidated();\n  '}return ${call};\n}`};
    }).sort((a,b)=>b.start-a.start);
  for(const edit of replacements) source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  // Remove superseded private algorithms, retaining all public helpers and their dependencies.
  const transformed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const privateFunctions=new Map(transformed.statements.filter(s=>ts.isFunctionDeclaration(s)&&!s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(s=>[s.name.text,s]));
  const identifiers=node=>{const names=new Set();const visit=n=>{if(ts.isIdentifier(n))names.add(n.text);ts.forEachChild(n,visit);};visit(node);return names;};
  const reachable=new Set();
  const walk=node=>{for(const name of identifiers(node))if(privateFunctions.has(name)&&!reachable.has(name)){reachable.add(name);walk(privateFunctions.get(name).body);}};
  for(const statement of transformed.statements)if(!ts.isFunctionDeclaration(statement)||!privateFunctions.has(statement.name?.text))walk(statement);
  for(const statement of [...privateFunctions.values()].filter(s=>!reachable.has(s.name.text)).sort((a,b)=>b.pos-a.pos))source=source.slice(0,statement.getFullStart())+source.slice(statement.end);
  // Prune imports used solely by the removed algorithms. The game still type-checks the result.
  const reduced=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true), used=new Set();
  for(const statement of reduced.statements)if(!ts.isImportDeclaration(statement))for(const name of identifiers(statement))used.add(name);
  const printer=ts.createPrinter();
  for(const statement of [...reduced.statements].reverse())if(ts.isImportDeclaration(statement)&&statement.importClause?.namedBindings&&ts.isNamedImports(statement.importClause.namedBindings)){
    const old=statement.importClause.namedBindings.elements, kept=old.filter(s=>used.has(s.name.text));
    if(kept.length===old.length)continue;
    const clause=ts.factory.updateImportClause(statement.importClause,statement.importClause.isTypeOnly,statement.importClause.name,ts.factory.createNamedImports(kept));
    const next=ts.factory.updateImportDeclaration(statement,statement.modifiers,clause,statement.moduleSpecifier,statement.attributes);
    source=source.slice(0,statement.getStart(reduced))+printer.printNode(ts.EmitHint.Unspecified,next,reduced)+source.slice(statement.end);
  }
  source="import { rollThroughSdk, forgeThroughSdk, compileThroughSdk } from './itemAdapter';\n"+source;
  return source;
}
export function integrateItems(game, write=true) {
  const file='src/engine/itemgen.ts', target=path.join(game,file), bridge=path.join(game,'src/engine/itemAdapter.ts');
  const bytes=fs.readFileSync(target), lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
  const accepted=fs.readFileSync(path.join(root,'.reference',file),'utf8');
  assert.equal(sha256(accepted),lock.files[file],'Frozen adapter input changed');
  assert.equal(bytes.toString('utf8').replaceAll('\r\n','\n'),accepted.replaceAll('\r\n','\n'),'Unreviewed item generator; refusing patch');
  assert.ok(!fs.existsSync(bridge),'Item adapter already exists; refusing overwrite');
  const source=renderItemAdapter(bytes.toString('utf8'));
  const newline=bytes.includes(Buffer.from('\r\n'))?'\r\n':'\n';
  if(write) {
    fs.writeFileSync(target,source.replaceAll('\n',newline));
    fs.copyFileSync(path.join(root,'adapters/hollow-wake/itemAdapter.ts'),bridge);
  }
  return {files:[file,'src/engine/itemAdapter.ts']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(integrateItems(path.resolve(process.argv[2])));
