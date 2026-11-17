// Revision 2: action changes are observed on the live instance, not the incomplete original exporter.
// Inventory observer against the pinned original; no SDK implementation.
import fs from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {makeSkillGem,instanceDelivery} from '../src/engine/skills';
import {packSkillGemPayload} from '../src/engine/gemitems';
import {bagBoard} from '../src/engine/inventory';
import {SKILLS} from '../src/data/skills';
import {PROGRESSION} from '../src/data/classes';
const courses:any[]=[],restore=seedGlobalRandom(7331),copy=(x:any)=>JSON.parse(JSON.stringify(x));
try{for(const spec of [
  {id:'mage-school-selection',skill:'summon_skeleton_mage',nodes:['grave_academy','storm_curriculum','expanded_faculty']},
  {id:'spellsword-school-selection',skill:'summon_skeleton',nodes:['ossuary_duelists','line_breakers','relentless_footwork']},
]){
  const w=makeSimWorld('summoner',7331),p=w.player,m=w.meta,seat=w.localSeat;
  w.walk=null;w.actors=[p];m.modeId='immortal';m.charId='parity-character';
  m.items=[];m.equipped={};m.containers={};m.knownSkills.clear();p.skills=Array(8).fill(null);
  p.level=40;m.xp=0;m.xpNeeded=PROGRESSION.xpForLevel(40);m.passivePoints=12;m.vocationPoints=12;m.realmPoints={};m.vocations=[];m.choices={};m.grafts={};
  m.allocated=new Set([m.classDef.startNode]);m.abilityEssences={};
  const inst=makeSkillGem(SKILLS[spec.skill],20,'legendary');inst.treeNodes=[...spec.nodes];m.knownSkills.set(spec.skill,inst);p.skills[0]=inst;
  w.recalcSeat(seat);p.fillResources();
  const skill=(s:any)=>s?{id:s.def.id,level:s.level,bonus:s.bonusLevels,sockets:s.sockets.map((g:any)=>g?{id:g.def.id,level:g.level,...(g.locked?{locked:true}:{}),...(g.rolled?{rolled:g.rolled}:{})}:null),
    tree:s.treeNodes,...(s.summonSchools?.length?{summonSchools:s.summonSchools}:{}),...(s.nativeCrewFactions?.length?{nativeCrewFactions:s.nativeCrewFactions}:{}),grafts:s.grafts?.map((g:any)=>({id:g.def.id,level:g.level})),host:s.grantedHostUid,source:s.grantedBy}:null;
  const observe=()=>copy({data:{state:{board:bagBoard(),items:m.items,equipped:m.equipped,overflow:[],essences:m.essences,
    skillBook:{known:[...m.knownSkills.values()].map(s=>({gem:packSkillGemPayload(s),...(s.locked?{locked:true}:{})})),bar:p.skills.map(s=>s?.def.id??null)}},
    character:{level:p.level,baseAttrs:m.baseAttrs,passives:{classId:m.classDef.id,allocated:[...m.allocated],choices:m.choices,grafts:m.grafts,vocations:m.vocations,
      passivePoints:m.passivePoints,vocationPoints:m.vocationPoints,realmPoints:m.realmPoints},containers:{},abilityEssences:m.abilityEssences},xp:m.xp},
    projection:{features:[],relics:{enabled:true,power:0,containers:{}}},
    build:{bar:p.skills.map(skill),known:[...m.knownSkills].map(([id,s])=>[id,skill(s)]),grants:[...(seat.grantedInsts??[])].map(([id,s])=>[id,skill(s)]),companions:[],equipped:m.equipped,attrs:m.attrs,
      sources:p.sheet.sourceNames().map(id=>[id,p.sheet.getSourceMods(id)]),...(p.wornConduits?{conduits:p.wornConduits}:{})}});
  const initial=observe(),steps:any[]=[];
  for(const choices of [['cold'],['lightning','fire','invalid','fire'],[],['fire','lightning'],['chaos'],['fire','cold','lightning','chaos']]){
    const before=JSON.stringify(inst.summonSchools);w.setSummonSchools(spec.skill,choices);
    steps.push({command:{kind:'skill',request:{op:'schools',skillId:spec.skill,choices}},conditions:{nearFont:false,memory:{},hold:null},accepted:before!==JSON.stringify(inst.summonSchools),expected:observe()});
  }
  const d=instanceDelivery(inst);if(d.type!=='summon'||!d.arts?.balanceSchools)throw Error('School branch inactive');
  courses.push({id:spec.id,spec,initial,steps});
}}finally{restore();}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,originalOnly:true,courses})+'\n',{flag:'wx'});
