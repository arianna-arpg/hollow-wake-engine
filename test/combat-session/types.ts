import {createCombatSession,type CombatHost,type CombatActor,type CombatCharacterKit} from '@hollow-wake/combat';
import {combatContent} from '@hollow-wake/combat/content';
import type {CharacterSession} from '@hollow-wake/engine/character/session';
import {createCharacterKit} from '@hollow-wake/characters';
declare const host:CombatHost,character:CharacterSession,buildPack:unknown,characterPack:unknown;
const kit:CombatCharacterKit=createCharacterKit(buildPack,characterPack);
const observedHost:CombatHost={...host,observers:{
  healed:(actor:{readonly id:number},amount:number)=>[actor.id,amount],
  death:{enemyKilled(actor,killer,credit){
    const actorId:number=actor.id;
    const killerId:number|undefined=killer?.id;
    const credited:boolean=credit;
    // @ts-expect-error Outcome credit is a boolean, not a reward amount.
    const amount:number=credit;
    void [actorId,killerId,credited,amount];
  }},
}};
createCombatSession(combatContent,observedHost);
const combat=createCombatSession(combatContent,host,{seed:1,capacity:16});
const hero=combat.addCharacter(kit,character,{name:'Hero',position:{x:10,y:10}});
combat.commitCharacter(hero,character.authorize({kind:'xp',amount:10}));
combat.press(hero,'firebolt',{x:20,y:10});combat.advance(.1);combat.inspect(hero).life;
const charges:[string,number][]=combat.inspect(hero).charges;
void charges;
// @ts-expect-error A numeric id does not confer session ownership.
combat.inspect(1);
// @ts-expect-error Handles cannot be manufactured from a visible id.
const forged:CombatActor={id:1};
// @ts-expect-error Unknown input direction cannot be passed as a point.
combat.press(hero,'firebolt','north');
// @ts-expect-error Content is compiled, not a bare capability string.
createCombatSession({capability:'combat-content/v1'},host);
