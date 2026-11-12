import {CharacterBuilds} from '../dist/character-builds.js';
import {StatRules} from '../dist/stat-rules.js';
import {PassiveGrants} from '../dist/passive-grants.js';
import {packGrantState} from '../dist/gem-residence.js';

// Small independent ownership fixture. Full authored laws are checked through
// the separately compiled default package against original World observations.
export function setup(){
  const defs={bolt:Object.freeze({id:'bolt',name:'Bolt'}),wave:Object.freeze({id:'wave',name:'Wave'}),golem:Object.freeze({id:'golem',name:'Golem'})};
  const support=Object.freeze({id:'repeat',name:'Repeat'}),slots=[{id:'head'},{id:'ring'}],classes=[{id:'mage',innate:[]}];
  const stats=new StatRules({life:{base:100},skillgrant_bolt:{base:0},companiongrant_golem:{base:0},slotgraft_1_repeat:{base:0}});
  const passives=new PassiveGrants({schemaVersion:1,capability:'passive-grants/v1',contentId:'test',attributes:[{id:'strength',perPoint:[{stat:'life',kind:'flat',value:2}]}],
    statIds:Object.keys(stats.definitions),supportIds:['repeat'],nodes:[],groups:[]});
  const state=row=>({sockets:row.sockets.map(r=>r?{def:support,level:r.level}:null),...(row.treeNodes?{treeNodes:[...row.treeNodes]}:{})});
  const makeSkill=(def,level,sockets)=>({def,level,sockets:Array(sockets).fill(null)});
  const copySkill=s=>({...s,sockets:s.sockets.map(r=>r&&({...r})),treeNodes:s.treeNodes&&[...s.treeNodes],grafts:s.grafts?.map(r=>({...r}))});
  const equipment={skillGrantPrefix:'skillgrant_',companionGrantPrefix:'companiongrant_',slotGraftPrefix:'slotgraft_',equipSlots:()=>slots,
    skill:id=>defs[id],support:id=>id==='repeat'?support:undefined,parseSkillGrant:id=>id.slice(11),companionGrantStat:id=>'companiongrant_'+id,
    parseSlotGraft:stat=>stat==='slotgraft_1_repeat'?{slot:0,gemId:'repeat'}:null,skillMaxLevel:()=>50,maxSupportLevel:50,
    grantSockets:()=>2,autoSeat:()=>false,makeSkill,restoreGrant:(inst,s)=>{Object.assign(inst,state(s));if(inst.treeNodes)inst.treeNodes=inst.treeNodes.slice(0,Math.floor(inst.level/5));},
    packGrant:packGrantState,classes:()=>classes,openingSkills:()=>[],classSkillStat:()=>'',treeGraft:()=>undefined,supportFits:()=>true};
  const ports={contentId:'fixture',barSlots:2,stats,passives,class:id=>classes.find(c=>c.id===id),equipment,copySkill,
    restoreLearned:payload=>({...makeSkill(defs[payload.skillId],payload.level,payload.sockets.length),...state(payload)}),
    updateLearned:(inst,payload)=>{inst.level=payload.level;Object.assign(inst,state(payload));},updateGrant:(inst,s)=>Object.assign(inst,state(s)),
    summon:def=>def.id==='golem'?{type:'summon',persistent:{respawnTime:3}}:undefined,
    levelModifiers:level=>[{stat:'life',kind:'flat',value:(level-1)*10}],
    contributions:{equipSlots:()=>slots,containers:()=>[{id:'reliquary',active:true}],compileItem:item=>item.lines??[],
      board:(_def,features)=>features.has('relics')?{w:1,h:1,open:[true],cells:1}:null,
      misfits:(_board,items)=>items.filter(item=>item.x!==0||item.y!==0),amplification:(_board,items)=>new Map(items.map(i=>[i,1])),
      amplify:mods=>mods,empower:(mods,power)=>mods.map(m=>({...m,value:m.value*(1+power)}))}};
  const input={level:1,classId:'mage',baseAttrs:{strength:3},allocated:[],choices:{},grafts:{},equipped:{},containers:{},features:[],relicEnabled:true,relicEmpowerment:0,learned:[]};
  const item=(uid,stat='skillgrant_bolt',value=10)=>({uid,name:'Item '+uid,baseId:'hat',ilvl:1,tier:1,rarity:'common',baseRoll:0,implicitRolls:[],affixes:[],lines:[{stat,kind:'flat',value}]});
  const learned=(id='bolt',level=4)=>({gem:{kind:'skill',skillId:id,level,rarity:'common',sockets:[null,null]}});
  return{builds:new CharacterBuilds(ports),ports,input,item,learned};
}
