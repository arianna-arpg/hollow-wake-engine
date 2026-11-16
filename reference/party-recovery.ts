import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {Actor} from '../src/engine/actor';
import {MERC_CFG} from '../src/meta/mercs';
import {transitRadius, transitDwell} from '../src/data/transit';

const courses = [];
for (const name of ['alone', 'ally-dead', 'ally-downed', 'merc-policy', 'revive', 'moved-away', 'acted', 'unreachable', 'two-revivers']) {
  const w = makeSimWorld('warrior', 444) as any, events: unknown[] = [];
  w.scene = null; w.time = 10;
  const bodies = [0, 1, 2].map(i => {
    const a = new Actor('body' + i, 'player', {x: i * 20, y: 0}); a.id = i + 1;
    a.sheet.setBase('life', 100); a.sheet.setBase('mana', 80); a.life = i ? 100 : 0; a.mana = 3;
    a.dead = i === 0; return a;
  });
  const seats = bodies.map((actor, i) => ({id: 'p' + i, actor, lastActedAt: 0, reviveDwellBy: new Map<string, number>()}));
  w.seats = name === 'alone' ? seats.slice(0, 1) : name === 'two-revivers' ? seats : seats.slice(0, 2);
  w.seatByActor = new Map(w.seats.map((s: any) => [s.actor, s]));
  w.actors = bodies; w.concludeWipe = () => events.push(['defeated']);
  w.showCompanionCue = (a: Actor) => events.push(['down', a.id]);
  w.showRecoveryCue = (a: Actor) => events.push(['revive', a.id]);
  w.events.emit = (kind: string, value: any) => events.push([kind, value.actor.id]);
  let reachable = name !== 'unreachable'; w.dwellReachable = () => reachable;
  if (name === 'ally-dead') bodies[1].dead = true;
  if (name === 'ally-downed') bodies[1].downed = true;
  if (name === 'merc-policy') (seats[1] as any).merc = {name: 'helper'};
  const state = () => ({bodies: bodies.map(a => ({dead: a.dead, downed: a.downed, life: a.life, mana: a.mana})),
    dwell: seats.map(s => [...s.reviveDwellBy]), events: JSON.parse(JSON.stringify(events))});
  const initial = state(); w.onPlayerDown(bodies[0]);
  const entered = state(), steps = [];
  for (const [index, dt] of [.4, .4, .6, .5].entries()) {
    if (index === 1 && name === 'moved-away') bodies[1].pos.x = 500;
    if (index === 2 && name === 'moved-away') bodies[1].pos.x = 20;
    if (index === 1 && name === 'acted') seats[1].lastActedAt = w.time;
    w.updateDownedSeats(dt); steps.push({dt, time: w.time, allyX: bodies[1].pos.x, lastActed: seats[1].lastActedAt, reachable, expected: state()});
    w.time += dt;
  }
  courses.push({name, initial, entered, steps});
}
writeFileSync(process.argv[2], JSON.stringify({originalOnly: true, rules: {mercsCanRevive: MERC_CFG.mercsCanRevive,
  radius: transitRadius('revive', 110), dwell: transitDwell('revive', 1), lifeFraction: .35, idleGrace: .15}, courses}));
