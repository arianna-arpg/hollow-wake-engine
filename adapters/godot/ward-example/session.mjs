import {Random, StatRules} from '@hollow-wake/engine';
import {ProcContent} from '@hollow-wake/engine/combat/procs';
import {createWardExample} from './proc-delivery.mjs';

// One embedded host shares definitions across actors. Only an equipped actor's
// compact event result crosses the engine boundary.
export function create(input) {
  return {actors:new Map(), content:new ProcContent(input.procs), rules:new StatRules(input.stats)};
}
const refused = reason => ({ok:false,reason});
export function dispatch(root, request) {
  if (!request || !Number.isInteger(request.actor) || request.actor<0 || request.actor>0xffffffff)
    return refused('invalid-actor');
  const id=request.actor, actor=root.actors.get(id);
  switch (request.op) {
    case 'equip': {
      if (actor) return refused('already-equipped');
      if (root.actors.size>=64) return refused('actor-limit');
      if (!Number.isInteger(request.seed) || request.seed<0 || request.seed>0xffffffff) return refused('invalid-seed');
      const random=new Random(request.seed);
      const state={pending:null, service:null, random};
      state.service=createWardExample(root.content,root.rules,{random:()=>random.next(),onCue:cue=>{state.pending=cue;}});
      root.actors.set(id,state);
      return {ok:true};
    }
    case 'low_life': {
      if (!actor) return refused('not-equipped');
      if (!Number.isFinite(request.time) || request.time<actor.service.time) return refused('invalid-time');
      actor.pending=null;
      const ward=actor.service.lowLife(request.time);
      return {ok:true,ward,cue:actor.pending,draws:actor.random.draws};
    }
    case 'remove':
      if (!actor) return refused('not-equipped');
      root.actors.delete(id);return {ok:true};
    default:return refused('unknown-operation');
  }
}
