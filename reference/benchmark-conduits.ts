import {Actor} from '../src/engine/actor';
import {mod} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {bootSimEngine} from '../src/sim/arena';

bootSimEngine({validate:false});
export function createWorkload(kind:'idle'|'mixed'|'engaged'|'worn') {
  const actors:Actor[]=[];
  for(let i=0;i<24;i++){
    const a=new Actor('conduit benchmark','player',{x:0,y:0});
    a.sheet.setSource('meters',['life','mana','energyShield','poise','insight'].map(id=>mod(id,'override',100)));
    for(const def of [SKILLS.stone_communion,SKILLS.ice_shield,SKILLS.fireball,SKILLS.frost_nova,
      SKILLS.stone_communion,SKILLS.ice_shield,SKILLS.fireball,SKILLS.frost_nova]){
      const skill=makeSkillInstance(def,4,2);
      skill.sockets[0]={def:SUPPORTS.stoneblood_conduit,level:3};
      a.skills.push(skill);
    }
    if(kind==='engaged'||(kind==='mixed'&&i%4===0)){
      const inst=a.skills[0]!;
      a.casting={mode:'guard',held:true,inst,shield:10,maxShield:100} as Actor['casting'];
    }
    if(kind==='worn'||kind==='mixed')a.wornConduits=[{from:'mana',to:'ward',ratio:1.25,drainPct:.02}];
    actors.push(a);
  }
  return ()=>{
    let checksum=0;
    for(const a of actors){a.life=60;a.mana=75;a.ward=0;}
    for(let frame=0;frame<120;frame++)for(const a of actors){
      a.poise=80;
      if(a.casting)a.casting.shield=10;
      (a as unknown as {updateConduits(dt:number):void}).updateConduits(1/60);
      checksum+=a.poise+a.mana+a.ward+(a.casting?.shield??0);
    }
    return checksum;
  };
}
