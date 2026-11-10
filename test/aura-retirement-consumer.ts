import {AuraRetirement,type AuraRetirementActor,type AuraRetirementDefinition,type AuraRetirementSkill,type AuraRetirementState,type AuraRetirementPorts} from '@hollow-wake/engine/auras/retirement';
type Ledger={lapse:'damage'|'mana'};type Bash={power:number};
interface Definition extends AuraRetirementDefinition<Ledger>{title:string}
interface Skill extends AuraRetirementSkill<Definition>{level:number}
interface Aura extends AuraRetirementState<Skill>{remaining:number}
interface Actor extends AuraRetirementActor<Skill,Aura>{maximumLife:number}
const definition:Definition={id:'stance',title:'Stance',delivery:{type:'aura',ledger:{lapse:'damage'}}};
const inst:Skill={def:definition,level:1};
const actor:Actor={id:1,dead:false,life:10,maximumLife:20,reservedMana:0,reservedLife:0,skills:[inst,null],activeAuras:new Map(),overdrive:{}};
actor.activeAuras.set('stance',{inst,remaining:2,affected:new Set([1]),reserved:0});
const ports:AuraRetirementPorts<Actor,Definition,Skill,Bash,Ledger>={
 actors:()=>[actor],removeSource:(a,key)=>{void a;void key;},bashSpec:()=>({power:1}),bash:(a,i,b,n)=>{void a;void i;void b.power;void n;},
 time:()=>2,maxLife:a=>a.maximumLife,skill:id=>id==='stance'?definition:undefined,level:i=>i.level,makeSkill:(def,level)=>({def,level}),
 payload:(a,i,n)=>{void a;void i;void n;},settleLedger:(a,s,state)=>{if(s.lapse==='damage')a.life-=state.balance;state.balance=0;},
};
const service=new AuraRetirement<Actor,Definition,Skill,Aura,Bash,Ledger>(ports);
service.retire(actor,'stance');service.retire(actor,'stance',true);
// @ts-expect-error Host-owned actor identity remains numeric and coherent.
service.retire({...actor,id:'foreign'},'stance');
// @ts-expect-error The borrowed ledger type is retained through the host boundary.
ports.settleLedger(actor,{lapse:'unadmitted'},{balance:1});
// @ts-expect-error The quiet release argument is a boolean, not a clock value.
service.retire(actor,'stance',3);
