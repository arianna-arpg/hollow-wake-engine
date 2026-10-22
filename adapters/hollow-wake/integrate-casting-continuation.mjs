import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';

export const continuationWorld='src/engine/world.ts';
const lf=source=>source.replaceAll('\r\n','\n');
export function continuationMethods(source) {
  const ast=ts.createSourceFile(continuationWorld,source,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0,'Invalid continuation source');
  const worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
  assert.equal(worlds.length,1);
  const methods={};
  for(const name of ['updateCasting','castPress']) {
    const matches=worlds[0].members.filter(n=>n.name?.getText(ast)===name);
    assert.equal(matches.length,1,'Missing or duplicate continuation method: '+name);
    assert(ts.isMethodDeclaration(matches[0]));methods[name]=matches[0];
  }
  return {ast,world:worlds[0],methods};
}
/** Both accepted methods must match before any edit is returned or written.
 * Preserve every other member, including independent host extensions. */
export function renderContinuationWorld(source) {
  const current=lf(source);
  assert(!/\b(?:sdkCastingContinuation|CastingContinuation)\b/.test(current),'Continuation already integrated or binding collision');
  const {ast,methods}=continuationMethods(current);
  const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-five/acceptance.json')));
  for(const [name,method] of Object.entries(methods)) {
    const expected=acceptance.sourceBoundary.methods.find(row=>row.kind==='retained'&&row.name===name);assert(expected);
    assert.equal(method.body.statements.length,expected.statements,'Unreviewed continuation statements: '+name);
    assert.equal(sha256(method.getText(ast)),expected.sha256,'Unreviewed continuation method: '+name);
  }
  const ports=lf(fs.readFileSync(path.join(root,'adapters/hollow-wake/casting-continuation-ports.txt'),'utf8')).trimEnd();
  const lastImport=ast.statements.filter(ts.isImportDeclaration).at(-1);assert(lastImport);
  const edits=[
    {start:methods.updateCasting.getStart(ast),end:methods.updateCasting.end,text:ports+'\n\n  '+
      'private updateCasting(a: Actor, dt: number): void {\n'+
      '    if (!a.casting) return;\n'+
      '    this.sdkCastingContinuation.advance(a, dt);\n  }'},
    {start:methods.castPress.getStart(ast),end:methods.castPress.end,
      text:'castPress(caster: Actor): void { this.sdkCastingContinuation.press(caster); }'},
    {start:lastImport.end,end:lastImport.end,text:"\nimport {CastingContinuation} from '@hollow-wake/engine/casting/continuation';"},
  ];
  let output=current;
  for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  const moved=new Set(['advanceCastProgress','advanceFocusCast','focusFizzleCooldown','focusWithinReach','pressCastTiming']);
  const parsed=continuationMethods(output).ast,used=new Set(),imports=[];
  function read(node) {
    if(ts.isImportDeclaration(node)){imports.push(node);return;}
    if(ts.isIdentifier(node))used.add(node.text);ts.forEachChild(node,read);
  }
  read(parsed);
  const removals=[],printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
  for(const node of imports) {
    const bindings=node.importClause?.namedBindings;if(!bindings||!ts.isNamedImports(bindings))continue;
    const kept=bindings.elements.filter(n=>!moved.has(n.name.text)||used.has(n.name.text));
    if(kept.length===bindings.elements.length)continue;
    const clause=ts.factory.updateImportClause(node.importClause,node.importClause.isTypeOnly,
      node.importClause.name,kept.length?ts.factory.updateNamedImports(bindings,kept):undefined);
    const text=kept.length||clause.name?printer.printNode(ts.EmitHint.Unspecified,
      ts.factory.updateImportDeclaration(node,node.modifiers,clause,node.moduleSpecifier,node.attributes),parsed):'';
    removals.push({start:node.getStart(parsed),end:node.end,text});
  }
  for(const edit of removals.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  continuationMethods(output);return output;
}
export function integrateCastingContinuation(game,write=true) {
  const file=path.join(game,continuationWorld),source=fs.readFileSync(file,'utf8');
  const output=renderContinuationWorld(source).replaceAll('\n',source.includes('\r\n')?'\r\n':'\n');
  if(write)fs.writeFileSync(file,output);
  return {files:[continuationWorld]};
}
