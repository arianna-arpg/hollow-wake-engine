import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';

export const eventFile='src/engine/world.ts';
export const eventBridge='src/engine/resourceEventAdapter.ts';
const lf=s=>s.replaceAll('\r\n','\n');
const parse=s=>ts.createSourceFile(eventFile,s,ts.ScriptTarget.Latest,true);
const apply=(source,edits)=>{for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);return source;};

export function renderResourceEvents(source,reference){
  const current=lf(source),original=lf(reference),ast=parse(current),base=parse(original),edits=[];
  const world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
  const oldWorld=base.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
  assert(world&&oldWorld);
  assert(!world.members.some(n=>['sdkResourceEvents','sdkResourceEventRuntime'].includes(n.name?.getText(ast))),'Resource event binding already exists');
  for(const name of ['tapCharges','tapFires']){
    const nodes=world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name);
    const old=oldWorld.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(base)===name);
    assert.equal(nodes.length,1,`Ambiguous resource event method ${name}`);assert.equal(old.length,1);
    const node=nodes[0];assert.equal(node.getText(ast),old[0].getText(base),`Unreviewed resource event method ${name}`);
    if(name==='tapCharges')edits.push({start:node.body.pos,end:node.body.end,text:' { this.sdkResourceEvents().dispatch(a, on, at, orbKind, victim); }'});
    else edits.push({start:node.jsDoc?.[0]?.pos??node.getStart(ast),end:node.end,text:`/** One simulation binding; actors retain their own resource state. */
  private sdkResourceEventRuntime?: ReturnType<typeof createResourceEvents>;
  private sdkResourceEvents(): ReturnType<typeof createResourceEvents> {
    return this.sdkResourceEventRuntime ??= createResourceEvents(victim => this.isEliteVictim(victim));
  }`});
  }
  let rendered=apply(current,edits);
  const tree=parse(rendered),imports=[];
  for(const node of tree.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='./gauge')){
    const bindings=node.importClause?.namedBindings;if(!bindings||!ts.isNamedImports(bindings))continue;
    const outside=rendered.slice(0,node.getStart(tree))+rendered.slice(node.end);
    const kept=bindings.elements.filter(n=>!['gaugeAdd','gaugeShaveSec','GaugeFeedSpec'].includes(n.name.text)||new RegExp('\\b'+n.name.text+'\\b').test(outside));
    if(kept.length!==bindings.elements.length)imports.push({start:node.getStart(tree),end:node.end,text:kept.length?`import { ${kept.map(n=>n.getText(tree)).join(', ')} } from './gauge';`:"import './gauge';"});
  }
  const last=tree.statements.filter(ts.isImportDeclaration).at(-1).end,lineEnd=rendered.indexOf('\n',last),at=lineEnd<0?rendered.length:lineEnd;
  imports.push({start:at,end:at,text:"\nimport { createResourceEvents } from './resourceEventAdapter';"});
  return apply(rendered,imports);
}

export function integrateResourceEvents(game,write=true){
  assert(!fs.existsSync(path.join(game,eventBridge)),'Refusing to overwrite resource event bridge');
  const reference=fs.readFileSync(path.join(root,'.reference',eventFile));
  const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));assert.equal(sha256(reference),lock.files[eventFile]);
  const source=fs.readFileSync(path.join(game,eventFile),'utf8'),after=renderResourceEvents(source,reference.toString());
  if(write){
    fs.writeFileSync(path.join(game,eventFile),after.replaceAll('\n',source.includes('\r\n')?'\r\n':'\n'));
    fs.copyFileSync(path.join(root,'adapters/hollow-wake/resourceEventAdapter.ts'),path.join(game,eventBridge));
  }
  return {files:[eventFile,eventBridge]};
}
