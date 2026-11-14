import type {RunCharacterSession,RunAction} from '../../src/run-character-session.js';
import type {DurableRunOwner} from '../../src/durable-run-owner.js';
import type {PreparedStepScope} from '../../src/account-prepared-step.js';
declare const run:RunCharacterSession,host:DurableRunOwner<{stamp:number}>;
const action:RunAction={kind:'account-counter',profile:1,key:'quest_done:one',amount:1,mode:'add'};
run.prepareTrusted([action]);host.submitTrusted([{kind:'account-counter',characterKey:'hero',key:'quest_done:one',amount:1,mode:'add'},{kind:'vocation',characterKey:'hero',id:'warbringer'}]);
// @ts-expect-error Ordinary submissions cannot authorize earned account counters.
host.submit([{kind:'account-counter',characterKey:'hero',key:'x',amount:1,mode:'add'}]);
// @ts-expect-error Ordinary submissions cannot authorize earned vocations.
host.submit([{kind:'vocation',characterKey:'hero',id:'warbringer'}]);
// @ts-expect-error Checkpoints bind stable character keys.
host.submitTrusted([{kind:'account-counter',profile:1,key:'x',amount:1,mode:'add'}]);
// @ts-expect-error The counter mode must be supported.
host.submitTrusted([{kind:'account-counter',characterKey:'hero',key:'x',amount:1,mode:'multiply'}]);
// @ts-expect-error A counter action cannot replace a ledger snapshot.
host.submitTrusted([{kind:'account-counter',characterKey:'hero',key:'x',amount:1,mode:'add',ledger:{}}]);
// @ts-expect-error The owner resolves account membership from its binding.
host.submitTrusted([{kind:'account-counter',characterKey:'hero',key:'x',amount:1,mode:'add',accountKey:'other'}]);
// @ts-expect-error Vocation eligibility is not a reward-supplied flag.
host.submitTrusted([{kind:'vocation',characterKey:'hero',id:'warbringer',eligible:true}]);
// @ts-expect-error A vocation grant does not carry counter amounts.
host.submitTrusted([{kind:'vocation',characterKey:'hero',id:'warbringer',amount:1}]);
// @ts-expect-error Counter semantics must be explicit.
run.prepareTrusted([{kind:'account-counter',profile:1,key:'x',amount:1}]);
// @ts-expect-error A run action cannot replace the account ledger.
run.prepareTrusted([{kind:'account-counter',profile:1,key:'x',amount:1,mode:'add',ledger:{}}]);
// @ts-expect-error Counter amounts are numeric.
run.prepareTrusted([{kind:'account-counter',profile:1,key:'x',amount:'one',mode:'add'}]);
// @ts-expect-error Invalid counter operations are rejected.
run.prepareTrusted([{kind:'account-counter',profile:1,key:'x',amount:1,mode:'clear-all'}]);
// @ts-expect-error Prepared counter capabilities must finish synchronously.
const asynchronous:PreparedStepScope['counter']=async()=>({ok:true});
// @ts-expect-error Prepared input actions are immutable.
action.amount=7;
// @ts-expect-error A checkpoint counter requires an amount.
host.submitTrusted([{kind:'account-counter',characterKey:'hero',key:'x',mode:'add'}]);
// @ts-expect-error A vocation checkpoint requires a character binding.
host.submitTrusted([{kind:'vocation',id:'warbringer'}]);
void asynchronous;
