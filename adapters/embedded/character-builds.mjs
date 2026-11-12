import {CharacterBuilds} from '@hollow-wake/engine/character/builds';
import {StatRules} from '@hollow-wake/engine';
import {ItemContent,ItemRules} from '@hollow-wake/engine/items';
import {PassiveGrants} from '@hollow-wake/engine/passives/grants';
import {ContainerLayout,ContainerPolicy,SeatGeometry,SeatRules} from '@hollow-wake/engine/inventory/containers';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {createGemCargo,packGrantState} from '@hollow-wake/engine/inventory/gems';
import * as h from './character-build-helpers.mjs';

const own=(rows,id)=>Object.hasOwn(rows,id)?rows[id]:undefined;
function clone(value){
  if(Array.isArray(value))return value.map(clone);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,row])=>[key,clone(row)]));
  return value;
}
function freeze(value){if(value&&typeof value==='object'){for(const row of Object.values(value))freeze(row);Object.freeze(value);}return value;}
function copySkill(skill){
  const {def,sockets,grafts,...rest}=skill;
  const support=row=>row?{...clone({...row,def:undefined}),def:row.def}:null;
  return {def,...clone(rest),sockets:sockets.map(support),...(grafts?{grafts:grafts.map(support)}:{})};
}
/** Default immutable authored rules, shared across private character builds.
 * The pack is compiler output, not arbitrary save input. Session admission,
 * account selection and live acknowledgement remain explicit boundaries. */
export function createCharacterBuilds(pack){
  if(pack?.capability!=='hollow-wake-character-builds/v1'||pack.schemaVersion!==1||typeof pack.contentId!=='string')throw Error('Invalid character build pack');
  const {contentId}=pack,definitions=freeze(clone(pack.definitions));
  const {skills,supports,monsters,classes,slots,progression:levelTuning}=definitions;
  const itemContent=new ItemContent(pack.items),items=new ItemRules(itemContent),statRules=new StatRules(definitions.stats,definitions.trades);
  const passives=new PassiveGrants(pack.passives),progression=new SkillProgression(pack.progression),seats=new SeatRules(pack.containers.rules);
  const containers=freeze(clone(pack.containers.containers)),layouts=new Map(containers.map(def=>[def.id,new ContainerLayout(def.ladder)]));
  const footprint=item=>{const base=own(itemContent.pack.bases,item.baseId);return base?{w:base.w,h:base.h}:{w:1,h:1};};
  const containerPolicy=new ContainerPolicy({footprint,base:item=>own(itemContent.pack.bases,item.baseId),level:()=>1,unique:item=>own(itemContent.pack.uniques,item.uniqueId)});
  const geometry=new SeatGeometry(footprint,(mods,mode)=>seats.power(mods,mode));
  const cargo=createGemCargo({skill:id=>own(skills,id),support:id=>own(supports,id),hasForm:id=>!!own(monsters,id),makeSkill:h.makeSkillInstance,
    validTreeNodes:(def,ids,level,inst)=>progression.tree(def.id).restore(ids,level,inst),
    nextUid:()=>{throw Error('Build restoration cannot mint cargo');},bagWidth:()=>0,bagHeight:()=>0,itemGridSize:footprint});
  const unpack=row=>{if(!row)return null;const def=own(supports,row.supportId);if(!def)throw Error('Unknown build support');
    return {def,level:row.level,...(row.locked?{locked:true}:{}),...(row.rolled?{rolled:clone(row.rolled)}:{})};};
  const updateGrant=(inst,state)=>{inst.sockets=inst.sockets.map((_,n)=>unpack(state.sockets[n]));
    if(state.treeNodes?.length)inst.treeNodes=[...state.treeNodes];else delete inst.treeNodes;};
  const updateLearned=(inst,payload)=>{
    inst.level=payload.level;inst.sockets=payload.sockets.map(unpack);
    for(const field of ['rarity','empowermentRank','replenishmentPaused','granted','attunedForm','treeNodes']){
      if(payload[field]!==undefined)inst[field]=clone(payload[field]);else delete inst[field];
    }
  };
  const equipment={skillGrantPrefix:h.SKILLGRANT_PREFIX,companionGrantPrefix:'companiongrant_',slotGraftPrefix:h.SLOTGRAFT_PREFIX,
    equipSlots:()=>slots,skill:id=>own(skills,id),support:id=>own(supports,id),parseSkillGrant:h.parseSkillGrantStat,
    companionGrantStat:id=>'companiongrant_'+id,parseSlotGraft:h.parseSlotGraftStat,skillMaxLevel:h.skillMaxLevel,maxSupportLevel:h.MAX_SUPPORT_LEVEL,
    grantSockets:()=>h.GRANT_CFG.sockets,autoSeat:()=>h.GRANT_CFG.autoSeat,makeSkill:h.makeSkillInstance,
    restoreGrant:cargo.restoreGrantState,packGrant:packGrantState,classes:()=>classes,
    openingSkills:def=>{const ids=def.bar.filter(id=>id!==null);for(const row of def.kit??[])if(!ids.includes(row.skill))ids.push(row.skill);return ids;},
    classSkillStat:def=>'classSkill_'+def.id,treeGraft:(def,id)=>h.treeNodeOf(def,id)?.graft,
    supportFits:(def,inst)=>{const delivery=h.instanceDelivery(inst),crew=h.summonCrewOf(delivery.type==='summon'?delivery:h.instanceSummon(inst),id=>own(monsters,id),id=>own(skills,id));
      return h.supportFitsInstOrCrew(def,inst,crew);}};
  return new CharacterBuilds({contentId,barSlots:h.BAR_SLOTS,stats:statRules,passives,class:id=>classes.find(def=>def.id===id),equipment,
    summon:def=>def.delivery.type==='summon'?def.delivery:undefined,copySkill,updateGrant,updateLearned,
    restoreLearned:payload=>{const inst=cargo.skillOfGemItem({gem:payload});if(!inst)throw Error('Unknown learned build skill');return inst;},
    contributions:{equipSlots:()=>slots,containers:()=>containers,compileItem:item=>items.compile(item),board:(def,features)=>layouts.get(def.id).board(features),
      misfits:(board,held)=>containerPolicy.misfits(board,held),amplification:(board,held,mods)=>geometry.amplification(board,held,mods),
      amplify:(mods,factor)=>seats.amplify(mods,factor),empower:(mods,power,factor)=>seats.empower(mods,power,factor)},
    levelModifiers:level=>[{stat:'life',kind:'flat',value:(level-1)*levelTuning.lifePerLevel},{stat:'mana',kind:'flat',value:(level-1)*levelTuning.manaPerLevel},{stat:'accuracy',kind:'flat',value:(level-1)*4}]});
}
