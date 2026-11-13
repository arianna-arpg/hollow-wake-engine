import {changeCharacterRack,type CharacterRackPorts} from '../../src/character-rack-commands.js';
declare const ports:CharacterRackPorts;
const result=changeCharacterRack(ports,{op:'learn',uid:1,slot:0},{meets:true,blocked:{}});
result.replaceLearned?.map(id=>id.toLowerCase());result.bar?.map(id=>id?.toLowerCase());
// @ts-expect-error placement must finish before the command returns
changeCharacterRack({...ports,inventory:{...ports.inventory,place:async()=>true}},{},{});
// @ts-expect-error reads must be synchronous
changeCharacterRack({...ports,builds:{read:async()=>ports.builds.read(ports.build)}},{},{});
// @ts-expect-error a skill identity cannot be replaced by an item identity
result.replaceLearned?.push(1);
// @ts-expect-error events do not confer live actor authority
result.events.push({kind:'clear-live-actor',skillId:'bolt'});
// @ts-expect-error learned entries require skill gems
result.request?.state.skillBook.known.push({gem:{kind:'support',supportId:'power',level:1}});
