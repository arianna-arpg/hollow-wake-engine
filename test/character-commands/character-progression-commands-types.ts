import {changeCharacterProgression,type CharacterProgressionPorts} from '../../src/character-progression-commands.js';
declare const ports:CharacterProgressionPorts;
const result=changeCharacterProgression(ports,{op:'pick',skillId:'bolt',nodeId:'power'},{nearFont:true,memory:{},hold:null});
result.grants?.map(edit=>edit.hostUid?.toFixed());result.request?.character.abilityEssences.rough.toFixed();
// @ts-expect-error trigger observation must be synchronous
changeCharacterProgression({...ports,trigger:async()=>({on:'hit'})},{},{});
// @ts-expect-error trigger identity is a descriptor, not a live callback
changeCharacterProgression({...ports,trigger:()=>()=>{}},{},{});
// @ts-expect-error query authority is mandatory
changeCharacterProgression({...ports,trigger:undefined},{},{});
// @ts-expect-error derived build reads cannot be deferred
changeCharacterProgression({...ports,builds:{read:async()=>ports.builds.read(ports.build)}},{},{});
// @ts-expect-error an item identity is numeric
result.grants?.push({skillId:'bolt',hostUid:'1',state:{sockets:[]}});
// @ts-expect-error emitted effects do not execute save writes
result.events.push({kind:'save-account'});
