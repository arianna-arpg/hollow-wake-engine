import {CompanionBonds,createCompanionBondsState,resolveCompanionBond,type CompanionBondActor,type CompanionBondSkill,type CompanionBondPorts,type CompanionSaved,type CompanionBondForkMapping} from '@hollow-wake/engine/companions/bonds';
import {MinionInheritanceResolver,applyMinionPlyBonus,type MinionInheritanceSkill,type MinionInheritancePorts,type MinionInheritance} from '@hollow-wake/engine/minions/inheritance';
import {AttributeBequests,createAttributeBequestState,type AttributeBequestPorts,type BequestActor} from '@hollow-wake/engine/minions/bequests';
interface Skill extends CompanionBondSkill {def:CompanionBondSkill['def']&MinionInheritanceSkill['def'];relicSource?:unknown;custom:number}
interface Modifier {stat:string;kind:'increased'|'more'|'flat'|'override';value:number}
interface Actor extends CompanionBondActor<Actor,Skill,'rare'|'normal'>,BequestActor<Actor,'might'> {custom:string;hiveDeathPlies:number;assaultWardCount:number;plySpec?:{count:number;perLevel?:number}}
type Inherited=MinionInheritance<Modifier,Set<string>>;
type Ports=CompanionBondPorts<Actor,Skill,Modifier,Inherited,{color:string}>;
export function bind(ports:Ports){const state=createCompanionBondsState<Actor,Skill,Modifier>();const runtime=new CompanionBonds<Actor,Skill,Modifier,Inherited,'rare'|'normal',{color:string}>(ports,state);runtime.refresh();return{runtime,state,step:(dt:number)=>runtime.update(dt)};}
export function inherit(ports:MinionInheritancePorts<Actor,Skill,Modifier,Set<string>>,actor:Actor,skill:Skill){
 const resolver=new MinionInheritanceResolver(ports),result:Inherited=resolver.resolve(actor,skill,actor.defId,.5);applyMinionPlyBonus(actor,result.plyBonus);return result;
}
export function areaAvoidance(ports:MinionInheritancePorts<Actor,Skill,Modifier,Set<string>>,actor:Actor,skill:Skill):number {
 return new MinionInheritanceResolver(ports).areaAvoidanceOf(actor,skill,ports.tags(skill),ports.modifiers(skill));
}
export function bequests(ports:AttributeBequestPorts<Actor,'might',Modifier,Set<string>>){
 const state=createAttributeBequestState<'might'>(),runtime=new AttributeBequests(ports,state);runtime.register({id:'gift',name:'Gift',attributes:['might'],recipients:'both'});return runtime;
}
declare const ports:Ports,actor:Actor,skill:Skill;
const bound=bind(ports),saved:CompanionSaved<Modifier,'rare'|'normal'>=bound.runtime.saved(actor);void saved;
bound.runtime.onCast(actor,skill,{x:1,y:2});resolveCompanionBond<Modifier>(['node'],()=>({slotsAdd:1}));
declare const privatePorts:Ports,mapping:CompanionBondForkMapping<Actor,Skill,Modifier>;
const fork:typeof bound.runtime=bound.runtime.forkOwnedState(privatePorts,mapping);
const privateController=new CompanionBonds<Actor,Skill,Modifier,Inherited,'rare'|'normal',{color:string}>(privatePorts);
const copied:typeof bound.runtime=bound.runtime.copyOwnedStateTo(privateController,mapping);void fork;void copied;
// @ts-expect-error Complete enumerable maps are required to preserve copy history.
bound.runtime.forkOwnedState(privatePorts,{actor:(a:Actor)=>a,skill:(i:Skill)=>i,spec:mapping.spec});
// @ts-expect-error Actor identity maps must contain actors at both ends.
const wrongMapping:CompanionBondForkMapping<Actor,Skill,Modifier>={...mapping,actors:new Map([[actor,skill]])};void wrongMapping;
// @ts-expect-error A complete host actor/skill graph is required.
bound.runtime.adopt({id:1,skills:[]});
// @ts-expect-error Randomness is supplied explicitly by the host.
const incomplete:Ports={...ports,random:undefined};void incomplete;
// @ts-expect-error Modifier values are numerical.
const invalid:Modifier={stat:'life',kind:'more',value:'one'};void invalid;
