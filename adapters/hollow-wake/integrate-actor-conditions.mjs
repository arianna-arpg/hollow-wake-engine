import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';

export const conditionPaths={actor:'src/engine/actor.ts',binding:'src/engine/actorConditionAdapter.ts'};
const lf=source=>source.replaceAll('\r\n','\n');
const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-seven/acceptance.json')));
export function conditionTree(source){
  const ast=ts.createSourceFile(conditionPaths.actor,source,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0,'Invalid condition actor source');
  const classes=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='Actor');assert.equal(classes.length,1);
  return {ast,type:classes[0]};
}
function guard(tree,name,global=false){
  const nodes=global?tree.ast.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree.ast)===name)):
    tree.type.members.filter(n=>n.name?.getText(tree.ast)===name);
  assert.equal(nodes.length,1,'Ambiguous condition source: '+name);
  const row=acceptance.sourceBoundary.find(row=>row.kind==='retained'&&row.name===name);assert(row);
  assert.equal(sha256(nodes[0].getText(tree.ast)),row.sha256,'Unreviewed condition source: '+name);return nodes[0];
}
export function renderConditionActor(source){
  const input=lf(source);assert(!/\b(?:actorConditions|createActorConditions|ActorConditionPublication)\b/.test(input),'Actor conditions already integrated or binding collision');
  const tree=conditionTree(input),refresh=guard(tree,'refreshConditions'),holds=guard(tree,'conditionHolds'),mask=guard(tree,'condMask'),sheet=guard(tree,'condSheet');
  const timers=tree.type.members.filter(n=>n.name?.getText(tree.ast)==='updateTimers');assert.equal(timers.length,1);
  const phase=acceptance.sourceBoundary.find(row=>row.kind==='retained'&&row.name==='updateTimers');
  assert.equal(sha256(timers[0].body.statements.slice(0,phase.phaseStatements).map(n=>n.getText(tree.ast)).join('\n')),phase.phaseSha256,'Unreviewed condition timer phase');
  const bit=guard(tree,'COND_BIT',true),rows=guard(tree,'RECENT_ROWS',true);
  const edits=[
    {start:bit.getFullStart(),end:bit.end,text:'\n\n// Capture native configuration at the original module-initialization phase.\nconst actorConditions = createActorConditions(STANCE_PLANT_TIME, STANCE_MOVE_WINDOW);'},
    {start:rows.getFullStart(),end:rows.end,text:''},
    {start:mask.getFullStart(),end:mask.end,text:'\n  /** Borrowed SDK condition state: last sampled mask and opaque confirmation. */\n  condMask = -1;'},
    {start:sheet.getStart(tree.ast),end:sheet.end,text:'condSheet: ActorConditionPublication = null;'},
    {start:holds.body.getStart(tree.ast),end:holds.body.end,text:'{\n    return actorConditions.holds(this, id);\n  }'},
    {start:refresh.body.getStart(tree.ast),end:refresh.body.end,text:'{\n    actorConditions.refresh(this);\n    // Conditions and gauges confirm independently; preserve the original phase.\n    this.sdkActorGauges.refresh(this, this.sheet);\n  }'},
  ];
  const removed=new Set(['FULL_ES_FRAC','FULL_LIFE_FRAC','FULL_MANA_FRAC','LOW_ES_FRAC','LOW_MANA_FRAC','CONDITION_IDS','RECENT_CONDITIONS']);
  for(const node of tree.ast.statements.filter(ts.isImportDeclaration)){
    const binding=node.importClause?.namedBindings;if(!binding||!ts.isNamedImports(binding))continue;
    const keep=binding.elements.filter(e=>!removed.has(e.name.text));
    if(keep.length!==binding.elements.length)edits.push({start:binding.getStart(tree.ast),end:binding.end,text:'{ '+keep.map(e=>e.getText(tree.ast)).join(', ')+' }'});
  }
  const lastImport=tree.ast.statements.filter(ts.isImportDeclaration).at(-1);assert(lastImport);
  edits.push({start:lastImport.end,end:lastImport.end,text:"\nimport {createActorConditions,type ActorConditionPublication} from './actorConditionAdapter';"});
  let result=input;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
  const output=conditionTree(result);
  const visit=node=>{
    if(ts.isIdentifier(node)){
      assert(!removed.has(node.text)&&!['COND_BIT','RECENT_ROWS'].includes(node.text),'Unreviewed condition ownership caller: '+node.text);
      if(['condMask','condSheet'].includes(node.text))assert(ts.isPropertyDeclaration(node.parent)&&node.parent.name===node,'Unreviewed condition state caller: '+node.text);
    }
    if(ts.isElementAccessExpression(node)&&ts.isStringLiteral(node.argumentExpression))assert(!['condMask','condSheet'].includes(node.argumentExpression.text),'Unreviewed condition state caller: '+node.argumentExpression.text);
    ts.forEachChild(node,visit);
  };visit(output.ast);
  return result;
}
/** Validate source and output collision before either write. */
export function integrateActorConditions(game,write=true){
  const source=fs.readFileSync(path.join(game,conditionPaths.actor),'utf8');
  const actor=renderConditionActor(source).replaceAll('\n',source.includes('\r\n')?'\r\n':'\n');
  assert(!fs.existsSync(path.join(game,conditionPaths.binding)),'Condition binding already exists');
  const binding=fs.readFileSync(path.join(root,'adapters/hollow-wake/actorConditionAdapter.ts'),'utf8');
  if(write){fs.writeFileSync(path.join(game,conditionPaths.actor),actor);fs.writeFileSync(path.join(game,conditionPaths.binding),binding);}
  return {files:Object.values(conditionPaths),decision:'condition-publication-recovery/v1'};
}
