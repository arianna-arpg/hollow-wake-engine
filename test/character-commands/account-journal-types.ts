import type {PreparedAccountView,CharacterReadonlyJSON} from '../../src/complete-character-contracts.js';
import type {CharacterPublicationCommit,CharacterJournalEntry} from '../../src/durable-character-located-owner.js';
declare const packet:CharacterPublicationCommit;
const view:PreparedAccountView=packet.journal[0].accounts[0].after;
const before:PreparedAccountView=packet.journal[0].accounts[0].before;
void before;
// @ts-expect-error admitted metadata cannot be reassigned
view.version=3;
// @ts-expect-error account publication is immutable
view.save.credits=3;
declare const nested:Extract<CharacterReadonlyJSON,{readonly [key:string]:CharacterReadonlyJSON}>;
// @ts-expect-error nested records also remain immutable
nested.changed=true;
declare const list:Extract<CharacterReadonlyJSON,readonly unknown[]>;
// @ts-expect-error nested arrays also remain immutable
list.push(3);
// @ts-expect-error every complete entry supplies account transitions
const missing:CharacterJournalEntry={index:0,command:null,reply:null,transitions:[]};
void missing;
