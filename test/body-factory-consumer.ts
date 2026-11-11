import {BodyFactory,type FactoryBody,type FactoryDefinition,type BodyFactoryPorts} from '@hollow-wake/engine/bodies/factory';
type Mod={stat:string;kind:'flat'|'more';value:number};
type SkillDef={id:string;school:'fire'|'cold'};
type Support={id:string;support:true};
type Skill={def:SkillDef;level:number;sockets:({def:Support;level:number}|null)[];grafts?:{def:Support;level:number}[];treeNodes?:string[]};
type Reserve={amount:number};
interface Body extends FactoryBody<Skill,Mod,Reserve> {
 brain?:{label:string};reserveSpecs?:{id:string;amount:number}[];
 tune?:{start:'low'|'high'};tone?:'low'|'high';carriedGear?:{id:string;kind:'item'};
 wornConduits?:{pool:string}[];statusRelay?:()=>boolean;
}
interface Definition extends FactoryDefinition<Body,Mod> {carry?:{chance?:number;rarity?:'rare';category?:'armor'}}
type Team='neutral'|'enemy';
export type Ports=BodyFactoryPorts<Body,Definition,Skill,Mod,Reserve,Team>;
export function valid(ports:Ports,definition:Definition,owner:Body){
 const factory=new BodyFactory<Body,Definition,Skill,Mod,Reserve,Team>(ports);
 const body:Body=factory.create('unit',7,'neutral',owner,{scale:.75});
 const brain:{label:string}|undefined=definition.brain;
 const pool:{id:string;amount:number}[]|undefined=definition.reserves;
 const support:Support|undefined=ports.supports.one;
 const item:{id:string;kind:'item'}|null|undefined=ports.rollItem({ilvl:7,rarity:'rare',category:'armor'});
 const absent:Body['squish']|null=ports.squishSpec(definition);
 return{body,brain,pool,support,item,absent};
}
export function invalid(ports:Ports,definition:Definition,owner:Body){
 const factory=new BodyFactory<Body,Definition,Skill,Mod,Reserve,Team>(ports);
 // @ts-expect-error unknown team
 factory.create('unit',7,'friend',owner);
 // @ts-expect-error scale remains numeric
 factory.create('unit',7,'neutral',owner,{scale:'large'});
 // @ts-expect-error definition brain payload is linked to the body's shape
 definition.brain=42;
 // @ts-expect-error reserve definition preserves its host payload
 definition.reserves=[{id:'fuel'}];
 // @ts-expect-error shared support tables cannot be assigned through the borrowed view
 ports.supports.one={id:'valid',support:true};
 // @ts-expect-error support payload shape is separately enforced
 const wrongSupport:typeof ports.supports.one={id:'wrong',support:false};
 void wrongSupport;
 // @ts-expect-error allocation must return synchronously
 ports.allocate=async()=>owner;
 // @ts-expect-error random values must return synchronously
 ports.random=async()=>.5;
 // @ts-expect-error skill construction must return synchronously
 ports.makeSkill=async()=>owner.skills[0]!;
 // @ts-expect-error item rarity is linked to the definition contract
 ports.rollItem({ilvl:7,rarity:'common'});
 // @ts-expect-error tone shape stays linked to the body
 ports.startTone=()=> 'unrelated';
 return factory;
}
