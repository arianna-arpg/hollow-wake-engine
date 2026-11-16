import {MinionOrders} from '../../dist/minion-orders.js';
import {ThrongOrders} from '../../dist/throng-orders.js';
import {MinionPour} from '../../dist/minion-pour.js';

/** Spell-owned recipient selection and order publication. General navigation
 * consumes these orders in the host; it does not choose combat effect rules. */
export function installCombatOrders(w, content) {
  const q = {...content.queries, ...content.hitQueries}, r = content.staticRules;
  const commands = new Set(r.commandKinds);
  const throng = new ThrongOrders(r.throng.direct, {
    actors: () => w.actors, enemies: actor => w.enemiesOf(actor), time: () => w.time, evolution: q.throngEvolution,
    bodies: (...args) => w.throngBodiesOf(...args), rosterCount: (...args) => w.throngRosterCount(...args), capacity: (...args) => w.throngCapOf(...args),
    kind: id => w.liteKindOf(id), used: () => w.lite.used, countOwned: (...args) => w.lite.countOwned(...args),
    promote: (...args) => w.litePromoteNearest(...args), unclasp: actor => w.clingRelease(actor),
    clamp: (at, radius, mover) => w.clampPos(at, radius, undefined, {mover}),
    pooledOrder: (owner, kind, order) => w.liteOrders.set(owner * 256 + kind, order),
    issue: (...args) => w.issueCommand(...args), empty: (actor, id) => w.failNote(actor, id + ':nothrong', 'no throng gathered'),
  });
  const minions = new MinionOrders({...r.commands, delegates: r.throng.metaDelegate}, {
    actors: () => w.actors, enemies: actor => w.enemiesOf(actor), time: () => w.time, random: () => w.random(),
    commandExists: kind => commands.has(kind), skillExists: id => !!q.SKILLS[id], serves: (...args) => w.minionServes(...args),
    throng: q.isThrongBody, obedience: actor => w.obedienceOf(actor), issue: (...args) => w.issueCommand(...args),
    promoteCommand: (...args) => throng.promoteCommand(...args), liteKind: id => w.liteKindOf(id), promote: (...args) => w.litePromoteNearest(...args),
    level: q.effectiveSkillLevel, makeSkill: (id, level) => q.makeSkillInstance(q.SKILLS[id], level),
    forwardSockets: (...args) => w.forwardSummonSockets(...args), execute: (...args) => w.executeSkill(...args),
    assault: (...args) => w.assaults.command(...args),
    defied: actor => w.text({x: actor.pos.x, y: actor.pos.y - 14}, 'defies!', '#c08a68', 10),
    sent: (at, color) => {w.flashes.push({pos: at, radius: 40, color, life: .3, maxLife: .3});},
    unheeded: actor => w.text({x: actor.pos.x, y: actor.pos.y - 18}, 'unheeded!', '#c08a68', 11),
    empty: (actor, id) => w.failNote(actor, id + ':nominions', 'no minions to command'),
    unknown: (kind, id) => {throw Error(`Unadmitted command kind ${kind} on ${id}`);},
  });
  const pour = new MinionPour(w.litePockets, r.lite.pour.scatter, {
    kind: id => w.liteKindOf(id), definition: index => w.liteKinds[index], random: () => w.random(),
    open: (...args) => w.liteOpenAt(...args), spawn: (...args) => w.lite.spawn(...args),
  });
  w.throngDirect = (...args) => throng.direct(...args);
  w.promoteCommandThrong = (...args) => throng.promoteCommand(...args);
  w.litePourAt = (...args) => pour.pour(...args);
  return Object.freeze({throng, minions, pour});
}
