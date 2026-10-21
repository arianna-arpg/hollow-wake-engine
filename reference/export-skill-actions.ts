import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';import {CLASSES} from '../src/data/classes';import {NullInput} from '../src/net/intent';
import {ABILITY_ESSENCES,ABILITY_ESSENCE_CFG,FONT_CFG,skillLevelAbilityCost} from '../src/data/essences';import {SKILL_EMPOWERMENT} from '../src/data/skillEmpowerment';
import {makeSkillGem,instanceMods,instanceEffects,instanceTreeOver,instanceChannel,instanceCastCycle,instanceTrigger,SKILL_RARITIES,type SkillInstance,type SkillRarity} from '../src/engine/skills';
import {treeGraph} from '../src/engine/skilltree';import {treePointBudget,empowermentPassive} from '../src/engine/skillEmpowerment';import {skillMergePlan} from '../src/engine/skillMerge';
import {packSkillGemPayload,skillOfGemItem,freeCellCount} from '../src/engine/gemitems';import {serializeCharacter,rebuildSkill,rebuildSavedMeta} from '../src/meta/character';import {serializeSeatMeta,applySeatMeta} from '../src/net/snapshot';import {skillToLoot} from '../src/meta/death';
import type {Seat} from '../src/engine/world';
bootSimEngine();const wire=(v:unknown):any=>JSON.parse(JSON.stringify(v)),scenarios:any[]=[],saved:any[]=[];
type World=ReturnType<typeof makeSimWorld>;
function course(name:string,work:(w:World,step:(name:string,action:()=>unknown)=>void)=>void){
 const restore=seedGlobalRandom(190000+scenarios.length);
 try{
  const w=makeSimWorld('swashbuckler',190000+scenarios.length),anyWorld:any=w;w.time=12.5;w.fonts.push({pos:{...w.player.pos}});
  const skill=(s:SkillInstance)=>wire({payload:packSkillGemPayload(s),state:s.state??null,replenishmentPaused:s.replenishmentPaused??null,budget:treePointBudget(s),mods:instanceMods(s),over:instanceTreeOver(s)??null,effects:instanceEffects(s),channel:instanceChannel(s)??null,cycle:instanceCastCycle(s)??null,trigger:instanceTrigger(s)??null});
  const snapshot=()=>wire({seats:w.seats.map(s=>({id:s.id,wallet:s.meta.abilityEssences,skills:[...s.meta.knownSkills].map(([id,inst])=>({id,...skill(inst)})),granted:[...(s.grantedInsts??[])].map(([id,inst])=>({id,...skill(inst)})),
   items:s.meta.items.map(i=>({gem:i.gem??null,locked:i.locked??false,x:i.x,y:i.y})),life:s.actor.life,mana:s.actor.mana,maxLife:s.actor.maxLife(),maxMana:s.actor.maxMana(),casting:!!s.actor.casting,cycles:[...s.actor.castCycles],toggles:[...s.actor.summonToggles.keys()]})),
   dirty:[...w.metaDirty],charDirty:w.charDirty,pips:[...anyWorld.pendingTreePips],flashes:w.flashes.map(f=>({pos:f.pos,radius:f.radius,color:f.color,life:f.life,maxLife:f.maxLife})),
   drops:w.drops.map(d=>({pos:d.pos,item:d.item.kind==='skill'?{kind:'skill',payload:packSkillGemPayload(d.item.inst)}:d.item.kind==='support'?{kind:'support',support:d.item.gem.def.id,level:d.item.gem.level,locked:d.item.gem.locked}:d.item.kind})),pendingRepeats:anyWorld.pendingRepeats.length,pickups:w.pickupFeed});
  let events:any[]=[];let recording=false;
  for(const name of ['markMetaDirty','recalcSeat','text','failNote','dismissSummonToggle','clearSummonTreeBodies','clearTreeFields','grantSkillGemItem','grantSupportGemItem']){
   const original=anyWorld[name];anyWorld[name]=function(...args:any[]){
    const detail=name==='text'?{position:wire(args[0]),text:args[1],color:args[2],size:args[3],style:args[4]??null}:name==='failNote'?{key:args[1],reason:args[2]}:name.startsWith('grant')?{kind:args[1]?.def?.id,overflow:args[2]??false}:name==='dismissSummonToggle'?{skill:args[1]}:name.startsWith('clear')?{skill:args[1]?.def?.id}:{};
    if(recording)events.push({name,phase:'before',...detail,state:snapshot()});const result=original.apply(this,args);if(recording)events.push({name,phase:'after',state:snapshot()});return result;
   };
  }
  const rows:any[]=[];work(w,(label,action)=>{w.metaDirty.clear();w.charDirty=false;events=[];const before=snapshot();recording=true;let result;try{result=action();}finally{recording=false;}rows.push(wire({name:label,result:result??null,before,after:snapshot(),events}));});scenarios.push({name,rows});
 }finally{restore();}
}
const fund=(seat:Seat,amount=999)=>{for(const e of ABILITY_ESSENCES)seat.meta.abilityEssences[e.id]=amount;};
const seed=(w:World,id:string,level=20,rank=2,seat=w.localSeat)=>{const inst=makeSkillGem(SKILLS[id],level,rank?'legendary':'rare');inst.empowermentRank=rank;seat.meta.knownSkills=new Map([[id,inst]]);seat.actor.skills=[inst];w.recalcSeat(seat);return inst;};
course('level-wallet-and-supports',(w,step)=>{
 const s=w.localSeat,inst=seed(w,'wild_strike',1,0);fund(s,0);
 step('empty-wallet',()=>w.levelUpSkill(inst.def.id));s.meta.abilityEssences.ability2=999;step('wrong-tier',()=>w.levelUpSkill(inst.def.id));fund(s);
 for(let level=2;level<=20;level++)step('level-'+level,()=>w.levelUpSkill(inst.def.id));step('skill-cap',()=>w.levelUpSkill(inst.def.id));step('unknown-skill',()=>w.levelUpSkill('missing'));
 const granted=makeSkillGem(SKILLS.fireball,1,'rare');s.grantedInsts??=new Map();s.grantedInsts.set(granted.def.id,granted);step('gear-granted-level-refusal',()=>w.levelUpSkill(granted.def.id));
 const carried=w.grantSupportGemItem(s,{def:SUPPORTS.splitting,level:1})!;fund(s,0);step('carried-support-poor',()=>w.applyAction(s,{t:'levelSupportInv',uid:carried.uid}));fund(s);
 for(let level=2;level<=6;level++)step('carried-support-'+level,()=>w.applyAction(s,{t:'levelSupportInv',uid:carried.uid}));
 const support={def:SUPPORTS.multistrike,level:1};inst.sockets[0]=support;for(let level=2;level<=6;level++)step('socketed-support-'+level,()=>w.levelUpSupport(support));
 const remote=w.addSeat('remote',CLASSES[0],new NullInput(),{startingCompanions:false,startingFlasks:false});seed(w,'wild_strike',4,0,remote);fund(remote);step('remote-level-milestone',()=>w.levelUpSkill('wild_strike',remote));
 inst.level=4;(w as any).memorySecondaryRefusal=()=> 'observed account gate';step('gated-milestone-still-levels',()=>w.levelUpSkill(inst.def.id));
 const c=ABILITY_ESSENCE_CFG.cost as {base:number;perStep:number;supportMul:number},before={...c};try{c.base=3;c.perStep=1;c.supportMul=1.5;inst.level=4;support.level=1;step('live-skill-price',()=>w.levelUpSkill(inst.def.id));step('live-support-price',()=>w.levelUpSupport(support));}finally{Object.assign(c,before);}
});
course('wallet-grants-and-font-conversion',(w,step)=>{
 const s=w.localSeat;fund(s,0);for(const count of [-1,0,.5,2])step('grant-'+count,()=>w.grantAbilityEssence(s,2,count));
 for(const tier of [-1,0,1,4,8])step('clamped-grant-tier-'+tier,()=>w.grantAbilityEssence(s,tier,1));
 for(const cost of [{tier:1,count:0},{tier:2,count:.5},{tier:2,count:999}]){step('afford-'+JSON.stringify(cost),()=>w.canAffordAbilityEssence(s,cost));step('spend-'+JSON.stringify(cost),()=>w.spendAbilityEssence(s,cost,'capture-spend'));}
 for(const tier of [-1,0,1,2,4,5,1.5])for(const dir of ['up','down'] as const){fund(s);step(`convert-${tier}-${dir}`,()=>w.fontConvertEssence(tier,dir));}
 fund(s,0);step('up-poor',()=>w.fontConvertEssence(1,'up'));step('down-poor',()=>w.fontConvertEssence(2,'down'));fund(s);w.fonts=[];step('away-from-font',()=>w.fontConvertEssence(1,'up'));
 const save=serializeCharacter(w),rebuilt=rebuildSavedMeta(save)!;saved.push({name:'wallet',saved:save.abilityEssences,restored:rebuilt.meta.abilityEssences});
 const snapshot=serializeSeatMeta(s);fund(s,0);step('wallet-wire-roundtrip',()=>applySeatMeta(w,s,snapshot));
});
for(const def of Object.values(SKILLS).filter(d=>d.tree))course('tree-'+def.id,(w,step)=>{
 const s=w.localSeat,inst=seed(w,def.id),g=treeGraph(def)!;fund(s);const first=g.order[0],passive=g.order.find(id=>empowermentPassive(def,id));
 // Permission gates are controlled host inputs here; original gating itself is
 // separately exercised by the game's existing ability/empowerment probes.
 (w as any).memorySecondaryRefusal=()=>null;
 step('unknown-node',()=>w.pickTreeNode(def.id,'missing'));
 if(first){inst.level=1;step('below-opening',()=>w.pickTreeNode(def.id,first));inst.level=20;
  (w as any).memorySecondaryRefusal=()=> 'observed account gate';step('memory-gate',()=>w.pickTreeNode(def.id,first));(w as any).memorySecondaryRefusal=()=>null;
  const swap=w.swapRefusal;(w as any).swapRefusal=()=> 'observed combat gate';step('discipline-gate',()=>w.pickTreeNode(def.id,first));w.swapRefusal=swap;
 }
 if(g.order.length>1)step('last-before-prerequisite',()=>w.pickTreeNode(def.id,g.order.at(-1)!));
 for(const id of g.order)step('pick-'+id,()=>w.pickTreeNode(def.id,id));
 if(passive)for(let i=0;i<4;i++)step('passive-repeat-'+i,()=>w.pickTreeNode(def.id,passive));
 if(first)step('already-full',()=>w.pickTreeNode(def.id,first));
 const save=serializeCharacter(w),row=save.knownSkills.find(r=>r.skillId===def.id)!,restored=rebuildSkill(row)!;
 saved.push({name:def.id,save:row,restored:packSkillGemPayload(restored),loot:skillToLoot(inst)});
 const snap=serializeSeatMeta(s);step('tree-wire-roundtrip',()=>applySeatMeta(w,s,snap));const live=s.meta.knownSkills.get(def.id)!;
 const has=live.treeNodes?.length??0;
 fund(s,0);step('reset-poor',()=>w.fontResetTree(def.id));fund(s);const fonts=w.fonts;w.fonts=[];step('reset-away',()=>w.fontResetTree(def.id));w.fonts=fonts;
 (w as any).memorySecondaryRefusal=()=> 'observed account gate';step('reset-memory-gate',()=>w.fontResetTree(def.id));(w as any).memorySecondaryRefusal=()=>null;
 const swap=w.swapRefusal;(w as any).swapRefusal=()=> 'observed combat gate';step('reset-discipline-gate',()=>w.fontResetTree(def.id));w.swapRefusal=swap;
 live.state={...live.state,triggerOff:true,trigDepth:2};live.replenishmentPaused=true;s.actor.castCycles.set(def.id,3);
 // Controlled pending records verify that the native cleanup runs before the
 // investment is removed. Their execution is deliberately outside this course.
 (w as any).pendingRepeats.push({caster:s.actor,inst:live});
 step('reset-funded',()=>w.fontResetTree(def.id));if(has)assert.equal(live.treeNodes,undefined);step('reset-empty',()=>w.fontResetTree(def.id));
 if(passive)step('rechoose-passive',()=>w.pickTreeNode(def.id,passive));
});
for(const rarity of Object.keys(SKILL_RARITIES) as SkillRarity[])course('merge-'+rarity,(w,step)=>{
 const s=w.localSeat;s.meta.items=[];
 const grant=(level:number,rank=0,locked=false,granted=false)=>{const inst=makeSkillGem(SKILLS.wild_strike,level,rarity);inst.empowermentRank=rank;inst.granted=granted;inst.sockets[0]={def:SUPPORTS.splitting,level:3,locked:true};if(rarity==='legendary'){inst.treeNodes=['ws_economy'];inst.attunedForm='dire_wolf';inst.replenishmentPaused=true;}const item=w.grantSkillGemItem(s,inst)!;item.locked=locked;return item;};
 grant(10,2);grant(20,1);grant(20,8,true);grant(20,10,false,true);
 const need=rarity==='legendary'?SKILL_EMPOWERMENT.copiesPerMerge:FONT_CFG.merge[rarity]!;for(let i=2;i<need;i++)grant(5+i);
 const preview=()=>{const p=skillMergePlan(s.meta.items,'wild_strike',rarity);return {need:p.need,available:p.available,barred:p.barred,taken:p.taken.map(i=>s.meta.items.indexOf(i)),returnSockets:p.returnSockets.map(i=>s.meta.items.indexOf(i)),result:p.result?packSkillGemPayload(p.result):null,refusal:p.refusal};};
 step('preview',preview);const fonts=w.fonts;w.fonts=[];step('merge-away',()=>w.fontMergeSkill('wild_strike',rarity));w.fonts=fonts;
 step('merge',()=>w.fontMergeSkill('wild_strike',rarity));step('merge-short',()=>w.fontMergeSkill('wild_strike',rarity));step('merge-unknown',()=>w.fontMergeSkill('missing',rarity));
 if(rarity==='legendary'){
  grant(20);step('merge-repeat',()=>w.fontMergeSkill('wild_strike',rarity));grant(20);const before={...SKILL_EMPOWERMENT};
  try{SKILL_EMPOWERMENT.enabled=false;step('disabled',()=>w.fontMergeSkill('wild_strike',rarity));SKILL_EMPOWERMENT.enabled=true;SKILL_EMPOWERMENT.maxRank=1;step('rank-cap',()=>w.fontMergeSkill('wild_strike',rarity));SKILL_EMPOWERMENT.maxRank=null;SKILL_EMPOWERMENT.preserveDonorRanks=false;SKILL_EMPOWERMENT.ranksPerMerge=2;step('live-rank-policy',()=>w.fontMergeSkill('wild_strike',rarity));}finally{Object.assign(SKILL_EMPOWERMENT,before);}
  s.meta.items=[];for(let i=0;i<2;i++){const inst=makeSkillGem(SKILLS.wild_strike,20,'legendary');inst.sockets=Array.from({length:4},()=>({def:SUPPORTS.splitting,level:3,locked:true}));w.grantSkillGemItem(s,inst);}while(freeCellCount(s.meta.items)>0)w.grantSupportGemItem(s,{def:SUPPORTS.multistrike,level:1});
  step('full-bag-overflow',()=>w.fontMergeSkill('wild_strike',rarity));assert.equal(w.drops.filter(d=>d.item.kind==='support').length,3);assert(skillOfGemItem(s.meta.items.find(i=>i.gem?.kind==='skill')!));
 }
});
const authored={essences:ABILITY_ESSENCES,font:FONT_CFG,empowerment:SKILL_EMPOWERMENT,rarities:Object.entries(SKILL_RARITIES).map(([id,row])=>({id,...row}))};
const output=process.argv[2];fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'skill-actions.json'),JSON.stringify({authored,scenarios,saved})+'\n');console.log(JSON.stringify({worlds:scenarios.length,transitions:scenarios.reduce((n,s)=>n+s.rows.length,0),saved:saved.length,priceExample:skillLevelAbilityCost(5)}));
