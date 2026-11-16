import {writeFileSync} from 'node:fs';import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillInstance,type SummonDelivery} from '../src/engine/skills';import {summonCapacity,summonContractSlots} from '../src/engine/summonContracts';import {summonReservationUnit} from '../src/engine/companionGrants';
import {SKILLS} from '../src/data/skills';
const restore=seedGlobalRandom(0x4d3316),courses:unknown[]=[];
try{
  for(const name of['ordinary','pending-fill','limited-mana','hive-owned']){
    const w=makeSimWorld('warrior',0x4d3316),a=new Actor('owner','ally',{x:800,y:600});w.walk=null;w.meta.modeId='immortal';w.actors=[a];
    a.sheet.setBase('mana',name==='limited-mana'?25:100);a.sheet.setBase('manaCost',1);a.sheet.setBase('minionMaxCount',3);a.sheet.setBase('minionRespawnTime',.8);a.mana=a.maxMana();
    const d:SummonDelivery={type:'summon',monsterId:'skeleton_warrior',count:3,maxActive:3,persistent:{toggle:true,slots:3,reserve:10,respawnTime:5}};
    const skill=makeSkillInstance({id:'m3-contract',name:'Contract',description:'',color:'#fff',tags:['minion'],manaCost:0,useTime:0,cooldown:0,delivery:d,effects:[],
      ...(name==='hive-owned'?{hivecall:Object.values(SKILLS).find(def=>def.hivecall)!.hivecall}:{})},1);
    a.skills=[skill];a.summonToggles.set(skill.def.id,{inst:skill,reserved:20,slots:2});a.reservedMana=20;
    const bodies=[0,1].map(n=>{const b=new Actor('body-'+n,'ally',{x:800+n*10,y:600});b.owner=a;b.sourceSkillId=skill.def.id;b.summonInst=skill;w.actors.push(b);return b;});
    if(name==='pending-fill')w.pendingSummons.push({caster:a,inst:skill,remaining:2,timer:.35,interval:.35,mult:2});
    const inspect=()=>JSON.parse(JSON.stringify({mana:a.mana,reserved:a.reservedMana,toggles:[...a.summonToggles].map(([id,t])=>[id,{...t,inst:t.inst.def.id}]),
      bodies:bodies.map(b=>({id:b.id,dead:b.dead,manaReserved:b.manaReserved})),respawns:w.pendingRespawns.map(r=>({inst:r.inst.def.id,timer:r.timer})),
      summons:w.pendingSummons.map(r=>({...r,caster:'owner',inst:r.inst.def.id}))}));
    const initial=inspect(),steps:unknown[]=[];
    const seam=w as unknown as {updateSummonContracts():void;dismissSummonToggle(a:Actor,id:string):void;releaseContract(a:Actor,again:boolean):void};
    for(const capacity of[3,1,4]){a.sheet.setSource('m3-cap',[{stat:'minionMaxCount',kind:'flat',value:capacity-d.maxActive}]);seam.updateSummonContracts();steps.push({capacity,expected:inspect()});}
    seam.dismissSummonToggle(a,skill.def.id);steps.push({dismiss:true,expected:inspect()});
    courses.push({name,maximum:a.maxMana(),definition:skill.def,initial,steps});
  }
  const prices:unknown[]=[];
  for(const sibling of[0,1,3])for(const exclusive of[false,true]){
    const w=makeSimWorld('warrior',0x4d3316),a=new Actor('price','ally',{x:800,y:600});a.sheet.setBase('manaCost',.8);a.sheet.setSource('m3-discount',[{stat:'summonReservation_m3-price',kind:'more',value:-.5}]);a.sheet.setBase('minionMaxCount',3);
    const d:SummonDelivery={type:'summon',monsterId:'skeleton_warrior',count:1,maxActive:3,poolGroup:'court',...(exclusive?{exclusiveGroup:'form'}:{}),persistent:{toggle:true,reserve:10,respawnTime:5}};
    const def={id:'m3-price',name:'Price',description:'',color:'#fff',tags:['minion'],manaCost:0,useTime:0,cooldown:0,delivery:d,effects:[]} as SkillInstance['def'];
    const skill=makeSkillInstance(def,1),other=makeSkillInstance({...def,id:'other'},1);a.summonToggles.set('other',{inst:other,reserved:sibling*10,slots:sibling});
    prices.push({sibling,exclusive,delivery:d,capacity:summonCapacity(a,skill,d),slots:summonContractSlots(a,skill,d),unit:summonReservationUnit(a,skill,d)});
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses,prices}));
}finally{restore();}
