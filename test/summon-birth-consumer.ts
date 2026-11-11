import {SummonBirth,summonBirthKitIds,type SummonBirthActor,type SummonBirthPorts,type SummonBirthDelivery,type SummonBirthOverrides} from '@hollow-wake/engine/summons/birth';
type Modifier={stat:string;kind:'flat'|'more';value:number;tags?:readonly string[]};
type Skill={def:{id:string;color:string};companionGrant?:boolean};
interface Delivery extends SummonBirthDelivery<Modifier,readonly string[]> {crewOnDeath?:{kind:'explode';power:number}[];devour?:{interval:number;meal:string}}
type Aura={radius:number;allyMods?:Modifier[];label:string};
type Buff={name:string;duration:number};
type Context={tags:ReadonlySet<string>;extra:Modifier[]};
interface Body extends SummonBirthActor<Body,Skill,Delivery,Aura,Modifier,readonly string[],string> {team:'blue'|'red';id:number}
type Ports=SummonBirthPorts<Body,Skill,Delivery,Aura,Modifier,readonly string[],string,Buff,Context>;
declare const actor:Body;declare const instance:Skill;declare const originalPorts:Ports;
const ports:Ports={...originalPorts,context:()=>({tags:new Set(['summon']),extra:[]}),stat:(_actor,_key,context,base)=>context.tags.has('summon')?(base??1):0};
const command=new SummonBirth<Body,Skill,Delivery,Aura,Modifier,readonly string[],string,Buff,Context>(ports);
const options:SummonBirthOverrides<Delivery>={delivery:{type:'summon',monsterId:'warrior',maxActive:3,crewOnDeath:[{kind:'explode',power:2}],devour:{interval:6,meal:'other-minion'}}};
const born:Body|null=command.spawn(actor,instance,options);
if(born){const inheritedMeal:string|undefined=born.devour?.spec.meal;const deathAction:'explode'|undefined=born.summonDeathActions?.[0]?.kind;void inheritedMeal;void deathAction;}
const kit:string[]=summonBirthKitIds({crewSkills:['extra'],crewAuras:['aura']},'warrior',['native']);void kit;
const asyncFactory:Ports={...ports,
 // @ts-expect-error The body factory must return the body synchronously.
 createMonster:async()=>actor,
};void asyncFactory;
const wrongContext:Ports={...ports,
 // @ts-expect-error Query tags are a set in this host, distinct from modifier filters.
 context:()=>({tags:['summon'],extra:[]}),
};void wrongContext;
const asyncStat:Ports={...ports,
 // @ts-expect-error A stat query must return a number synchronously.
 stat:async()=>1,
};void asyncStat;
// @ts-expect-error A complete body contract is required.
command.spawn({dead:false},instance);
// @ts-expect-error Delivery-specific death actions retain their payload types.
command.spawn(actor,instance,{delivery:{type:'summon',maxActive:1,crewOnDeath:[{kind:'wrong'}]}});
