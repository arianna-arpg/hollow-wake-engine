import {AuraTick,type AuraTickActor,type AuraTickSkill,type AuraTickSpec,type AuraTickPorts,type AuraTickState} from '@hollow-wake/engine/auras/ticking';
type Damage='heat'|'frost';type Modifier={key:string;operation:'more'|'flat';value:number};type Context={revision:number};
interface Skill extends AuraTickSkill {rank:number}
interface Spec extends AuraTickSpec<Damage,Modifier> {contentId:string}
interface Actor extends AuraTickActor<Skill,Spec,Modifier> {name:string}
const actor:Actor={name:'portable bearer',id:1,team:'party',dead:false,life:100,mana:100,invulnerable:false,activeAuras:new Map(),charges:new Map()};
const ports:AuraTickPorts<Actor,Skill,Spec,Damage,Modifier,Context>={
 actors:()=>[actor],enemies:()=>[],context:i=>({revision:i.rank}),aura:()=>undefined,time:()=>1,
 skillStat:()=>1,stat:()=>1,maxLife:()=>100,maxMana:()=>100,sameStory:()=>true,inside:()=>true,retire:()=>{},spendCharge:()=>{},
 modifier:(key,operation,value)=>({key,operation,value}),setSource:()=>{},removeSource:()=>{},convert:()=>{},resistance:()=>0,damageText:()=>{},heal:()=>0,resourceFlow:()=>{},kill:()=>{},presence:()=>{},healText:()=>{},
};
new AuraTick<Actor,Skill,Spec,Damage,Modifier,Context>(ports).update(.1);
const row:AuraTickState<Skill,Spec,Modifier>={inst:{def:{delivery:{type:'aura'}},rank:2},spec:{contentId:'aura',radius:3,enemyDps:{type:'heat',amount:2}},radius:3,shape:0,remaining:Infinity,pulseTimer:0,affected:new Set()};void row;
// @ts-expect-error Host-specific skill state survives the boundary.
ports.context({def:{delivery:{type:'aura'}}});
// @ts-expect-error A damage type must belong to the host vocabulary.
ports.resistance(actor,'physical');
// @ts-expect-error Query vocabulary is explicit.
ports.stat(actor,'crit');
// @ts-expect-error Modifier operations retain their meaning.
ports.modifier('damageTaken','increased',.1);
// @ts-expect-error The runtime does not own the actor collection.
actor.activeAuras.clear();
