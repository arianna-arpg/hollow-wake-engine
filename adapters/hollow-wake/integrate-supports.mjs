import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';import {root,sha256} from '../../scripts/reference-utils.mjs';
export const supportFiles=['src/engine/skills.ts','src/engine/supportbase.ts','src/engine/world.ts'];
export const supportBridges=['src/engine/supportRulesAdapter.ts','src/engine/supportActionsAdapter.ts'];
const lf=s=>s.replaceAll('\r\n','\n'),parse=(file,s)=>ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true);
const apply=(s,edits)=>{for(const e of edits.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.text+s.slice(e.end);return s;};
function editors(file,current,original){
 const ast=parse(file,current),base=parse(file,original),edits=[];
 const matches=(tree,name,methods=false)=>{const rows=methods?tree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World')?.members:tree.statements;return [...(rows??[])].filter(n=>n.name?.getText(tree)===name||(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)===name)));};
 const exact=(name,methods=false)=>{const now=matches(ast,name,methods),old=matches(base,name,methods);assert.equal(now.length,1,`Ambiguous support declaration ${name}`);assert.equal(old.length,1);assert.equal(now[0].getText(ast),old[0].getText(base),`Unreviewed support declaration ${name}`);return now[0];};
 return {ast,edits,body(name,text,methods=false){const n=exact(name,methods);assert(n.body);edits.push({start:n.body.pos,end:n.body.end,text:' {\n'+text+'\n}'});},replace(name,text){const n=exact(name);edits.push({start:n.getStart(ast),end:n.end,text});},remove(name){const n=exact(name);edits.push({start:n.getStart(ast),end:n.end,text:''});},imports(text){const end=ast.statements.filter(ts.isImportDeclaration).at(-1)?.end??0;edits.push({start:end,end,text:'\n'+text});},finish(){return apply(current,edits);}};
}
function prune(source,file,candidates){
 const ast=parse(file,source),used=new Set();const visit=n=>{if(ts.isImportDeclaration(n))return;if(ts.isIdentifier(n)&&!(ts.isPropertySignature(n.parent)&&n.parent.name===n))used.add(n.text);ts.forEachChild(n,visit);};visit(ast);const edits=[];
 for(const n of ast.statements.filter(ts.isImportDeclaration)){const bindings=n.importClause?.namedBindings;if(!bindings||!ts.isNamedImports(bindings))continue;const kept=bindings.elements.filter(e=>!candidates.includes(e.name.text)||used.has(e.name.text));if(kept.length===bindings.elements.length)continue;assert(!n.importClause.name);edits.push({start:n.getStart(ast),end:n.end,text:kept.length?`import ${n.importClause.isTypeOnly?'type ':''}{ ${kept.map(e=>e.getText(ast)).join(', ')} } from ${n.moduleSpecifier.getText(ast)};`:''});}
 return apply(source,edits);
}
export function renderSupports(file,source,reference){
 const current=lf(source),original=lf(reference);assert(!current.includes('supportRulesAdapter')&&!current.includes('supportActionsAdapter'),'Supports already applied');const e=editors(file,current,original);let unused=[];
 if(file==='src/engine/skills.ts'){
  e.body('supportFitsTags','  return supportTagsFit(sup, tags);');
  for(const [name,expression] of [
   ['socketsWithGrafts','rawSockets(inst)'],['hostSockets','hostSockets(inst)'],['crewBoardingOpen','boardingOpen(inst)'],['socketSpec','first(inst, key)'],
   ['minionSeatBoundFields','seatBoundFields(sup)'],['supportRidesMinions','ridesMinions(sup)'],['grantedTags','grantedTags(inst) as SkillTag[]'],['supportGlobalMods','globalModifiers(socket)'],
   ['standingSurface','standingSurface(inst)'],['supportMechanismsFit','mechanismsFit(sup, inst)'],['supportFitsInst','fits(sup, inst, rolled)'],
   ['crewSkillsServed','crewServed(sup, inst, crew)'],['supportFitsInstOrCrew','fitsOrCrew(sup, inst, crew, rolled)'],
   ['effectiveSkillLevel','effectiveLevel(inst)'],['instanceInnateMods','innateModifiers(inst)'],['instanceMods','modifiers(inst)'],
  ])e.body(name,'  return sdkSupportRules().'+expression+';');
  e.remove('supportFitsOwnInst');
  const names=['periodicConstruct','cooldown','engagement','affliction','strikes','flight','displaces','bankless','guard','surface','construct','status','pour','landing'];
  e.replace('SUPPORT_MECHANISMS',"export const SUPPORT_MECHANISMS: Record<string, (inst: SkillInstance, param?: string) => boolean> = {\n"+names.map(name=>`  ${name}: (inst, param) => sdkSupportRules().builtinMechanism('${name}', inst, param),`).join('\n')+'\n};');
  e.imports("import {supportTagsFit} from '@hollow-wake/engine/skills/supports';\nimport {supportRules as sdkSupportRules} from './supportRulesAdapter';");
  unused=['STATUS_DEFS','tuneAilmentChance','attackSequenceOf','attackSequenceStatuses','attackSequenceSweepInstances','veinMechanisms','veinMods'];
 }else if(file==='src/engine/supportbase.ts'){
  e.body('rollVein','  return rollSupportCut(base, rand);');e.body('canonicalVein','  return canonicalSupportCut(base);');
  e.body('resolveVein','  return resolveSupportCut(base, rolled) as Record<string, SupportRollRow>;');
  e.body('veinMechanisms','  return supportCutMechanisms(base, rolled);');e.body('veinMods','  return supportCutModifiers(base, rolled);');
  e.imports("import {rollSupportCut,canonicalSupportCut,resolveSupportCut,supportCutMechanisms,supportCutModifiers} from '@hollow-wake/engine/skills/supports';");
 }else if(file==='src/engine/world.ts'){
  const world=e.ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');for(const name of ['sdkSupportActions','supportActionHost'])assert(!world.members.some(n=>n.name?.getText(e.ast)===name),'Support action member already exists');
  e.body('socketSupport','    return this.supportActionHost().socket(seat, uid, skillId);',true);
  e.body('unsocketSupport','    return this.supportActionHost().unsocket(seat, skillId, socketIndex);',true);
  e.body('unsocketBagSkill','    return this.supportActionHost().unsocketStored(seat, uid, socketIndex);',true);
  const end=world.members.at(-1).end;e.edits.push({start:end,end,text:`
  private sdkSupportActions?: ReturnType<typeof createSupportActions>;
  private supportActionHost(): ReturnType<typeof createSupportActions> {
    return this.sdkSupportActions ??= createSupportActions(this, {
      bagItem: (seat, uid) => this.bagItem(seat, uid),
      fail: (seat, key, reason) => this.failNote(seat.actor, key, reason),
    });
  }
`});
  e.imports("import {createSupportActions} from './supportActionsAdapter';");unused=['bagSkillSupport'];
 }else throw new Error('Unknown support adapter file: '+file);
 return prune(e.finish(),file,unused);
}
export function integrateSupports(game,write=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),outputs=[];
 for(const file of supportBridges)assert(!fs.existsSync(path.join(game,file)),'Refusing to overwrite support binding');
 for(const file of supportFiles){const reference=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(reference),lock.files[file]);const source=fs.readFileSync(path.join(game,file),'utf8');outputs.push({file,source,after:renderSupports(file,source,reference.toString())});}
 if(write){for(const {file,source,after} of outputs)fs.writeFileSync(path.join(game,file),after.replaceAll('\n',source.includes('\r\n')?'\r\n':'\n'));for(const file of supportBridges)fs.copyFileSync(path.join(root,'adapters/hollow-wake',path.basename(file)),path.join(game,file));}
 return {files:[...supportFiles,...supportBridges]};
}
