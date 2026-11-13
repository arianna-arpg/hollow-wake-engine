import {changeCharacterSupport,type CharacterSupportPorts} from '../../src/character-support-commands.js';
declare const ports:CharacterSupportPorts;
const result=changeCharacterSupport(ports,{op:'socket',residence:'learned',skillId:'bolt',uid:1},{hold:null});
result.request?.state.skillBook.bar.map(id=>id?.toUpperCase());
for(const event of result.events)if(event.kind==='resync-supports')event.skillId.toUpperCase();
for(const grant of result.grants??[])grant.hostUid.toFixed();
// @ts-expect-error a view is not an owned character build
changeCharacterSupport({...ports,build:ports.builds.read(ports.build)},{},{});
// @ts-expect-error support compatibility must return synchronously
changeCharacterSupport({...ports,builds:{...ports.builds,canSocket:async()=>true}},{},{});
// @ts-expect-error a bag placement must report success synchronously
changeCharacterSupport({...ports,inventory:{...ports.inventory,autoPlace:async()=>true}},{},{});
// @ts-expect-error the character draft does not own account authority
ports.saved.state.account={};
// @ts-expect-error item identity allocation is numeric
changeCharacterSupport({...ports,saved:{...ports.saved,nextUid:'1'}},{},{});
// @ts-expect-error resync events address explicit skill identities
result.events.push({kind:'resync-supports'});
// @ts-expect-error these commands cannot directly authorize world delivery
result.events.push({kind:'retire-world-drop',id:1});
