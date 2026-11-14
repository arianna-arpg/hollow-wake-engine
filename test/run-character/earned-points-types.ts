import type {RunAction,RunCharacterSession} from '../../src/run-character-session.js';
import type {DurableRunOwner} from '../../src/durable-run-owner.js';
import type {CharacterPointGrant} from '../../src/character-workshop-commands.js';
import type {CompleteAccountPorts} from '../../src/complete-account-commands.js';
declare const run:RunCharacterSession,host:DurableRunOwner<{stamp:number}>,grant:CharacterPointGrant;
run.prepareTrusted([{kind:'points',profile:1,currency:'passive',amount:2},{kind:'run-ledger',key:'quest:one',amount:1}]);
host.submitTrusted([{kind:'points',characterKey:'hero',currency:'vocation',amount:3},{kind:'run-ledger',characterKey:'hero',key:'quest:one',amount:1}]);
// @ts-expect-error Earned point grants require the trusted host entry point.
host.submit([{kind:'points',characterKey:'hero',currency:'passive',amount:2}]);
// @ts-expect-error Run completion counters require the trusted host entry point.
host.submit([{kind:'run-ledger',characterKey:'hero',key:'quest:one',amount:1}]);
// @ts-expect-error Unsupported point currency.
const wrongCurrency:RunAction={kind:'points',profile:1,currency:'gold',amount:1};
// @ts-expect-error Grants carry a delta, never a replacement character save.
const replacement:RunAction={kind:'points',profile:1,currency:'passive',amount:1,character:{}};
// @ts-expect-error Run counters cannot replace the complete ledger.
const ledger:RunAction={kind:'run-ledger',key:'quest:one',amount:1,ledger:{}};
// @ts-expect-error Run keys are required for individual counter grants.
const noKey:RunAction={kind:'run-ledger',amount:1};
// @ts-expect-error A checkpoint grant uses stable character keys.
host.submitTrusted([{kind:'points',profile:1,currency:'passive',amount:1}]);
// @ts-expect-error A checkpoint counter must carry a registered character key.
host.submitTrusted([{kind:'run-ledger',key:'quest:one',amount:1}]);
// @ts-expect-error Points remain character-owned, not attached to a run row.
run.read().characters[0].vocationPoints;
// @ts-expect-error Grant values are immutable.
grant.amount=100;
// @ts-expect-error The owner consumes the grant synchronously.
const asynchronous:CompleteAccountPorts['points']=async()=>({currency:'passive',amount:1});
void [wrongCurrency,replacement,ledger,noKey,asynchronous];
