import {DurableRunOwner,type DurableRunOptions,type RunPublication,type RunCheckpoint} from '../../src/durable-run-owner.js';
declare const owner:DurableRunOwner<{stamp:number}>,publication:RunPublication,checkpoint:RunCheckpoint;
owner.submitTrusted([{kind:'experience',characterKey:'hero',amount:7}]);
// @ts-expect-error Ordinary submissions cannot authorize XP awards.
owner.submit([{kind:'experience',characterKey:'hero',amount:7}]);
// @ts-expect-error Stable character keys, not transient runtime handles.
owner.submitTrusted([{kind:'experience',characterKey:'hero',amount:7,profile:1}]);
// @ts-expect-error Player commands cannot provide reward policy flags.
owner.submitTrusted([{kind:'experience',characterKey:'hero',amount:7,eligible:true}]);
// @ts-expect-error Creation always performs asynchronous storage admission.
new DurableRunOwner({});
// @ts-expect-error Internal services are not exposed as another writer.
owner.options;
// @ts-expect-error A publication cannot rewrite the immutable run ledger.
publication.candidate.ledger.devotion_attuned=1;
// @ts-expect-error Ordered journal entries are immutable.
publication.journal.push(publication.journal[0]);
// @ts-expect-error XP checkpoint events cannot be rewritten by a host callback.
publication.journal[0].experience!.after.xp=7;
// @ts-expect-error Private actor preparation must finish synchronously.
const prepare:DurableRunOptions<{stamp:number}>['live']['prepare']=async()=>({stamp:1});
// @ts-expect-error Publication must finish synchronously after acknowledgement.
const publish:DurableRunOptions<{stamp:number}>['live']['publish']=async()=>{};
// @ts-expect-error Cancellation must finish synchronously.
const discard:DurableRunOptions<{stamp:number}>['live']['discard']=async()=>{};
// @ts-expect-error Recovery notification must finish synchronously.
const recover:DurableRunOptions<{stamp:number}>['live']['recoverRequired']=async()=>{};
// @ts-expect-error A committed checkpoint must return a storage revision.
const commit:DurableRunOptions<{stamp:number}>['storage']['commit']=()=>({status:'committed'});
// @ts-expect-error Legacy group shape cannot silently masquerade as a run checkpoint.
const legacy:RunCheckpoint={schemaVersion:2,capability:'durable-character-group/located-diagnostic',group:checkpoint.group,run:checkpoint.run};
void [prepare,publish,discard,recover,commit,legacy];

publication.readBuild(publication.journal[0].character.transitions[0].after!);
// @ts-expect-error Scoped readers cannot be replaced by host code.
publication.readBuild=()=>({});
// @ts-expect-error A read view offers no command authority.
publication.readBuild({}).command({op:'grant'});
// @ts-expect-error A string is not an owned build capability.
publication.readBuild('hero');
