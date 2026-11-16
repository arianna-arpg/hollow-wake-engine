import {PartyRecovery} from '../../dist/party-recovery.js';
import {CompanionGrants} from '../../dist/companion-grants.js';

/** Combat-owned death consequences. Optional scene/campaign consumers observe
 * the result; they are never required to retire or revive a combat body. */
export function installCombatLifetimes(w, content) {
  const q = {...content.queries, ...content.hitQueries}, rules = content.staticRules.partyRecovery;
  const party = new PartyRecovery({...rules, radius: q.transitRadius('revive', rules.radius), dwell: q.transitDwell('revive', rules.dwell)}, {
    seats: () => w.seats, time: () => w.time,
    reachable: (ally, fallen) => w.host.space.dwellReachable(ally.pos, fallen.pos, q.transitReach('revive'),
      {from: ally.tier ?? 0, to: fallen.tier ?? 0}),
    defeated: (actor, killer) => {w.signal('party-defeated', {actor: actor.id, killer: killer?.id}); w.observers.defeated?.(actor, killer);},
    downed: (actor, killer) => {w.signal('player-downed', {actor: actor.id, killer: killer?.id}); w.showCompanionCue(actor, 'down');},
    revived: seat => {w.signal('player-revived', {actor: seat.actor.id, seat: seat.id}); w.showRecoveryCue(seat.actor, 'revive');},
  });
  w.onPlayerDown = (actor, killer) => party.down(actor, killer);
  w.reviveSeat = seat => party.revive(seat);
  w.updateDownedSeats = dt => party.advance(dt);
  const grants = new CompanionGrants({
    summon: def => def.delivery.type === 'summon' ? def.delivery : undefined,
    maxLevel: q.skillMaxLevel, grantedLevel: (actor, def) => actor.sheet.get('companiongrant_' + def.id),
    makeSkill: q.makeSkillInstance,
    respawnScale: (actor, inst) => actor.sheet.get('minionRespawnTime', q.skillContextTags(inst), q.instanceMods(inst)),
  });
  const grantStates = new WeakMap();
  const grantState = actor => {
    let state = grantStates.get(actor);
    if (!state) grantStates.set(actor, state = {});
    return state;
  };
  w.companionGrants = {
    derive: (actor, ...args) => grants.derive(grantState(actor), actor, ...args),
    update: (actor, actors, dt, spawn, retire) => grants.update(grantState(actor), actor, dt, body => actors.includes(body), spawn, retire),
  };
  w.releaseGarrison = actor => {
    if (!actor.garrison) return;
    const slot = actor.garrison.slotId;
    actor.garrison = undefined; actor.anchored = false; actor.sheet.setSource('garrison', []);
    w.host.space.releaseGarrison?.(actor.id, slot);
  };
  // All current authored crew-on-death rows are inherited summons. Admission
  // checks this finite verb set before their parent can be summoned or paid for.
  w.runSummonDeathActions = (actor, actions) => {
    for (const action of actions) {
      if (action.do !== 'summon' || !action.inheritSummon) throw Error('Unadmitted summon death action: ' + action.do);
      w.spawnSummonOffspring(actor, action);
    }
  };
  w.throngStandNear = (at, tier = 0) => {
    for (let i = 0; i < 10; i++) {
      const angle = w.random() * Math.PI * 2, distance = 10 + w.random() * 32;
      const x = at.x + Math.cos(angle) * distance, y = at.y + Math.sin(angle) * distance;
      if (!w.host.space.isWalkable(x, y, tier) || w.host.space.pointInSolid(x, y, 8, tier)) continue;
      return {x, y};
    }
    return w.clampPos({...at}, 8, undefined, tier >= 1 ? {tier} : undefined);
  };
  return Object.freeze({party, grants, grantState});
}
