import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';import {root,sha256} from '../../scripts/reference-utils.mjs';
export const progressionWorld='src/engine/world.ts',progressionClasses='src/data/classes.ts',progressionBridge='src/engine/progressionAdapter.ts';const lf=s=>s.replaceAll('\r\n','\n');
const parse=(file,source)=>ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
function apply(source,edits){for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);return source;}
export function renderProgressionWorld(source,reference){
 const current=lf(source),original=lf(reference),ast=parse(progressionWorld,current),base=parse(progressionWorld,original);
 const world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),oldWorld=base.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert(world&&oldWorld);
 assert(!world.members.some(n=>n.name?.getText(ast)==='sdkProgressionHost'),'Progression member already exists');
 const edits=[];
 for(const name of ['grantXp','grantSeatXp']){
  const nodes=world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name),old=oldWorld.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(base)===name);assert.equal(nodes.length,1,`Ambiguous progression method ${name}`);assert.equal(old.length,1);
  const node=nodes[0];assert.equal(node.getText(ast),old[0].getText(base),`Unreviewed progression method ${name}`);
  if(name==='grantXp')edits.push({start:node.getStart(ast),end:node.end,text:`grantXp(amount: number): void {
    (this.sdkProgressionHost ??= createProgressionHost(this, MIREILLE_XP_BUFF_MULT)).grantAll(this.seats, amount);
  }`});
  else {const start=node.jsDoc?.[0]?.pos??node.getStart(ast);assert.equal(current.slice(start,node.getStart(ast)),original.slice(old[0].jsDoc?.[0]?.pos??old[0].getStart(base),old[0].getStart(base)));edits.push({start,end:node.end,text:'/** Per-world SDK progression binding; actor and save ownership remain here. */\n  private sdkProgressionHost?: ReturnType<typeof createProgressionHost>;'});}
 }
 const growth="p.sheet.setSource('level', [\n      mod('life', 'flat', (p.level - 1) * PROGRESSION.lifePerLevel),\n      mod('mana', 'flat', (p.level - 1) * PROGRESSION.manaPerLevel),\n      mod('accuracy', 'flat', (p.level - 1) * 4),\n    ]);";
 assert.equal(original.split(growth).length,2);assert.equal(current.split(growth).length,2,'Unreviewed level growth source');const at=current.indexOf(growth);edits.push({start:at,end:at+growth.length,text:"p.sheet.setSource('level', sdkLevelModifiers(p.level, PROGRESSION.lifePerLevel, PROGRESSION.manaPerLevel, 4));"});
 for(const [from,names] of [['./accountReliquary',['reliquaryExperience']],['../meta/account',['CLASS_LEVEL_MILESTONES','classLevelLedgerKey','reachedLevelKey']],['../meta/unlocks',['catalogClassLevelMilestones','catalogLevelMilestones']]]){
  const imports=ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text===from);assert.equal(imports.length,1);const node=imports[0],bindings=node.importClause.namedBindings;assert(ts.isNamedImports(bindings));const kept=bindings.elements.filter(n=>!names.includes(n.name.text)).map(n=>n.getText(ast));assert.equal(bindings.elements.length-kept.length,names.length);edits.push({start:node.getStart(ast),end:node.end,text:`import { ${kept.join(', ')} } from '${from}';`});
 }
 const end=ast.statements.filter(ts.isImportDeclaration).at(-1).end;edits.push({start:end,end,text:"\nimport { createProgressionHost } from './progressionAdapter';\nimport { levelModifiers as sdkLevelModifiers } from '@hollow-wake/engine/character/progression';"});return apply(current,edits);
}
export function renderProgressionClasses(source,reference){
 const current=lf(source),original=lf(reference),ast=parse(progressionClasses,current),base=parse(progressionClasses,original);assert(!current.includes('sdkExperienceForLevel'),'Progression class wrappers already applied');
 const find=(tree)=>{const matches=[];const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='PROGRESSION')matches.push(node);ts.forEachChild(node,visit);};visit(tree);assert.equal(matches.length,1);assert(ts.isObjectLiteralExpression(matches[0].initializer));return matches[0].initializer;};
 const object=find(ast),old=find(base),edits=[];
 for(const [name,text] of [['xpForLevel','return sdkExperienceForLevel(level, 45, 1.55);'],['passivePointsAtLevel','return sdkPassivePointsAtLevel(level, this.startingPassivePoints, this.passivePointsPerLevel);']]){
  const nodes=object.properties.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name),before=old.properties.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(base)===name);assert.equal(nodes.length,1,`Ambiguous progression rule ${name}`);assert.equal(before.length,1);assert.equal(nodes[0].getText(ast),before[0].getText(base),`Unreviewed progression rule ${name}`);edits.push({start:nodes[0].body.pos,end:nodes[0].body.end,text:' { '+text+' }'});
 }
 const end=ast.statements.filter(ts.isImportDeclaration).at(-1)?.end??0;edits.push({start:end,end,text:"\nimport { experienceForLevel as sdkExperienceForLevel, passivePointsAtLevel as sdkPassivePointsAtLevel } from '@hollow-wake/engine/character/progression';"});return apply(current,edits);
}
export function integrateProgression(game,write=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));assert(!fs.existsSync(path.join(game,progressionBridge)),'Refusing to overwrite progression binding');const outputs=[];
 for(const [file,render] of [[progressionWorld,renderProgressionWorld],[progressionClasses,renderProgressionClasses]]){const original=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(original),lock.files[file]);const source=fs.readFileSync(path.join(game,file),'utf8');outputs.push({file,source,after:render(source,original.toString())});}
 if(write){for(const {file,source,after} of outputs)fs.writeFileSync(path.join(game,file),after.replaceAll('\n',source.includes('\r\n')?'\r\n':'\n'));fs.copyFileSync(path.join(root,'adapters/hollow-wake/progressionAdapter.ts'),path.join(game,progressionBridge));}
 return {files:[progressionWorld,progressionClasses,progressionBridge]};
}
