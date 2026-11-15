// Original-only observer. No extracted SDK imports or rewritten game methods.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {forgeItem,rollItem} from '../src/engine/itemgen';
import {makeSkillGem,treeNodeRefusal,supportFitsInstOrCrew,skillCooldownSeconds} from '../src/engine/skills';
import {packSkillGemPayload,makeSupportGemItem} from '../src/engine/gemitems';
import {autoPlace,bagBoard} from '../src/engine/inventory';
import {slotsForCategory} from '../src/engine/items';
import {bankRelic,reliquaryExperience} from '../src/engine/accountReliquary';
import {reliquaryPower} from '../src/meta/reliquary';
import {skillDamageBands,rollSkillDamage,applyHit} from '../src/engine/damage';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {ITEM_BASES} from '../src/data/itembases';
import {RELIQUARY} from '../src/data/containers';
import {ABILITY_ESSENCES} from '../src/data/essences';
import {PROGRESSION} from '../src/data/classes';

const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const statIds=['life','mana','accuracy','evasion','armor','damage','critChance','critMulti','castSpeed','attackSpeed','cooldownRecovery','manaCost','minionDamage','fireRes','chaosRes','strength','intelligence'];
const specs=[{id:'warrior',skill:'cleave',vocation:'warbringer',unique:'bloodletters_girdle'},
  {id:'magician',skill:'firebolt',vocation:'archmage',unique:'cindervigil'},
  {id:'summoner',skill:'ruin',vocation:'gravebinder',unique:'mourning_bell'}];
