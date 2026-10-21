import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {compileSkillTree,sealedSkillNodes,skillTreePrerequisite,skillTreeSealName} from '../dist/skill-tree.js';
import {AbilityRules,SkillTreeRules,SkillProgression,empowermentRank,empowermentNumeral} from '../dist/skill-progression.js';
import {skillProgressionPack} from '../scripts/compile-skill-progression.mjs';
import {foldSkillTreeOverrides,foldSkillTreeModifiers,resolveSkillTreeEffects,resolveSkillTreeChannel,resolveSkillTreeCastCycle} from '../dist/skill-tree-grants.js';
const observed=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-nineteen/skill-progression.json.gz',import.meta.url))));
const wire=value=>JSON.parse(JSON.stringify(value));
function graphView(g){return wire({nodes:[...g.nodes].map(([id,n])=>({id,links:n.links,excludes:[...n.excludes],ranks:n.ranks,depth:n.depth,children:n.children,limbId:n.limbId??null,x:n.x,y:n.y,kind:n.kind})),order:g.order,rootChildren:g.rootChildren,limbs:g.limbs.map(b=>({id:b.id,name:b.name,description:b.description,rungs:b.rungs.map(n=>n.id)})),limbRoots:[...g.limbRoots],dupes:g.dupes,box:g.box});}
test('all original authored tree graphs, layouts, seals and prerequisite names match',()=>{
 let trees=0,states=0;
 for(const tree of observed.trees){
  const graph=compileSkillTree(tree.authored.tree,observed.authored.layout);assert.deepEqual(graphView(graph),tree.graph,tree.id);
  for(const {ids,expected} of [...tree.rows.flatMap(row=>[{ids:[],expected:row.before},{ids:row.ids,expected:row.after}]),...tree.allPayloads.map(row=>({ids:row.ids,expected:row.resolved}))]){
   const sealed=sealedSkillNodes(graph,ids);assert.deepEqual([...sealed],expected.sealed,tree.id);
   for(const node of expected.nodes){assert.equal(skillTreePrerequisite(graph,ids,node.id),node.missing,tree.id+'/'+node.id);assert.equal(skillTreeSealName(graph,ids,node.id,sealed),node.sealName,tree.id+'/'+node.id);}
   states++;
  }trees++;
 }
 assert.equal(trees,132);assert.equal(states,5148);
});
const tuning={bands:observed.authored.bands,supportMaxLevel:observed.authored.supportMaxLevel,cost:observed.authored.cost,empowerment:{reward:observed.authored.empowerment.reward}};
const ability=new AbilityRules(tuning);
function checkPolicy(rules,state,expected,label){
 assert.equal(empowermentRank(state),expected.rank,label);assert.equal(ability.empowermentPoints(state),expected.points,label);
 assert.deepEqual(rules.budget(state),expected.budget,label);assert.deepEqual(rules.abilityNodes(state),expected.abilityNodes,label);assert.equal(rules.open(state),expected.open,label);assert.equal(rules.spentBranch(state)??null,expected.branch,label);
 for(const node of expected.nodes){assert.equal(rules.refusal(state,node.id),node.refusal,label+'/'+node.id);assert.equal(rules.nodeRanks(state,node.id),node.ranks,label+'/'+node.id);assert.equal(rules.passive(node.id),node.passive,label+'/'+node.id);}
}
test('all original level bands, costs and empowerment normalization match',()=>{
 for(const row of observed.curves){assert.equal(ability.tierForLevel(row.level),row.tier);assert.equal(ability.pointsAtLevel(row.level),row.points);assert.deepEqual(ability.skillLevelCost(row.level),row.skillCost);assert.deepEqual(ability.supportLevelCost(row.level),row.supportCost);}
 for(const row of observed.rankCases){const state={rarity:row.rarity,empowermentRank:row.rank};assert.equal(empowermentRank(state),row.value);assert.equal(ability.empowermentPoints(state),row.points);assert.equal(empowermentNumeral(row.rank),row.numeral);}
});
test('ordered purchases, point assignment and all original restoration diagnostics match',()=>{
 let spends=0,restores=0;
 for(const tree of observed.trees){const rules=new SkillTreeRules(tree.authored,ability,undefined,observed.authored.layout);assert.equal(rules.hasPassive(),tree.hasPassive,tree.id);
  for(const row of tree.rows){const state={level:row.level,rarity:row.rank?'legendary':'rare',empowermentRank:row.rank,treeNodes:[]};checkPolicy(rules,state,row.before,tree.id);
   for(const command of row.commands){const full=state.treeNodes.filter(id=>id===command.id).length>=rules.nodeRanks(state,command.id),refusal=rules.refusal(state,command.id),accepted=!full&&refusal===null;
    assert.deepEqual({full,refusal,accepted},{full:command.full,refusal:command.refusal,accepted:command.accepted},tree.id+'/'+command.id);
    if(accepted)state.treeNodes.push(command.id);assert.deepEqual(rules.budget(state),command.budget,tree.id);
   }assert.deepEqual(state.treeNodes,row.ids,tree.id);checkPolicy(rules,state,row.after,tree.id);spends++;
  }
  for(const row of tree.restores){const warnings=[],kept=rules.restore(row.ids,row.level??undefined,{rarity:row.rank?'legendary':'rare',empowermentRank:row.rank},(id,why)=>warnings.push(`[skill tree] '${tree.id}': dropped pick '${id}' (${why})`));assert.deepEqual(kept??null,row.kept,tree.id);assert.deepEqual(warnings,row.warnings,tree.id);restores++;}
 }
 assert.equal(spends,2376);assert.equal(restores,6336);
});
test('owned progression content is detached, immutable and independent of caller or character mutation',()=>{
 const pack=skillProgressionPack(),first=new SkillProgression(pack),second=new SkillProgression(pack),skill=pack.skills.find(s=>s.tree?.nodes?.length),id=skill.id,node=skill.tree.nodes[0];
 assert.equal(first.pack.skills.length,954);assert.equal(first.pack.supports.length,457);assert.notEqual(first.tree(id),second.tree(id));assert.notEqual(first.tree(id).node(node.id),node);
 const name=node.name;node.name='Caller changed';assert.equal(first.tree(id).node(node.id).name,name);assert.equal(second.tree(id).node(node.id).name,name);assert.throws(()=>{first.tree(id).node(node.id).name='Frozen';},TypeError);assert.throws(()=>{first.tree(id).ability=null;},TypeError);
 const state={level:20,treeNodes:[]};const initial=first.tree(id).budget(state);state.treeNodes.push('unknown');assert.equal(first.tree(id).budget(state).free,initial.free-1);assert.deepEqual(first.tree(id).budget({level:20,treeNodes:[]}),initial);
 for(const [method,key] of [['skill','missing'],['support','missing'],['tree','missing']])assert.throws(()=>first[method](key),/Unknown/);
 assert.throws(()=>new SkillProgression({...pack,skills:[pack.skills[0],pack.skills[0]]}),/duplicate/);
});
test('strict economy inputs, fractional reward normalization, overflow and restoration opening distinction are explicit',()=>{
 for(const bands of [[],[5,5],[10,5],[0],[1.5]])assert.throws(()=>new AbilityRules({...tuning,bands}));
 for(const level of [-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1]){assert.throws(()=>ability.tierForLevel(level));assert.throws(()=>ability.pointsAtLevel(level));}
 assert.equal(empowermentRank({rarity:'rare',empowermentRank:4}),0);for(const rank of [NaN,Infinity,-1,0,1.5])assert.equal(ability.empowermentPoints({rarity:'legendary',empowermentRank:rank}),0);
 const fractional=new AbilityRules({...tuning,empowerment:{reward:{kind:'passivePoints',pointsPerRank:0.5}}});assert.equal(fractional.empowermentPoints({rarity:'legendary',empowermentRank:1}),0);assert.equal(fractional.empowermentPoints({rarity:'legendary',empowermentRank:2}),1);
 const overflow=new AbilityRules({...tuning,empowerment:{reward:{kind:'passivePoints',pointsPerRank:2}}});assert.equal(overflow.empowermentPoints({rarity:'legendary',empowermentRank:Number.MAX_SAFE_INTEGER}),0);
 const rules=new SkillTreeRules({id:'s',tree:{level:5,neutral:{id:'p',name:'Passive'},nodes:[{id:'active',name:'Active'}]}},ability),state={level:1,rarity:'legendary',empowermentRank:1};
 assert.equal(rules.refusal(state,'p'),'the path opens at level 5');assert.deepEqual(rules.restore(['p'],1,state),['p']);assert.equal(rules.restore(['active'],1,state),undefined);assert.deepEqual(rules.restore(['active'],undefined,state),['active']);
 assert.equal(rules.nodeRanks({...state,empowermentRank:Number.MAX_SAFE_INTEGER},'p'),Number.MAX_SAFE_INTEGER+1);
 assert.equal(new SkillTreeRules({id:'no-tree'},ability).refusal({level:20},'p'),'no such path');
});
test('all original tree payload folds match, including deliberately exclusive resolver inputs',()=>{
 let states=0;
 for(const tree of observed.trees){const rules=new SkillTreeRules(tree.authored,ability,undefined,observed.authored.layout),before=JSON.stringify(tree.authored);
  for(const {ids,expected} of [...tree.rows.flatMap(row=>[{ids:[],expected:row.before},{ids:row.ids,expected:row.after}]),...tree.allPayloads.map(row=>({ids:row.ids,expected:row.resolved}))]){
   const over=foldSkillTreeOverrides(rules,ids);assert.deepEqual(wire(over??null),expected.over,tree.id+'/over');assert.deepEqual(wire(foldSkillTreeModifiers(rules,ids)??null),expected.mods,tree.id+'/mods');
   assert.deepEqual(wire(resolveSkillTreeEffects(rules,tree.authored.effects,ids,expected.effectsSuppressed,over)),expected.effects,tree.id+'/effects');
   assert.deepEqual(wire(resolveSkillTreeChannel(tree.authored.channel,over)??null),expected.channel,tree.id+'/channel');assert.deepEqual(wire(resolveSkillTreeCastCycle(tree.authored.castCycle,over)??null),expected.castCycle,tree.id+'/cycle');states++;
  }assert.equal(JSON.stringify(tree.authored),before,'Resolvers mutated '+tree.id);
 }assert.equal(states,5148);
});
test('borrowed payload references, ranked arrays, repeated modifiers and effect order remain explicit',()=>{
 const m={stat:'damage',kind:'flat',value:1},base=[{type:'buff',id:'old',duration:3,mods:[m]},{type:'heal',amount:4}],nodes=new Map([
  ['a',{over:{aura:{selfMods:[m]},summon:{selectPool:['z','a'],crewMods:[m]},channel:{ramp:{rate:2}}},mods:[m],buffs:[{id:'old',duration:5,mods:[m]},{id:'new',duration:1,mods:[m]},{id:'inert',mods:[m]}],utilityEffects:[{type:'ward',amount:1}]}],
  ['b',{over:{aura:{allyMods:[m]},summon:{selectPool:['b','a'],crewMods:[m]},channel:{ramp:{rate:3}}}}],
 ]),lookup={node:id=>nodes.get(id)},ids=['a','b','a'],over=foldSkillTreeOverrides(lookup,ids);
 assert.equal(foldSkillTreeOverrides(lookup),undefined);assert.equal(foldSkillTreeModifiers(lookup,['missing']),undefined);assert.equal(resolveSkillTreeEffects(lookup,base,[],false),base);assert.deepEqual(resolveSkillTreeEffects(lookup,base,[],true),[]);
 const single=foldSkillTreeOverrides(lookup,['b']);assert.notEqual(single,nodes.get('b').over);assert.notEqual(single.aura.allyMods,nodes.get('b').over.aura.allyMods);assert.equal(single.aura.allyMods[0],m);
 nodes.set('plain',{over:{construct:{radius:2}}});assert.equal(foldSkillTreeOverrides(lookup,['plain']),nodes.get('plain').over);
 assert.deepEqual(over.summon.selectPool,['a','b','z']);assert.equal(over.summon.crewMods.length,2);assert.equal(over.aura.selfMods.length,2);assert.equal(over.channel.ramp.rate,3);
 const mods=foldSkillTreeModifiers(lookup,ids);assert.deepEqual(mods,[m,m]);assert.equal(mods[0],m);
 const effects=resolveSkillTreeEffects(lookup,base,ids,false,over);assert.deepEqual(effects.map(e=>e.id??e.type),['old','heal','ward','new','ward']);assert.equal(effects[0].mods.length,3);assert.equal(effects[3].mods.length,2);assert.equal(effects[1],base[1]);assert.equal(base[0].mods.length,1);
 assert.equal(resolveSkillTreeChannel(undefined,over),undefined);const channel={rate:1};assert.equal(resolveSkillTreeChannel(channel,undefined),channel);assert.notEqual(resolveSkillTreeChannel(channel,over),channel);
});
test('graph ownership, alternate paths, duplicate precedence and bounded cycle reads are explicit',()=>{
 const spec={level:5,nodes:[{id:'root',name:'Root'},{id:'left',name:'Left',links:['root'],excludes:['right']},{id:'right',name:'Right',links:['root']},{id:'join',name:'Join',links:['left','right']},{id:'unknown',name:'Unknown',links:['retired']}]};
 const graph=compileSkillTree(spec),other=compileSkillTree(spec);assert.equal(graph.nodes.get('left').node,spec.nodes[1]);assert.notEqual(graph.nodes,other.nodes);assert.notEqual(graph.nodes.get('left').excludes,other.nodes.get('left').excludes);
 assert.deepEqual([...sealedSkillNodes(graph,['right'])],['left']);assert.equal(skillTreePrerequisite(graph,['right'],'join'),null);assert.equal(skillTreePrerequisite(graph,[],'join'),'Root');assert.equal(skillTreePrerequisite(graph,[],'unknown'),'retired');
 const duplicate=compileSkillTree({level:5,nodes:[{id:'first',name:'First'},{id:'first',name:'Ignored'}]});assert.equal(duplicate.nodes.get('first').node.name,'First');assert.deepEqual(duplicate.dupes,['first']);
 const cycle=compileSkillTree({level:5,nodes:[{id:'a',name:'A',links:['b']},{id:'b',name:'B',links:['a']}]});assert.throws(()=>skillTreePrerequisite(cycle,[],'a'),/Cyclic/);assert.throws(()=>skillTreeSealName(cycle,[],'a',new Set(['a','b'])),/Cyclic/);
 const chain=Array.from({length:4096},(_,i)=>({id:String(i),name:String(i),links:i?[String(i-1)]:[]}));assert.equal(compileSkillTree({level:1,nodes:chain}).order.length,4096);assert.throws(()=>compileSkillTree({level:1,nodes:[...chain,{id:'extra',name:'Extra'}]}),/4096/);
});
