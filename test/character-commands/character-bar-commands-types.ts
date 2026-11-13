import {changeCharacterBar,type CharacterBarPorts} from '../../src/character-bar-commands.js';
declare const ports:CharacterBarPorts;
const result=changeCharacterBar(ports,{op:'bind',slot:1,skillId:'bolt'});
const bar:(string|null)[]=result.bar;
for(const event of result.events)if(event.kind==='remember-skill-slot')event.slot.toFixed();else event.skillIds.map(id=>id.toUpperCase());
// @ts-expect-error a live actor is not an owned build handle
changeCharacterBar({...ports,build:{}},{});
// @ts-expect-error build reads must be synchronous
changeCharacterBar({...ports,builds:{read:async token=>ports.builds.read(token)}},{});
// @ts-expect-error prepared slots contain identifiers, not skill objects
bar.push({id:'bolt'});
// @ts-expect-error events cannot authorize writes to account state
result.events.push({kind:'account-write',key:'currency',value:100});
