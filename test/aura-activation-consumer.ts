import {AuraActivation,type AuraActivationActor,type AuraActivationSpec,type AuraActivationSkill,type AuraActivationPorts,type AuraActivationDelivery} from '@hollow-wake/engine/auras/activation';
type Color={hex:string};type Modifier={stat:'esRechargeRate'|'esRechargeDelay';amount:number};type Context={revision:number};
interface Spec extends AuraActivationSpec<Modifier>{contentId:string}
interface Skill extends AuraActivationSkill<Color>{rank:number}
interface Actor extends AuraActivationActor<Skill,Spec,Modifier,Color>{name:string}
const actor:Actor={name:'portable bearer',life:80,mana:100,reservedLife:0,reservedMana:0,activeAuras:new Map(),overdrive:{}};
const skill:Skill={def:{id:'portable aura',color:{hex:'#123'}},rank:1};
const delivery:AuraActivationDelivery<Spec,Color>={mode:'toggle',aura:{contentId:'portable aura',radius:12},upkeep:{reserveMana:20},ledger:{authored:'opaque'},shellGuard:{max:20,color:{hex:'#456'}}};
const ports:AuraActivationPorts<Actor,Skill,Context,Modifier>={
 context:i=>({revision:i.rank}),duration:()=>undefined,reserveLife:()=>false,
 stat:(_a,key,_context)=>key==='manaCost'||key==='guardStrength'||key==='effectDuration'||key==='durationAuraCap'?1:0,
 maxLife:()=>100,maxMana:()=>100,lifeCeiling:a=>100-a.reservedLife,availableMaxMana:a=>100-a.reservedMana,
 laneBusy:()=>{},cannotSustain:()=>{},retire:(a,id)=>{a.activeAuras.delete(id);},modifier:(stat,amount)=>({stat,amount}),time:()=>7,setSource:()=>{},
};
const runtime=new AuraActivation<Actor,Skill,Spec,Modifier,Color,Context>(ports);runtime.activate(actor,skill,delivery,1);
const color:Color|undefined=actor.shellGuard?.color;void color;
// @ts-expect-error Host-specific skill state must survive the boundary.
runtime.activate(actor,{def:skill.def},delivery,1);
// @ts-expect-error Host-specific aura content remains required.
runtime.activate(actor,skill,{mode:'toggle',aura:{radius:1}},1);
// @ts-expect-error Colors retain the host representation.
runtime.activate(actor,skill,{...delivery,shellGuard:{max:20,color:'red'}},1);
// @ts-expect-error The activation stat vocabulary is explicit.
ports.stat(actor,'damage',{revision:1});
