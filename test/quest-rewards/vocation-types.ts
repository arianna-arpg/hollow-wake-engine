import type {RunCharacterSession,RunAction,RunCharacterPorts} from '../../src/run-character-session.js';
import type {OwnedVocationGrant} from '../../src/character-vocation-commands.js';
declare const run:RunCharacterSession,grant:OwnedVocationGrant;
run.prepareTrusted([{kind:'vocation',profile:1,id:'warbringer'}]);
// @ts-expect-error Definition IDs are strings.
const numberId:RunAction={kind:'vocation',profile:1,id:1};
// @ts-expect-error Session profiles are numeric handles.
const stringProfile:RunAction={kind:'vocation',profile:'hero',id:'warbringer'};
// @ts-expect-error A reward cannot choose account progression policy.
const accountPolicy:RunAction={kind:'vocation',profile:1,id:'warbringer',accountWrites:true};
// @ts-expect-error A reward cannot choose the vocation capacity.
const capacity:RunAction={kind:'vocation',profile:1,id:'warbringer',maxPerCharacter:99};
// @ts-expect-error A reward cannot replace an owned run counter.
const counter:RunAction={kind:'vocation',profile:1,id:'warbringer',runCount:999};
// @ts-expect-error The vocation ID is required.
const missing:RunAction={kind:'vocation',profile:1};
// @ts-expect-error Observations must complete synchronously.
const asynchronous:RunCharacterPorts['vocation']=async()=>({maxPerCharacter:1,accountWrites:true});
// @ts-expect-error Account policy is boolean.
const flag:RunCharacterPorts['vocation']=()=>({maxPerCharacter:1,accountWrites:'true'});
// @ts-expect-error Capacity is numeric.
const cap:RunCharacterPorts['vocation']=()=>({maxPerCharacter:'one',accountWrites:true});
// @ts-expect-error Owned grant identities cannot be changed.
grant.id='other';
// @ts-expect-error Owned run observations cannot be changed.
grant.runCount=42;
// @ts-expect-error Unknown grant kinds cannot enter preparation.
const unknown:RunAction={kind:'ascendancy',profile:1,id:'warbringer'};
void [numberId,stringProfile,accountPolicy,capacity,counter,missing,asynchronous,flag,cap,unknown];
