import fs from 'node:fs';import path from 'node:path';
import {bootSimEngine} from '../src/sim/arena';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';
import {SKILL_LEVEL_BANDS,MAX_SUPPORT_LEVEL,bandPointsAt,essenceTierForLevel,makeSkillGem,skillMaxLevel,supportMaxLevel,treeNodeRefusal,validTreeNodes,treeSpentBranch,treePickOpen,instanceTreeOver,instanceTreeMods,instanceEffects,instanceChannel,instanceCastCycle,type SkillDef,type SkillInstance} from '../src/engine/skills';
import {treeGraph,treeSealedSet,treeSealName,treePrereqMissing,TREE_LAYOUT_CFG} from '../src/engine/skilltree';
import {empowermentRank,empowermentNumeral,empowermentPassive,hasEmpowermentPassive,empowermentPoints,treeAbilityNodes,treePointBudget,treeInstanceNodeRanks} from '../src/engine/skillEmpowerment';
import {ABILITY_ESSENCE_CFG,ABILITY_ESSENCES,FONT_CFG,skillLevelAbilityCost,supportLevelAbilityCost} from '../src/data/essences';
import {SKILL_EMPOWERMENT} from '../src/data/skillEmpowerment';
import {challengeDelivery} from '../src/engine/challengeSpec';

bootSimEngine();
const wire=(value:unknown):any=>JSON.parse(JSON.stringify(value));
const authored={bands:[...SKILL_LEVEL_BANDS],supportMaxLevel:MAX_SUPPORT_LEVEL,cost:{...ABILITY_ESSENCE_CFG.cost},essences:wire(ABILITY_ESSENCES),font:wire(FONT_CFG),empowerment:wire(SKILL_EMPOWERMENT),layout:wire(TREE_LAYOUT_CFG),
 skills:Object.values(SKILLS).map(d=>({id:d.id,name:d.name,maxLevel:skillMaxLevel(d)})),supports:Object.values(SUPPORTS).map(d=>({id:d.id,name:d.name,maxLevel:supportMaxLevel(d)}))};
const curves=Array.from({length:257},(_,level)=>({level,tier:essenceTierForLevel(level),points:bandPointsAt(level),skillCost:skillLevelAbilityCost(level),supportCost:supportLevelAbilityCost(level)}));
const instance=(def:SkillDef,level:number,rank:number,ids:readonly string[])=>{const inst=makeSkillGem(def,level,rank?'legendary':'rare');inst.empowermentRank=rank;inst.treeNodes=[...ids];return inst;};
function snapshot(inst:SkillInstance){const g=treeGraph(inst.def)!;return wire({
 rank:empowermentRank(inst),points:empowermentPoints(inst),budget:treePointBudget(inst),abilityNodes:treeAbilityNodes(inst),open:treePickOpen(inst),branch:treeSpentBranch(inst)?.id??null,
 sealed:[...treeSealedSet(inst.def,inst.treeNodes??[])],nodes:[...g.nodes].map(([id])=>({id,refusal:treeNodeRefusal(inst,id),ranks:treeInstanceNodeRanks(inst,id),passive:empowermentPassive(inst.def,id),missing:treePrereqMissing(inst.def,inst.treeNodes??[],id),sealName:treeSealName(inst.def,inst.treeNodes??[],id)})),
 over:instanceTreeOver(inst)??null,mods:instanceTreeMods(inst)??null,effects:instanceEffects(inst),effectsSuppressed:!!challengeDelivery(inst),channel:instanceChannel(inst)??null,castCycle:instanceCastCycle(inst)??null,
});}
function restoration(def:SkillDef,ids:string[],level:number|undefined,rank:number){
 const warnings:string[]=[],previous=console.warn;console.warn=(...args:unknown[])=>warnings.push(args.join(' '));
 try{return {ids,level:level??null,rank,kept:validTreeNodes(def,ids,level,{rarity:rank?'legendary':'rare',empowermentRank:rank})??null,warnings};}
 finally{console.warn=previous;}
}
const trees=[];
for(const def of Object.values(SKILLS).filter(d=>d.tree)){
 const g=treeGraph(def)!,rows:any[]=[],restores:any[]=[];
 const graph=wire({nodes:[...g.nodes].map(([id,n])=>({id,links:n.links,excludes:[...n.excludes],ranks:n.ranks,depth:n.depth,children:n.children,limbId:n.limbId??null,x:n.x,y:n.y,kind:n.kind})),order:g.order,rootChildren:g.rootChildren,limbs:g.limbs.map(b=>({id:b.id,name:b.name,description:b.description,rungs:b.rungs.map(n=>n.id)})),limbRoots:[...g.limbRoots],dupes:g.dupes,box:g.box});
 for(const level of [1,4,5,10,20,21])for(const rank of [0,1,3]){
  const inst=instance(def,level,rank,[]),before=snapshot(inst),commands:any[]=[];
  // Source-order candidates, repeats and rivals exercise rank caps and point
  // consumption. The original World owns the silent full-rank no-op above its
  // refusal function; preserve that distinction in these pure observations.
  for(const id of [...g.order,...g.order,...g.order].slice(0,96)){
   const have=inst.treeNodes!.filter(p=>p===id).length,full=have>=treeInstanceNodeRanks(inst,id),refusal=treeNodeRefusal(inst,id);
   const accepted=!full&&refusal===null;if(accepted)inst.treeNodes!.push(id);
   commands.push({id,full,refusal,accepted,budget:treePointBudget(inst)});
  }
  rows.push({level,rank,before,commands,ids:[...inst.treeNodes!],after:snapshot(inst)});
 }
 const first=g.order[0],passive=g.order.find(id=>empowermentPassive(def,id));
 const candidates=[[],[...g.order],[...g.order].reverse(),['missing',...g.order,...g.order],...(first?[[first,first,first,first,first,first]]:[]),...(passive?[[passive,passive,passive,passive,passive]]:[])];
 for(const ids of candidates)for(const level of [undefined,1,5,20])for(const rank of [0,2])restores.push(restoration(def,ids,level,rank));
 // Every authored payload participates, even when normal budgets cannot choose
 // all mutually exclusive nodes simultaneously. These are resolver inputs,
 // deliberately separate from legal player builds.
 const allPayloads=[g.order,[...g.order,...g.order], [...g.order].reverse()].map(ids=>({ids:[...ids],resolved:snapshot(instance(def,20,3,ids))}));
 trees.push({id:def.id,authored:wire({id:def.id,name:def.name,tree:def.tree,effects:def.effects,channel:def.channel,castCycle:def.castCycle}),hasPassive:hasEmpowermentPassive(def),graph,rows,restores,allPayloads});
}
const rankCases=[0,1,3,-1,1.5,3999,4000,4001,1000000,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1].flatMap(rank=>['common','legendary'].map(rarity=>({rank,rarity,value:empowermentRank({rarity,empowermentRank:rank}),points:empowermentPoints({rarity,empowermentRank:rank}),numeral:empowermentNumeral(rank)})));
const output=process.argv[2];fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'skill-progression.json'),JSON.stringify({authored,curves,trees,rankCases})+'\n');
console.log(JSON.stringify({skills:authored.skills.length,supports:authored.supports.length,trees:trees.length,nodeRows:trees.reduce((n,t)=>n+t.graph.nodes.length,0),spendScenarios:trees.reduce((n,t)=>n+t.rows.length,0),restores:trees.reduce((n,t)=>n+t.restores.length,0),payloadViews:trees.reduce((n,t)=>n+t.allPayloads.length,0)}));
