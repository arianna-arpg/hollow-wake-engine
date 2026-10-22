import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';

export const dispatchWorld = 'src/engine/world.ts';
const lf = source => source.replaceAll('\r\n', '\n');
export function dispatchMethod(source) {
  const ast=ts.createSourceFile(dispatchWorld,source,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0,'Invalid dispatch source');
  const worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
  assert.equal(worlds.length,1);
  const methods=worlds[0].members.filter(n=>n.name?.getText(ast)==='useSkill');
  assert.equal(methods.length,1);
  return {ast,world:worlds[0],method:methods[0]};
}
/** Only the accepted already-adapted request may be replaced. Every unrelated
 * class member is retained verbatim; original-only source must use prior overlays. */
export function renderDispatchWorld(source) {
  const current=lf(source);
  assert(!/\b(?:sdkSkillDispatch|SkillDispatch)\b/.test(current),'Dispatch already integrated or binding collision');
  const {ast,method}=dispatchMethod(current);
  const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-four/acceptance.json')));
  assert.equal(method.body.statements.length,acceptance.sourceBoundary.retained.statements,'Unreviewed dispatch statements');
  assert.equal(sha256(method.getText(ast)),acceptance.sourceBoundary.retained.sha256,'Unreviewed dispatch method');
  const ports=lf(fs.readFileSync(path.join(root,'adapters/hollow-wake/skill-dispatch-ports.txt'),'utf8')).trimEnd();
  const lastImport=ast.statements.filter(ts.isImportDeclaration).at(-1); assert(lastImport);
  const edits=[
    {start:method.getStart(ast),end:method.end,text:ports+'\n\n  '+
      'useSkill(caster: Actor, inst: SkillInstance, aim: Vec2, seatPress = false): boolean {\n'+
      '    return this.sdkSkillDispatch.request(caster, inst, aim, seatPress);\n  }'},
    {start:lastImport.end,end:lastImport.end,text:"\nimport {SkillDispatch} from '@hollow-wake/engine/casting/dispatch';"},
  ];
  let output=current;
  for(const edit of edits.sort((a,b)=>b.start-a.start)) output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  // Remove only bindings whose entire request-time implementation moved. Leave
  // any binding still used by an unrelated host member or custom extension.
  const moved=new Set(['castDuration','chargeCastDuration','overchargeCastDuration','overchargeMarker',
    'focusCastDuration','channelInterval','channelWindup','commitAmmunitionPress','reserveCostOf','ChannelSpec']);
  const parsed=dispatchMethod(output).ast, used=new Set(), imports=[];
  function read(node) {
    if(ts.isImportDeclaration(node)) { imports.push(node); return; }
    if(ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node,read);
  }
  read(parsed);
  const removals=[],printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
  for(const node of imports) {
    const bindings=node.importClause?.namedBindings;
    if(!bindings||!ts.isNamedImports(bindings)) continue;
    const kept=bindings.elements.filter(n=>!moved.has(n.name.text)||used.has(n.name.text));
    if(kept.length===bindings.elements.length) continue;
    const clause=ts.factory.updateImportClause(node.importClause,node.importClause.isTypeOnly,
      node.importClause.name,kept.length?ts.factory.updateNamedImports(bindings,kept):undefined);
    const text=kept.length||clause.name?printer.printNode(ts.EmitHint.Unspecified,
      ts.factory.updateImportDeclaration(node,node.modifiers,clause,node.moduleSpecifier,node.attributes),parsed):'';
    removals.push({start:node.getStart(parsed),end:node.end,text});
  }
  for(const edit of removals.sort((a,b)=>b.start-a.start)) output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  dispatchMethod(output);
  return output;
}
export function integrateSkillDispatch(game,write=true) {
  const file=path.join(game,dispatchWorld),source=fs.readFileSync(file,'utf8');
  const output=renderDispatchWorld(source).replaceAll('\n',source.includes('\r\n')?'\r\n':'\n');
  if(write) fs.writeFileSync(file,output);
  return {files:[dispatchWorld]};
}
