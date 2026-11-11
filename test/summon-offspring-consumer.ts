import {SummonOffspring,type SummonOffspringPorts} from '@hollow-wake/engine/summons/offspring';
type Skill={id:string};
type Body={dead:boolean;owner?:Body;summonInst?:Skill;summonOffspring?:boolean;skills:(Skill|null)[];pos:{x:number;y:number}};
type Delivery={type:'summon';maxActive:number;config:{enabled:true}};
const skill:Skill={id:'source'},owner:Body={dead:false,skills:[skill],pos:{x:0,y:0}},parent:Body={dead:false,owner,summonInst:skill,skills:[],pos:{x:0,y:0}};
const ports:SummonOffspringPorts<Body,Skill,Delivery>={
 delivery:()=>({type:'summon',maxActive:3,config:{enabled:true}}),random:()=>0,
 spawn:(caster,source,request)=>{
  const configRemainsTyped:true=request.delivery.config.enabled;
  const strippedContract:undefined=request.delivery.persistent;
  const duration:number=request.delivery.duration;
  void configRemainsTyped;void strippedContract;void duration;
  return{dead:false,owner:caster,summonInst:source,summonOffspring:true,skills:[],pos:request.pos};
 },
};
const command=new SummonOffspring(ports);
command.spawn(parent,{monster:'heir',inheritSummon:{maxActive:3,size:.5,life:.6,damage:.7}});
// @ts-expect-error Deterministic host randomness must be supplied explicitly.
const missingRandom:SummonOffspringPorts<Body,Skill,Delivery>={delivery:ports.delivery,spawn:ports.spawn};void missingRandom;
const asyncPorts:SummonOffspringPorts<Body,Skill,Delivery>={...ports,
 // @ts-expect-error Asynchronous birth would change ordering over borrowed state.
 spawn:async()=>parent,
};void asyncPorts;
// @ts-expect-error A parent must supply the complete actor contract.
command.spawn({dead:false},{monster:'heir'});
// @ts-expect-error Admission shape uses numeric capacity.
command.spawn(parent,{monster:'heir',inheritSummon:{maxActive:'3',size:.5,life:.6,damage:.7}});
