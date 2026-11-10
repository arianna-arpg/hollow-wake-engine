import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';import {SKILLS} from '../src/data/skills';import type {Actor} from '../src/engine/actor';
// Diagnostic carrier graph, run unchanged against both original and installed
// runtime. Carrier fields unrelated to retirement are deliberately unused.
const restore=seedGlobalRandom(91826);
try{
 const w=makeSimWorld('tamer',91826);w.grantStartingCompanions();const owner=w.player,beast=w.actors.find(a=>a.companion&&a.owner===owner)!;assert(beast);
 const state=(w.companionBonds as unknown as {states:Map<Actor,{issued:Set<SkillInstance>;granted:Map<string,SkillInstance>}>}).states.get(beast)!;
 const issued=makeSkillInstance(SKILLS.claw),granted=makeSkillInstance(SKILLS.claw),native=beast.skills.find(s=>s)!;
 state.issued.add(issued);state.granted.set('diagnostic',granted);
 const rows=<T>()=>[{caster:beast,inst:issued},{caster:beast,inst:granted},{caster:owner,inst:issued},{caster:beast,inst:native}] as T[];
 w.pendingRepeats=rows();w.projectiles=rows();w.pendingFuses=rows();w.zones=rows();
 const retained=[w.pendingRepeats.slice(2),w.projectiles.slice(2),w.pendingFuses.slice(2),w.zones.slice(2)],retired:unknown[]=[];
 const ownedZones=w.zones.slice(0,2);w.retireOwnedZone=z=>{retired.push(z);w.zones.splice(w.zones.indexOf(z),1);};
 beast.casting={inst:issued} as NonNullable<Actor['casting']>;w.companionBonds.down(beast);
 assert.deepEqual(w.pendingRepeats,retained[0]);assert.deepEqual(w.projectiles,retained[1]);assert.deepEqual(w.pendingFuses,retained[2]);assert.deepEqual(w.zones,retained[3]);
 assert.deepEqual(retired,[ownedZones[1],ownedZones[0]],'Retire zones backwards through the host lifecycle');assert.equal(beast.casting,null);assert.equal(state.issued.size,0);
 beast.casting={inst:native} as NonNullable<Actor['casting']>;const cast=beast.casting;w.companionBonds.down(beast);assert.equal(beast.casting,cast);assert.equal(retired.length,2);
 console.log('Companion binding ownership: 9 assertions passed');
}finally{restore();}
