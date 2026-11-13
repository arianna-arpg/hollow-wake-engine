import {changeCharacterMerge,type CharacterMergePorts} from '../../src/character-merge-commands.js';
import {SkillMergeActions} from '../../src/character-merge-commands.js';
import type {SkillMergeExecutionPorts} from '../../src/skill-merge-execution.js';
declare const ports:CharacterMergePorts, callbacks:SkillMergeExecutionPorts<number,{uid:number},{id:string},{level:number}>;
const result=changeCharacterMerge(ports,{op:'merge',skillId:'bolt',rarity:'common'},{nearFont:true});
result.preview.taken.map(uid=>uid.toFixed());result.worldDrops.map(drop=>drop.gem.kind);
const merge=new SkillMergeActions(callbacks);merge.merge(1,'bolt','common');
// @ts-expect-error placement is synchronous
changeCharacterMerge({...ports,inventory:{...ports.inventory,autoPlace:async()=>true}},{},{});
// @ts-expect-error merged payloads cannot be confused with support payloads
result.worldDrops.push({kind:'support',gem:{kind:'skill',skillId:'bolt',level:1,rarity:'common',sockets:[]}});
// @ts-expect-error a prepared merge cannot directly retire a durable delivery
result.events.push({kind:'retire-delivery',deliveryId:1});
// @ts-expect-error missing callback is not an admitted merge executor
new SkillMergeActions({...callbacks,sockets:undefined});
// @ts-expect-error station authority must be synchronous
new SkillMergeActions({...callbacks,nearFont:async()=>true});
// @ts-expect-error the seat identity is host-typed
merge.merge('1','bolt','common');