const restore=seedGlobalRandom(0x4d3201),courses:any[]=[];
try{
  for(const spec of specs){
    const w=makeSimWorld(spec.id,0x4d3201),p=w.player,m=w.meta,seat=w.localSeat,rng=mulberry32(991);
    w.walk=null;w.actors=[p];m.modeId='immortal';m.charId='m2-character';m.relicScope='m2-character';
    m.items=[];m.equipped={};m.containers={};m.knownSkills.clear();p.skills=Array(8).fill(null);
    p.level=40;m.xp=0;m.xpNeeded=PROGRESSION.xpForLevel(40);m.passivePoints=12;m.vocationPoints=12;m.realmPoints={};m.vocations=[];m.choices={};m.grafts={};
    m.allocated=new Set([m.classDef.startNode]);m.abilityEssences=Object.fromEntries(ABILITY_ESSENCES.map(row=>[row.id,100000]));
    const inst=makeSkillGem(SKILLS[spec.skill],4,'rare');m.knownSkills.set(spec.skill,inst);p.skills[0]=inst;
    const gear=forgeItem({uniqueId:spec.unique,ilvl:40,quality:1,rng})!;assert(gear);assert(autoPlace(m.items,gear));
    const ring=rollItem({baseId:'ring_lapis',ilvl:40,rarity:'common',rng})!;assert(ring);assert(autoPlace(m.items,ring));
    const supportId=['measured_blows','corrosion','added_fire'].find(id=>SUPPORTS[id]&&supportFitsInstOrCrew(SUPPORTS[id],inst,w.summonCrewSkills(inst)))!;assert(supportId);
    const support=makeSupportGemItem({def:SUPPORTS[supportId],level:2});assert(autoPlace(m.items,support));
    for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);
    const relic=forgeItem({uniqueId:'unquarried_idol',ilvl:40,quality:1,rng})!;assert(bankRelic(w.account,relic,'m2-character'));relic.x=0;relic.y=0;
    w.account.reliquary.seated=[relic.relicKey!];w.account.reliquary.rank=7;w.restoreAccountRelics(seat);w.recalcSeat(seat);p.fillResources();
    const state=()=>({board:bagBoard(),items:m.items,equipped:m.equipped,overflow:[],essences:m.essences,
      skillBook:{known:[...m.knownSkills.values()].map(s=>({gem:packSkillGemPayload(s),...(s.locked?{locked:true}:{})})),bar:p.skills.map(s=>s?.def.id??null)}});
    const character=()=>({level:p.level,baseAttrs:m.baseAttrs,passives:{classId:m.classDef.id,allocated:[...m.allocated],choices:m.choices,grafts:m.grafts,vocations:m.vocations,
      passivePoints:m.passivePoints,vocationPoints:m.vocationPoints,realmPoints:m.realmPoints},containers:Object.fromEntries(Object.entries(m.containers).filter(([id])=>id!=='reliquary')),abilityEssences:m.abilityEssences});
    const projection=()=>({features:[...w.account.features],relics:{enabled:w.account.reliquary.enabled,power:reliquaryPower(w.account.reliquary),containers:{reliquary:m.containers.reliquary??[]}}});
    const skill=(s:any)=>s?{id:s.def.id,level:s.level,bonus:s.bonusLevels,sockets:s.sockets.map((row:any)=>row?{id:row.def.id,level:row.level,...(row.locked?{locked:true}:{}),...(row.rolled?{rolled:row.rolled}:{})}:null),tree:s.treeNodes,grafts:s.grafts?.map((row:any)=>({id:row.def.id,level:row.level})),host:s.grantedHostUid,source:s.grantedBy}:null;
    const observe=()=>copy({data:{state:state(),character:character(),xp:m.xp},projection:projection(),
      build:{bar:p.skills.map(skill),known:[...m.knownSkills].map(([id,s])=>[id,skill(s)]),grants:[...(seat.grantedInsts??[])].map(([id,s])=>[id,skill(s)]),
        companions:[...((w as any).companionGrants.owners.get(p)??[])].map(([id,row]:any)=>[id,skill(row.inst)]),equipped:m.equipped,attrs:m.attrs,
        sources:p.sheet.sourceNames().map(id=>[id,p.sheet.getSourceMods(id)]),...(p.wornConduits?{conduits:p.wornConduits}:{})},
      stats:Object.fromEntries(statIds.map(id=>[id,p.sheet.get(id)])),preview:skillDamageBands(p,inst),
      price:{skillId:spec.skill,useTime:p.skillUseTime(inst),cost:p.skillCost(inst),cooldown:skillCooldownSeconds(p,inst),cooldownAt:'completion'},
      legal:inst.def.tree!.nodes!.map(node=>[node.id,treeNodeRefusal(inst,node.id)]),
      supportLegal:Object.values(SUPPORTS).map(def=>[def.id,supportFitsInstOrCrew(def,inst,w.summonCrewSkills(inst))])});
    const course:any={spec,statIds,initial:observe(),steps:[]};
    const step=(label:string,command:any,conditions:any,run:()=>void)=>{run();course.steps.push({label,command,conditions,expected:observe()});};
    const access={salvage:true,oracle:true,bench:true,counter:true,study:true};
    const slot=slotsForCategory(ITEM_BASES[gear.baseId].category)[0].id;
    step('equip',{kind:'inventory',request:{op:'equip',uid:gear.uid,slot}},access,()=>w.equipItem(seat,gear.uid,slot));
    step('socket',{kind:'support',request:{op:'socket',residence:'learned',skillId:spec.skill,uid:support.uid}},{hold:null},()=>{assert(w.socketSupport(support.uid,spec.skill));});
    step('vocation',{kind:'vocation',id:spec.vocation},null,()=>{assert(w.grantVocation(spec.vocation));});
    step('vocation-invest',{kind:'passive',request:{op:'allocate',nodeId:'voc_'+spec.vocation+'_s1'}},{refundRefusal:null,openAllRealms:false,runLedger:{}},()=>{assert(w.allocateNode('voc_'+spec.vocation+'_s1'));});
    step('skill-awakening',{kind:'skill',request:{op:'levelSkill',skillId:spec.skill}},{nearFont:true,memory:{},hold:null},()=>{assert(w.levelUpSkill(spec.skill));});
    const node=inst.def.tree!.nodes![0].id;assert.equal(treeNodeRefusal(inst,node),null);
    step('skill-invest',{kind:'skill',request:{op:'pick',skillId:spec.skill,nodeId:node}},{nearFont:true,memory:{},hold:null},()=>{w.pickTreeNode(spec.skill,node);assert(inst.treeNodes?.includes(node));});
    // Compare a real original cast while a new item changes the current actor.
    p.fillResources();const before={life:p.life,mana:p.mana},price=course.steps.at(-1).expected.price;
    assert(w.useSkill(p,inst,{x:p.pos.x+30,y:p.pos.y}));assert(p.casting);const cast=p.casting;
    const pressed={life:p.life,mana:p.mana,total:cast.total,elapsed:cast.elapsed};
    (w as any).updateCasting(p,cast.total/3);
    step('rebuild-during-cast',{kind:'inventory',request:{op:'equip',uid:ring.uid,slot:'ring1'}},access,()=>w.equipItem(seat,ring.uid,'ring1'));
    assert.equal(p.casting,cast);assert.equal(p.casting.inst,inst);
    const during={life:p.life,mana:p.mana,total:cast.total,elapsed:cast.elapsed};
    (w as any).updateCasting(p,cast.total);assert.equal(p.casting,null);
    course.cast={before,price,pressed,during,completed:true,cooldown:p.cooldowns.get(spec.skill)??0};
    const target=new Actor('m2-target','enemy',{x:0,y:0});target.sheet.setBase('life',100000);target.life=100000;target.sheet.setBase('armor',200);target.sheet.setBase('fireRes',.25);target.sheet.setBase('chaosRes',.25);
    const random=mulberry32(711),previous=Math.random,draws:number[]=[];Math.random=()=>{const n=random();draws.push(n);return n;};
    try{const packet=rollSkillDamage(p,inst),outgoing=copy(packet.amounts),result=applyHit(p,target,packet);course.hit=copy({outgoing,result,life:target.life,crit:packet.crit,rollT:packet.rollT,draws});}finally{Math.random=previous;}
    const multiplier=reliquaryExperience(m.containers.reliquary??[],true),amount=Math.ceil(m.xpNeeded/multiplier)+3;
    step('experience',{kind:'xp',amount,multiplier},null,()=>w.grantXp(amount));
    step('unequip',{kind:'inventory',request:{op:'unequip',uid:gear.uid,slot}},access,()=>w.unequipItem(seat,slot));
    courses.push(course);
  }
  writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,originalOnly:true,courses})+'\n',{flag:'wx'});
}finally{restore();}
