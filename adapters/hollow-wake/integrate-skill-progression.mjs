import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';import {root,sha256} from '../../scripts/reference-utils.mjs';
export const skillProgressionFiles=['src/engine/skilltree.ts','src/engine/skills.ts','src/engine/skillEmpowerment.ts','src/engine/skillMerge.ts','src/data/essences.ts','src/engine/world.ts'];
export const skillProgressionBridges=['src/engine/skillProgressionAdapter.ts','src/engine/skillActionsAdapter.ts'];
const lf=s=>s.replaceAll('\r\n','\n'),parse=(file,s)=>ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true);
const apply=(s,edits)=>{for(const e of edits.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.text+s.slice(e.end);return s;};
function editTools(file,current,original){
 const ast=parse(file,current),base=parse(file,original),edits=[];
 const matches=(tree,name,methods=false)=>{const rows=methods?tree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World')?.members:tree.statements;return [...(rows??[])].filter(n=>n.name?.getText(tree)===name||(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)===name)));};
 const exact=(name,methods=false)=>{const now=matches(ast,name,methods),old=matches(base,name,methods);assert.equal(now.length,1,`Ambiguous skill declaration ${name}`);assert.equal(old.length,1);assert.equal(now[0].getText(ast),old[0].getText(base),`Unreviewed skill declaration ${name}`);return now[0];};
 return {ast,edits,body(name,text,methods=false){const n=exact(name,methods);assert(n.body);edits.push({start:n.body.pos,end:n.body.end,text:' {\n'+text+'\n}'});},replace(name,text){const n=exact(name);edits.push({start:n.getStart(ast),end:n.end,text});},remove(name){const n=exact(name);edits.push({start:n.getStart(ast),end:n.end,text:''});},imports(text){const end=ast.statements.filter(ts.isImportDeclaration).at(-1)?.end??0;edits.push({start:end,end,text:'\n'+text});},finish(){return apply(current,edits);}};
}
// Remove only imports made obsolete by these guarded replacements. References
// in unrelated source (including newly added consumers) keep their imports.
function prune(source,file,candidates){
 const ast=parse(file,source),used=new Set();const visit=n=>{if(ts.isImportDeclaration(n))return;if(ts.isIdentifier(n)&&!(ts.isPropertySignature(n.parent)&&n.parent.name===n))used.add(n.text);ts.forEachChild(n,visit);};visit(ast);const edits=[];
 for(const n of ast.statements.filter(ts.isImportDeclaration)){const bindings=n.importClause?.namedBindings;if(!bindings||!ts.isNamedImports(bindings))continue;const kept=bindings.elements.filter(e=>!candidates.includes(e.name.text)||used.has(e.name.text));if(kept.length===bindings.elements.length)continue;assert(!n.importClause.name,'Mixed default import needs explicit review');edits.push({start:n.getStart(ast),end:n.end,text:kept.length?`import ${n.importClause.isTypeOnly?'type ':''}{ ${kept.map(e=>e.getText(ast)).join(', ')} } from ${n.moduleSpecifier.getText(ast)};`:''});}
 return apply(source,edits);
}
export function renderSkillProgression(file,source,reference){
 const current=lf(source),original=lf(reference);assert(!current.includes('@hollow-wake/engine/skills/'),'Skill progression already applied');const e=editTools(file,current,original);
 const rules=def=>`sdkSkillTreeRules(${def}, treeGraph(${def}), SKILL_LEVEL_BANDS, MAX_SUPPORT_LEVEL, SKILL_EMPOWERMENT.reward)`;
 let unused=[];
 if(file==='src/engine/skilltree.ts'){
  e.replace('TreeGraphNode','export type TreeGraphNode = SkillGraphNode<SkillTreeNode>;');e.replace('TreeGraph','export type TreeGraph = CompiledSkillTree<SkillTreeNode>;');
  e.body('buildGraph','  return compileSkillTree(spec, TREE_LAYOUT_CFG);');for(const name of ['RawRow','DEG','round1','layoutGraph','fitBox'])e.remove(name);
  e.body('treeSpentCount','  return sdkSpentCount(spent, nodeId);');e.body('treeSealedSet','  return sealedSkillNodes(treeGraph(def), spent);');e.body('treeSealName','  return skillTreeSealName(treeGraph(def), spent, nodeId);');e.body('treePrereqMissing','  return skillTreePrerequisite(treeGraph(def), spent, nodeId);');
  e.imports("import {compileSkillTree,sealedSkillNodes,skillTreeSealName,skillTreePrerequisite,skillTreeSpentCount as sdkSpentCount,type CompiledSkillTree,type SkillGraphNode} from '@hollow-wake/engine/skills/tree';");
 }else if(file==='src/engine/skills.ts'){
  e.body('essenceTierForLevel','  return sdkTierForLevel(targetLevel, SKILL_LEVEL_BANDS);');e.body('bandPointsAt','  return sdkPointsAtLevel(level, SKILL_LEVEL_BANDS);');
  e.body('treeNodeRefusal',`  return ${rules('inst.def')}.refusal(inst, nodeId);`);
  e.body('validTreeNodes',`  return ${rules('def')}.restore(ids, level, opts, opts?.quiet ? undefined : (id, why) => console.warn(\`[skill tree] '\${def.id}': dropped pick '\${id}' (\${why})\`));`);
  e.body('treeSpentBranch',`  if (!inst.treeNodes?.length) return undefined;\n  const id = ${rules('inst.def')}.spentBranch(inst);\n  return id === undefined ? undefined : treeGraph(inst.def)?.limbs.find(limb => limb.id === id);`);
  const lookup='sdkSkillNodeLookup(treeGraph(inst.def))';
  e.body('instanceTreeOver',`  if (!inst.treeNodes?.length) return undefined;\n  return foldSkillTreeOverrides(${lookup}, inst.treeNodes);`);e.body('instanceTreeMods',`  if (!inst.treeNodes?.length) return undefined;\n  return foldSkillTreeModifiers(${lookup}, inst.treeNodes);`);
  e.body('instanceEffects',`  if (challengeDelivery(inst)) return [];\n  if (!inst.treeNodes?.length) return inst.def.effects;\n  return resolveSkillTreeEffects(${lookup}, inst.def.effects, inst.treeNodes, false);`);
  e.body('instanceChannel','  if (!inst.def.channel) return undefined;\n  return resolveSkillTreeChannel(inst.def.channel, instanceTreeOver(inst));');e.body('instanceCastCycle','  return resolveSkillTreeCastCycle(inst.def.castCycle, instanceTreeOver(inst));');
  // mergeTreeAura and mergeTreeDomain also serve native delivery resolution;
  // retain those readers. The rank helper now has no remaining local consumer.
  e.remove('rankTreeAura');
  e.imports("import {skillTierForLevel as sdkTierForLevel,skillPointsAtLevel as sdkPointsAtLevel} from '@hollow-wake/engine/skills/progression';\nimport {foldSkillTreeOverrides,foldSkillTreeModifiers,resolveSkillTreeEffects,resolveSkillTreeChannel,resolveSkillTreeCastCycle} from '@hollow-wake/engine/skills/grants';\nimport {skillTreeRules as sdkSkillTreeRules,skillNodeLookup as sdkSkillNodeLookup} from './skillProgressionAdapter';\nimport {SKILL_EMPOWERMENT} from '../data/skillEmpowerment';");
  unused=['empowermentPassive','treeInstanceNodeRanks','treePointBudget','treePrereqMissing','treeSealName','treeSealedSet','treeSpentCount'];
 }else if(file==='src/engine/skillEmpowerment.ts'){
  e.body('empowermentRank','  return sdkEmpowermentRank(copy);');e.body('empowermentNumeral','  return sdkEmpowermentNumeral(rank);');
  e.body('empowermentPoints',"  return SKILL_EMPOWERMENT.reward.kind === 'passivePoints' ? skillEmpowermentPoints(inst, SKILL_EMPOWERMENT.reward.pointsPerRank) : 0;");
  for(const [name,body] of [['empowermentPassive',`${rules('def')}.passive(nodeId)`],['hasEmpowermentPassive',`${rules('def')}.hasPassive()`],['treeAbilityNodes',`${rules('inst.def')}.abilityNodes(inst)`],['treePointBudget',`${rules('inst.def')}.budget(inst)`],['treeInstanceNodeRanks',`${rules('inst.def')}.nodeRanks(inst, nodeId)`]])e.body(name,'  return '+body+';');
  e.imports("import {empowermentRank as sdkEmpowermentRank,empowermentNumeral as sdkEmpowermentNumeral,skillEmpowermentPoints} from '@hollow-wake/engine/skills/progression';\nimport {skillTreeRules as sdkSkillTreeRules} from './skillProgressionAdapter';\nimport {SKILL_LEVEL_BANDS,MAX_SUPPORT_LEVEL} from './skills';");unused=['bandPointsAt','treeNodeRanks'];
 }else if(file==='src/data/essences.ts'){
  const ability='sdkAbilityRules(SKILL_LEVEL_BANDS, MAX_SUPPORT_LEVEL, ABILITY_ESSENCE_CFG.cost, SKILL_EMPOWERMENT.reward)';
  e.body('skillLevelAbilityCost',`  return ${ability}.skillLevelCost(targetLevel);`);e.body('supportLevelAbilityCost',`  return ${ability}.supportLevelCost(targetLevel);`);
  e.imports("import {abilityRules as sdkAbilityRules} from '../engine/skillProgressionAdapter';\nimport {MAX_SUPPORT_LEVEL} from '../engine/skills';\nimport {SKILL_EMPOWERMENT} from './skillEmpowerment';");unused=['essenceTierForLevel'];
 }else if(file==='src/engine/skillMerge.ts'){
  e.body('skillMergePlan',`  return planSkillMerge(items, skillId, rarity, {merge: FONT_CFG.merge, rarities: Object.keys(SKILL_RARITIES), empowerment: SKILL_EMPOWERMENT}, {\n    payload: item => skillGemPayloadOf(item) ?? undefined, locked: item => !!item.locked, known: id => !!SKILLS[id],\n    restore: item => skillOfGemItem(item) ?? undefined, create: (id, level, next) => makeSkillGem(SKILLS[id], level, next as SkillRarity),\n  });`);
  e.imports("import {planSkillMerge} from '@hollow-wake/engine/skills/actions';");unused=['empowermentRank','SkillGemPayload'];
 }else if(file==='src/engine/world.ts'){
  const world=e.ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');for(const name of ['sdkSkillActions','skillActionHost'])assert(!world.members.some(n=>n.name?.getText(e.ast)===name),'Skill action member already exists');
  for(const [name,body] of [['fontMergeSkill','return this.skillActionHost().merge(seat, skillId, rarity);'],['fontConvertEssence','return this.skillActionHost().convert(seat, tier, dir);'],['fontResetTree','return this.skillActionHost().reset(seat, skillId);'],['canAffordAbilityEssence','return this.skillActionHost().canAfford(seat, cost);'],['spendAbilityEssence','return this.skillActionHost().spend(seat, cost, noteKey);'],['grantAbilityEssence','this.skillActionHost().grant(seat, tier, count);'],['levelUpSkill','return this.skillActionHost().levelSkill(seat, skillId);'],['levelUpSupport','return this.skillActionHost().levelSupport(seat, gem);'],['pickTreeNode','this.skillActionHost().pick(seat, skillId, nodeId);']])e.body(name,'    '+body,true);
  const end=world.members.at(-1).end;e.edits.push({start:end,end,text:`
  private sdkSkillActions?: ReturnType<typeof createSkillActions>;
  private skillActionHost(): ReturnType<typeof createSkillActions> {
    return this.sdkSkillActions ??= createSkillActions(this, {
      awaken: (seat, inst) => {
        const id = inst.def.id, queue = this.pendingTreePips.get(seat.id) ?? [];
        if (!queue.includes(id)) { queue.push(id); this.pendingTreePips.set(seat.id, queue); }
        (inst.state ??= {}).treeAwokeAt = this.time;
        this.flashes.push({ pos: vec(seat.actor.pos.x, seat.actor.pos.y), radius: seat.actor.radius + 14, color: '#d8b86a', life: 0.9, maxLife: 0.9 });
      },
      dismiss: (seat, id) => this.dismissSummonToggle(seat.actor, id),
      clearSummons: (seat, inst) => this.clearSummonTreeBodies(seat.actor, inst),
      clearFields: (seat, inst) => this.clearTreeFields(seat.actor, inst),
      fail: (seat, key, reason) => this.failNote(seat.actor, key, reason),
    });
  }
`});
  e.imports("import {createSkillActions} from './skillActionsAdapter';");unused=['skillMergePlan','skillInstanceName','skillMaxLevel','supportMaxLevel','bandPointsAt','treeNodeRefusal','treeNodeOf','treeSpentCount','treeInstanceNodeRanks','skillLevelAbilityCost','supportLevelAbilityCost','FONT_CFG','SKILL_RARITIES','essenceTierForLevel'];
 }else throw new Error('Unknown skill progression source: '+file);
 return prune(e.finish(),file,unused);
}
export function integrateSkillProgression(game,write=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),outputs=[];
 for(const file of skillProgressionBridges)assert(!fs.existsSync(path.join(game,file)),'Refusing to overwrite skill progression binding');
 for(const file of skillProgressionFiles){const reference=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(reference),lock.files[file]);const source=fs.readFileSync(path.join(game,file),'utf8');outputs.push({file,source,after:renderSkillProgression(file,source,reference.toString())});}
 if(write){for(const {file,source,after} of outputs)fs.writeFileSync(path.join(game,file),after.replaceAll('\n',source.includes('\r\n')?'\r\n':'\n'));for(const file of skillProgressionBridges)fs.copyFileSync(path.join(root,'adapters/hollow-wake',path.basename(file)),path.join(game,file));}
 return {files:[...skillProgressionFiles,...skillProgressionBridges]};
}
