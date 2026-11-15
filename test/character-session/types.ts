import {createCharacterKit} from '@hollow-wake/characters';
import {CharacterSession,type CharacterData,type CharacterChange,type CharacterProjection} from '@hollow-wake/engine/character/session';
import type {CharacterSkill} from '@hollow-wake/engine/character/skill-queries';
import type {PricingActor} from '@hollow-wake/engine/character/skill-pricing';
import type {Modifier} from '@hollow-wake/engine';
declare const content:unknown,builds:unknown,data:CharacterData,projection:CharacterProjection,skill:CharacterSkill,actor:PricingActor<Modifier,string>;
const kit=createCharacterKit(builds,content),character:CharacterSession=kit.create('magician');
kit.admit(data,projection);kit.pricing.profile(actor,skill);kit.queries.instanceMods(skill);
const edit:CharacterChange=character.prepare({kind:'inventory',request:{op:'equip',uid:1}},{salvage:false,oracle:false,bench:false,counter:false,study:false});
character.preview(edit);character.commit(edit,{publish(change){change.data.sourceOrder;change.events;change.input;change.projection;}});
character.authorize({kind:'points',currency:'vocation',amount:1});character.authorize({kind:'projection',projection});
character.authorize({kind:'xp',amount:2});character.authorize({kind:'vocation',id:'archmage'});
// @ts-expect-error proposals are opaque, even if their visible fields match
const forged:CharacterChange={accepted:true,changed:true};
// @ts-expect-error campaign awards are not a character command
character.prepare({kind:'quest',request:{}});
// @ts-expect-error host progression is separate from player requests
character.prepare({kind:'xp',amount:500});
// @ts-expect-error persistence is not required by this API
character.commit(edit,{save(){}});
// @ts-expect-error imported character data does not supply entitlement authority
kit.admit(data);
// @ts-expect-error creation does not select account identity
kit.create('magician',{accountKey:'a'});
// @ts-expect-error skill queries retain their modifier result type
const wrong:number=kit.queries.instanceMods(skill);
// @ts-expect-error a character snapshot cannot serve as a publication token
character.commit(data);
void forged;void wrong;
