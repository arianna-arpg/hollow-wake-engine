import {AttributeBequests} from '@hollow-wake/engine/minions/bequests';
import type {AttributeBequest as Bequest} from '@hollow-wake/engine/minions/bequests';
export {bequestStat} from '@hollow-wake/engine/minions/bequests';
import type {Actor} from './actor';
import {ATTRIBUTES,STAT_DEFS,type AttributeId,type Modifier,type SkillTag} from './stats';
export type AttributeBequest=Bequest<AttributeId>;
const runtime=new AttributeBequests<Actor,AttributeId,Modifier,Set<SkillTag>>({
 registerStat:(id,def)=>{STAT_DEFS[id]=def;},armed:(a,prefix,ids,extra)=>a.sheet.armedFamily(prefix,ids,extra),
 stat:(a,id,tags,extra)=>a.sheet.get(id,tags,extra),perPoint:attr=>ATTRIBUTES[attr].perPoint,
 setSource:(a,key,mods)=>a.sheet.setSource(key,mods),removeSource:(a,key)=>a.sheet.removeSource(key),maxLife:a=>a.maxLife(),maxMana:a=>a.maxMana(),
});
export const ATTRIBUTE_BEQUESTS=runtime.state.definitions;
export const ATTRIBUTE_BEQUEST_IDS=runtime.state.ids;
export function registerAttributeBequest(def:AttributeBequest):void{runtime.register(def);}
export function syncAttributeBequests(recipient:Actor,scale=1,tags?:Set<SkillTag>,extra?:Modifier[]):void{runtime.sync(recipient,scale,tags,extra);}
