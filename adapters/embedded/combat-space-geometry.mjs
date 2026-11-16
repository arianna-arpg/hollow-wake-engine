import {inAoe} from '../../dist/combat-geometry.js';

/** Shared body-disc rules for host spatial adapters. These queries borrow
 * body facts and never mutate them. Damage attribution stays in the SDK. */
export function createCombatGeometry(content) {
  const q=content.hitQueries;
  const copy=body=>body?{pos:{...body.pos},r:body.r,seg:body.seg}:null;
  return Object.freeze({
    nearestBody:(a,at)=>copy(q.nearestBody(a,at)),
    bodyWhere:(a,predicate)=>copy(q.bodyWhere(a,predicate)),
    inAoeBody:(at,radius,shape,facing,a,arc,predicate)=>copy(q.bodyWhere(a,(pos,r)=>
      inAoe(at,radius,shape,facing,pos,r,arc)&&(!predicate||predicate(pos,r)))),
    reachTo:q.reachTo,segsHittable:q.segsHittable,segR:q.segR,
  });
}
