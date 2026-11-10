import {GuardArts,createGuardArtsState,guardArtCapacity,guardArtAbsorb,resolveGuardArts,type GuardArtActor,type GuardArtSkill,type GuardArtProjectile,type GuardArtsPorts,type GuardArtValuePorts,type GuardArtsSpec,type GuardArtsForkMapping} from '@hollow-wake/engine/guard/arts';

interface Skill extends GuardArtSkill {def:GuardArtSkill['def']&{guardArts?:GuardArtsSpec}}
interface Body extends GuardArtActor<Skill> {name:string}
interface Modifier {stat:string;kind:'flat'|'more';value:number}
type Ports=GuardArtsPorts<Body,Skill,GuardArtProjectile,{mult?:number},string,Modifier>;
// The host supplies the same body/skill graph to all synchronous services.
export function bindGuards(ports:Ports) {
 const state=createGuardArtsState<Body,Skill,GuardArtProjectile>();
 const runtime=new GuardArts(ports,state);
 runtime.rebind();
 return {runtime,state,step:(elapsed:number)=>runtime.update(elapsed),dispose:()=>runtime.clearAll()};
}
export function values(body:Body,skill:Skill,ports:GuardArtValuePorts<Body,Skill,GuardArtProjectile,string,Modifier>) {
 const capacity:number=guardArtCapacity(body,skill,ports);
 const layer:{amount:number;duration:number}|undefined=guardArtAbsorb(body,skill,ports);
 const spec:GuardArtsSpec|undefined=resolveGuardArts(skill,()=>undefined);
 return {capacity,layer,spec};
}
declare const ports:Ports;
const bound=bindGuards(ports);
const first:Body|undefined=bound.state.owners.keys().next().value;
if(first)bound.runtime.sync(first);
// @ts-expect-error A body from a different skill graph is not interchangeable.
bound.runtime.sync({skills:['guard']});
// @ts-expect-error Host random must be an explicit service.
const incomplete:Ports={...ports,random:undefined};
void incomplete;

export function privateGuards(source:ReturnType<typeof bindGuards>['runtime'],privatePorts:Ports,mapping:GuardArtsForkMapping<Body,Skill,GuardArtProjectile>) {
 const result:typeof source=source.forkOwnedState(privatePorts,mapping);
 return result;
}
export function existingPrivateGuards(source:ReturnType<typeof bindGuards>['runtime'],target:typeof source,mapping:GuardArtsForkMapping<Body,Skill,GuardArtProjectile>) {
 const result:typeof source=source.copyOwnedStateTo(target,mapping);return result;
}
// @ts-expect-error A private graph must supply an explicit derived-policy copy.
privateGuards(bound.runtime,ports,{actor:(a:Body)=>a,skill:(s:Skill)=>s});
