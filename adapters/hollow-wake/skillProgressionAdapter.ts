import {AbilityRules,SkillTreeRules,type AbilityTuning} from '@hollow-wake/engine/skills/progression';
import type {CompiledSkillTree} from '@hollow-wake/engine/skills/tree';
import type {SkillDef,SkillTreeNode} from './skills';

// This cache belongs to the game's authored registry, never to the SDK. Keep
// numeric edits live; topology follows the game's existing spec-identity cache.
let economy:AbilityRules|undefined,treeEconomy:AbilityRules|undefined;
const same=(rules:AbilityRules|undefined,tuning:AbilityTuning)=>rules?.tuning.supportMaxLevel===tuning.supportMaxLevel
 && rules.tuning.bands.length===tuning.bands.length&&rules.tuning.bands.every((v,i)=>v===tuning.bands[i])
 && rules.tuning.cost.base===tuning.cost.base&&rules.tuning.cost.perStep===tuning.cost.perStep&&rules.tuning.cost.supportMul===tuning.cost.supportMul
 && rules.tuning.empowerment.reward.pointsPerRank===tuning.empowerment.reward.pointsPerRank&&rules.tuning.empowerment.reward.kind===tuning.empowerment.reward.kind;
export function abilityRules(bands:readonly number[],supportMaxLevel:number,cost:AbilityTuning['cost'],reward:AbilityTuning['empowerment']['reward']):AbilityRules{
 const tuning={bands,supportMaxLevel,cost,empowerment:{reward}};if(!same(economy,tuning))economy=new AbilityRules(tuning);return economy!;
}
const trees=new WeakMap<SkillDef,{graph:CompiledSkillTree<SkillTreeNode>|undefined;ability:AbilityRules;rules:SkillTreeRules<SkillTreeNode>}>();
export function skillTreeRules(def:SkillDef,graph:CompiledSkillTree<SkillTreeNode>|undefined,bands:readonly number[],supportMaxLevel:number,reward:AbilityTuning['empowerment']['reward']):SkillTreeRules<SkillTreeNode>{
 const tuning={bands,supportMaxLevel,cost:{base:0,perStep:0,supportMul:1},empowerment:{reward}};
 if(!same(treeEconomy,tuning))treeEconomy=new AbilityRules(tuning);
 const hit=trees.get(def);if(hit&&hit.graph===graph&&hit.ability===treeEconomy)return hit.rules;
 const rules=new SkillTreeRules(def,treeEconomy!,graph);trees.set(def,{graph,ability:treeEconomy!,rules});return rules;
}
const empty=Object.freeze({node:(_id:string):SkillTreeNode|undefined=>undefined});
const lookups=new WeakMap<CompiledSkillTree<SkillTreeNode>,typeof empty>();
export function skillNodeLookup(graph:CompiledSkillTree<SkillTreeNode>|undefined):typeof empty{
 if(!graph)return empty;let lookup=lookups.get(graph);if(!lookup){lookup={node:id=>graph.nodes.get(id)?.node};lookups.set(graph,lookup);}return lookup;
}
