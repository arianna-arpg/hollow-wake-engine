import {PassiveActions,type PassiveActionPorts} from '../../src/passive-actions.js';
type Seat={character:string};type Skill={skill:string};type Body={body:string};
declare const ports:PassiveActionPorts<Seat,Skill,Body>;
const actions=new PassiveActions(ports),seat:Seat={character:'hero'};
actions.allocate(seat,'node','choice');actions.refund(seat,'node');actions.bindGraft(seat,'graft',null);
actions.ensureOpenRoots(seat);actions.ensureRealmRoots(seat,'tree');actions.grantRealmPoints(seat,'favor',1);
// @ts-expect-error authority remains seat-specific
actions.allocate({character:3},'node');
// @ts-expect-error command identifiers are strings
actions.bindGraft(seat,'graft',17);
// @ts-expect-error effects must finish synchronously
new PassiveActions({...ports,recalculate:async()=>{}});
// @ts-expect-error policy reads cannot return a promise
new PassiveActions({...ports,session:async()=>ports.session(seat)});
// @ts-expect-error body capture is a synchronous snapshot
new PassiveActions({...ports,summons:async()=>[]});
// @ts-expect-error body liveness cannot be asynchronous
new PassiveActions({...ports,alive:async()=>true});
