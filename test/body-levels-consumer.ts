import {BodyLevels,bodyPlyCount,bodySkillLevel,type BodyLevelPorts,type BodyLevelDefinition,type BodyPlySpec} from '@hollow-wake/engine/bodies/levels';
type Skill={level:number;hostId:string};
type Modifier={stat:string;kind:'flat'|'increased'|'more';value:number};
type Actor={defId?:string;level:number;life:number;plies:number;pliesMax:number;skills:(Skill|null)[]};
declare const ports:BodyLevelPorts<Actor,Modifier,BodyPlySpec>;
declare const actor:Actor;
declare const definition:BodyLevelDefinition<BodyPlySpec>;
const levels=new BodyLevels<Actor,Skill,Modifier,BodyPlySpec>(ports,4);
levels.stamp(actor,definition,7);levels.relevel(actor,9);
const capacity:number=bodyPlyCount({count:4,perLevel:.5},7),level:number=bodySkillLevel(7);
void capacity;void level;
// @ts-expect-error Host stat-write ports are required.
new BodyLevels<Actor,Skill,Modifier,BodyPlySpec>({definition:ports.definition});
// @ts-expect-error The original scaling policy has a numeric exponent.
levels.stamp(actor,{base:{},scaling:{life:{pow:'two'}}},7);
// @ts-expect-error Level mutation is numeric.
levels.relevel(actor,'nine');
