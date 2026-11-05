import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/crafting/acceptance.json')));
assert.equal(sha256(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),contract.sourceLockSha256);
const parse=input=>ts.createSourceFile('crafting.ts',input,ts.ScriptTarget.Latest,true);
const apply=(input,edits)=>{for(const [start,end,text]of edits.sort((a,b)=>b[0]-a[0]))input=input.slice(0,start)+text+input.slice(end);return input;};
const check=(ast,node,qualified)=>assert.equal(sha256(node.getText(ast)),contract.fixtures[qualified.startsWith('engine/world')?'actions':'policy'].methods[qualified],'Unreviewed '+qualified);
function identifiers(nodes){const names=new Set();function visit(node){if(ts.isIdentifier(node))names.add(node.text);ts.forEachChild(node,visit);}nodes.forEach(visit);return names;}
function prune(input,allowed){
 const ast=parse(input),used=new Set(),edits=[];
 function visit(node){if(ts.isImportDeclaration(node))return;if(ts.isIdentifier(node))used.add(node.text);ts.forEachChild(node,visit);}visit(ast);
 for(const node of ast.statements.filter(ts.isImportDeclaration)){
  const clause=node.importClause,names=clause?.namedBindings;if(!names||!ts.isNamedImports(names))continue;
  const kept=names.elements.filter(n=>!allowed.has(n.name.text)||used.has(n.name.text));if(kept.length===names.elements.length)continue;
  if(kept.length||clause.name)edits.push([names.getStart(ast),names.end,'{ '+kept.map(n=>n.getText(ast)).join(', ')+' }']);
  else edits.push([node.getStart(ast),node.end,clause.isTypeOnly?'':'import '+node.moduleSpecifier.getText(ast)+';']);
 }
 return apply(input,edits);
}
export function renderCraftingPolicy(source){
 const input=source.replaceAll('\r\n','\n'),ast=parse(input),edits=[];
 assert(!/\b(sdkCraftingRules|createCraftingRules)\b/.test(input),'Crafting binding collision');
 const functions=ast.statements.filter(ts.isFunctionDeclaration);
 for(const [key]of Object.entries(contract.fixtures.policy.methods).filter(([key])=>key.startsWith('engine/crafting.ts#'))){
  const name=key.split('#')[1];const matches=ast.statements.filter(n=>ts.isFunctionDeclaration(n)?n.name?.text===name:ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));
  assert.equal(matches.length,1,key);check(ast,matches[0],key);
 }
 for(const node of functions){
  const name=node.name.text;assert(contract.fixtures.policy.methods['engine/crafting.ts#'+name],'Unreviewed crafting helper '+name);
  if(!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){edits.push([node.getStart(ast),node.end,'']);continue;}
  assert(node.type&&node.body);const args=node.parameters.map(p=>{assert(ts.isIdentifier(p.name));return p.name.text;});
  edits.push([node.body.getStart(ast),node.body.end,'{ return sdkCraftingRules.'+name+'('+args.join(', ')+') as '+node.type.getText(ast)+'; }']);
 }
 const config=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='CRAFT_CFG'));
 const setup=`\nexport const sdkCraftingRules = createCraftingRules({
  craft: CRAFT_CFG, salvage: SALVAGE_CFG, sell: SELL_CFG, vendor: VENDOR_ITEM_CFG,
  gearEssences: ESSENCE_OF_RARITY, gemEssences: ESSENCE_OF_GEM, coarseEssence: 'coarse', supportEssence: 'glimmering',
  essenceIds: ESSENCE_IDS, ledgerCraftsUnlocked: LEDGER_CRAFTS_UNLOCKED,
  affix: id => ITEM_AFFIXES[id], base: id => ITEM_BASES[id], hasUnique: id => !!UNIQUES[id],
  pools: base => affixPoolsFor(ITEM_BASES[base.id]), cost: rank => CRAFT_CFG.cost(rank), oracleCost: oracleRerollCost, socketCap: category => socketCap(category as ItemCategory),
});\n`;
 edits.push([config.end,config.end,setup]);
 const imports=ast.statements.filter(ts.isImportDeclaration);
 edits.push([imports.at(-1).end,imports.at(-1).end,"\nimport {createCraftingRules} from '@hollow-wake/engine/crafting';\nimport {ESSENCE_IDS, oracleRerollCost} from '../data/essences';\nimport {LEDGER_CRAFTS_UNLOCKED} from '../meta/account';\nimport {socketCap, type ItemCategory} from './items';"]);
 const outside=identifiers(ast.statements.filter(n=>!functions.includes(n)&&!ts.isImportDeclaration(n)));
 for(const node of functions)if(!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))assert(!outside.has(node.name.text),'Host extension uses private crafting helper '+node.name.text);
 const output=prune(apply(input,edits),identifiers(functions));assert.equal(parse(output).parseDiagnostics.length,0);return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function renderCraftingWorld(source){
 const input=source.replaceAll('\r\n','\n'),ast=parse(input),world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),edits=[];
 assert(world);assert(!/\b(sdkCrafting|CraftingActions|sdkCraftingRules)\b/.test(input),'Crafting action binding collision');
 const selected=[];
 const publicNames=['craftSlots','craftAffix','craftSocket','rerollAffix','salvageItem','salvageBulk','salvageLockSet'];
 const privateNames=['salvageLane','lockedRefusal','breakOneItem','breakOneGemItem'];
 for(const name of [...publicNames,...privateNames]){
  const nodes=world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name);assert.equal(nodes.length,1,name);const node=nodes[0];
  check(ast,node,'engine/world.ts#'+name);
  selected.push(node);
  if(privateNames.includes(name)){edits.push([node.getStart(ast),node.end,'']);continue;}
  const args=node.parameters.map(p=>{assert(ts.isIdentifier(p.name));return p.name.text;});
  edits.push([node.body.getStart(ast),node.body.end,'{ return this.sdkCrafting.'+name+'('+args.join(', ')+'); }']);
 }
 const imports=ast.statements.filter(ts.isImportDeclaration),context=fs.readFileSync(path.join(root,'adapters/hollow-wake/crafting-context.txt'),'utf8');
 edits.push([imports.at(-1).end,imports.at(-1).end,"\nimport {CraftingActions} from '@hollow-wake/engine/crafting/actions';\nimport {sdkCraftingRules} from './crafting';"]);
 edits.push([world.members[0].getStart(ast),world.members[0].getStart(ast),context+'\n  ']);
 const outside=identifiers(world.members.filter(n=>!selected.includes(n)));
 for(const name of privateNames)assert(!outside.has(name),'Host extension uses private crafting action '+name);
 const output=prune(apply(input,edits),identifiers(selected));assert.equal(parse(output).parseDiagnostics.length,0);return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateCrafting(game,install=true){
 const changes=[['src/engine/crafting.ts',renderCraftingPolicy],['src/engine/world.ts',renderCraftingWorld]].map(([file,render])=>{
  const before=fs.readFileSync(path.join(game,file));return {file,before,after:Buffer.from(render(before.toString('utf8')))};
 });
 if(install)installCharacterSources(game,changes);
 return {files:changes.map(r=>r.file),decision:'crafting, reroll, socket and salvage rules with ordered borrowed-state actions and explicit game services'};
}
