import {CharacterWorkshopAdmission,type CharacterWorkshopDefinitions,type CharacterWorkshopHandle,type CharacterWorkshopScope} from '../../src/character-workshop-commands.js';
import type {CharacterBuild} from '../../src/character-builds.js';
declare const definitions:CharacterWorkshopDefinitions,scope:CharacterWorkshopScope,foreign:CharacterBuild;
const owner=new CharacterWorkshopAdmission(definitions),handle=owner.admit({},scope),view=owner.read(handle);
view.nextUid.toFixed();view.projection.bar.map(row=>row?.id.toLowerCase());
owner.rebuild(handle,{},scope,view.state.skillBook.bar);
// @ts-expect-error handles are owned, opaque continuations
const forged:CharacterWorkshopHandle={};
// @ts-expect-error a build continuation is not a character command continuation
owner.read(foreign);
// @ts-expect-error character commands need explicit account scope
owner.rack(handle,undefined,{op:'learn',uid:1},{meets:true,blocked:{}});
// @ts-expect-error relic custody cannot be implied from a boolean
owner.admit({},{...scope,relics:true});
// @ts-expect-error trigger lookup must complete synchronously
new CharacterWorkshopAdmission({...definitions,trigger:async()=>({on:'hit'})});
// @ts-expect-error the account owner supplies a valid deterministic stream
owner.inventory(handle,scope,{op:'lock',uid:1,on:true},{algorithm:'ambient',state:1,draws:0});
// @ts-expect-error bar bindings are skill identifiers
owner.rebuild(handle,{},scope,[1]);
void forged;
