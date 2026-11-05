import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/gem-residence/acceptance.json')));
assert.equal(sha256(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),contract.sourceLockSha256);
const methods=contract.fixtures.residence.methods;
const parse=input=>ts.createSourceFile('source.ts',input,ts.ScriptTarget.Latest,true);
const apply=(input,edits)=>{for(const [start,end,text]of edits.sort((a,b)=>b[0]-a[0]))input=input.slice(0,start)+text+input.slice(end);return input;};
function identifiers(nodes){const names=new Set();function visit(node){if(ts.isIdentifier(node))names.add(node.text);ts.forEachChild(node,visit);}nodes.forEach(visit);return names;}
function selected(ast,file,name){
  const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)?n.name?.text===name:ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));
  assert.equal(nodes.length,1,file+'#'+name);assert.equal(sha256(nodes[0].getText(ast)),methods[file+'#'+name],'Unreviewed '+file+'#'+name);return nodes[0];
}
function prune(input,allowed){
  const ast=parse(input),used=identifiers(ast.statements.filter(n=>!ts.isImportDeclaration(n))),edits=[];
  for(const node of ast.statements.filter(ts.isImportDeclaration)){
    const clause=node.importClause,names=clause?.namedBindings;if(!names||!ts.isNamedImports(names))continue;
    const kept=names.elements.filter(n=>!allowed.has(n.name.text)||used.has(n.name.text));if(kept.length===names.elements.length)continue;
    if(kept.length||clause.name)edits.push([names.getStart(ast),names.end,'{ '+kept.map(n=>n.getText(ast)).join(', ')+' }']);
    else edits.push([node.getStart(ast),node.end,clause.isTypeOnly?'':'import '+node.moduleSpecifier.getText(ast)+';']);
  }
  return apply(input,edits);
}
export function renderGemResidence(source){
  const input=source.replaceAll('\r\n','\n'),ast=parse(input),edits=[];
  assert(!/\b(sdkGemResidence|createGemResidence)\b/.test(input),'Gem residence binding collision');
  const nodes=Object.keys(methods).filter(k=>k.startsWith('engine/gemitems.ts#')).map(k=>selected(ast,'engine/gemitems.ts',k.split('#')[1]));
  const helper=nodes.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='packSocketRow'));
  assert(helper);assert(!identifiers(ast.statements.filter(n=>!nodes.includes(n)&&!ts.isImportDeclaration(n))).has('packSocketRow'),'Host extension uses private packSocketRow');
  edits.push([helper.getStart(ast),helper.end,'']);
  for(const node of nodes.filter(ts.isFunctionDeclaration)){
    assert(node.body&&node.type);const args=node.parameters.map(p=>{assert(ts.isIdentifier(p.name));return p.name.text;});
    edits.push([node.body.getStart(ast),node.body.end,'{ return sdkGemResidence.'+node.name.text+'('+args.join(', ')+') as '+node.type.getText(ast)+'; }']);
  }
  const imports=ast.statements.filter(ts.isImportDeclaration);
  edits.push([imports.at(-1).end,imports.at(-1).end,`\nimport {createGemResidence} from '@hollow-wake/engine/inventory/gems';
const sdkGemResidence = createGemResidence({
  skill: id => SKILLS[id], support: id => SUPPORTS[id], hasOwnSupport: id => Object.prototype.hasOwnProperty.call(SUPPORTS, id),
  hasForm: id => !!MONSTERS[id], makeSkill: makeSkillInstance, validTreeNodes,
  nextUid: nextItemUid, rebuildItem, bagWidth, bagHeight, itemGridSize,
});\n`]);
  const output=prune(apply(input,edits),identifiers(nodes));assert.equal(parse(output).parseDiagnostics.length,0);
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function renderItemRestoration(source){
  const input=source.replaceAll('\r\n','\n'),ast=parse(input),edits=[];
  assert(!/\b(sdkItemRestoration|createItemRestoration)\b/.test(input),'Item restoration binding collision');
  const node=selected(ast,'engine/itemgen.ts','rebuildItem');assert(node.body);
  edits.push([node.body.getStart(ast),node.body.end,'{ return sdkItemRestoration.rebuildItem(saved); }']);
  const imports=ast.statements.filter(ts.isImportDeclaration);
  edits.push([imports.at(-1).end,imports.at(-1).end,`\nimport {createItemRestoration} from '@hollow-wake/engine/items/restoration';
const sdkItemRestoration = createItemRestoration<ItemInstance>({
  base: id => ITEM_BASES[id], affix: id => ITEM_AFFIXES[id], hasUnique: id => !!UNIQUES[id],
  hasVestige: id => !!VESTIGES[id], socketCap: category => socketCap(category as ItemCategory),
  bumpUidFloor: bumpItemUidFloor, resolveChoices: item => resolveUniqueChoices(item, UNIQUES[item.uniqueId!]),
});\n`]);
  const output=apply(input,edits);assert.equal(parse(output).parseDiagnostics.length,0);
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateGemResidence(game,install=true){
  const changes=[['src/engine/gemitems.ts',renderGemResidence],['src/engine/itemgen.ts',renderItemRestoration]].map(([file,render])=>{
    const before=fs.readFileSync(path.join(game,file));return {file,before,after:Buffer.from(render(before.toString('utf8')))};
  });
  if(install)installCharacterSources(game,changes);
  return {files:changes.map(r=>r.file),decision:'portable gem residence and tolerant item restoration over explicit content, identity, geometry and tree services'};
}
