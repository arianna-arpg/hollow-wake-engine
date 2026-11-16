import {writeFileSync} from 'node:fs';
import {Timeflow} from '../src/engine/timeflow';
import {STATUS_DEFS} from '../src/engine/status';
const status = Object.fromEntries(Object.entries(STATUS_DEFS).filter(([, d]) => d.timeScale !== undefined).map(([id, d]) => [id, {timeScale: d.timeScale}]));
if (!Object.keys(status).length) throw Error('No authored chrono status');
const common = [{op: 'frame', dt: .1}, {op: 'frame', dt: .4}, {op: 'frame', dt: 1}, {op: 'frame', dt: 10}];
const recipes: {name: string; ops: any[]}[] = [
  {name: 'quiet', ops: common},
  {name: 'world', ops: [{op: 'hold', value: {id: 'slow', scale: .5, duration: .5}}, ...common]},
  {name: 'actor-pack', ops: [{op: 'hold', value: {id: 'stop', scale: 0, duration: 1, actors: {exceptIds: [1], exceptOwnedBy: [1]}}}, ...common]},
  {name: 'mixed-clock', ops: [{op: 'hold', value: {id: 'world', scale: .5}}, {op: 'hold', value: {id: 'body', scale: .25, actors: {onlyTeam: 'enemy'}}}, ...common]},
  {name: 'menu-freeze', ops: [{op: 'hold', value: {id: 'magic', scale: 0, duration: 1}}, {op: 'frame', dt: .5}, {op: 'hold', value: {id: 'pause', kind: 'menu', scale: 0}},
    {op: 'frame', dt: 50}, {op: 'release', id: 'pause'}, {op: 'frame', dt: .5}]},
  {name: 'refresh', ops: [{op: 'hold', value: {id: 'same', scale: .2, duration: 1}}, {op: 'frame', dt: .4}, {op: 'hold', value: {id: 'same', scale: 2, duration: .5, hud: {label: 'fast'}}}, ...common]},
  {name: 'kind-release', ops: [{op: 'hold', value: {id: 'a', kind: 'skill', scale: .5, hud: {label: 'a'}}}, {op: 'hold', value: {id: 'b', kind: 'skill', scale: .5, actors: {exceptTeam: 'player'}, hud: {label: 'b'}}},
    {op: 'kind', kind: 'skill'}, ...common]},
  {name: 'menu-refusal', ops: [{op: 'hold', value: {id: 'same', scale: .3}}, {op: 'allow', value: false}, {op: 'hold', value: {id: 'same', kind: 'menu', scale: 0}}, ...common]},
  {name: 'live-facts', ops: [{op: 'hold', value: {id: 'stop', scale: 0, actors: {onlyTeam: 'enemy'}}}, {op: 'team', id: 2, team: 'enemy'}, {op: 'status', id: 1, statuses: Object.keys(status).map(id => ({id}))}, ...common]},
];
const courses = recipes.map(recipe => {
  const clock = new Timeflow(), owner: any = {id: 1, team: 'player', statuses: []},
    child: any = {id: 2, team: 'player', owner, statuses: []}, actors = [owner, child, {id: 3, team: 'player', owner: child, statuses: []}, {id: 4, team: 'enemy', statuses: []}];
  const steps = recipe.ops.map(op => {
    let result;
    switch (op.op) {
      case 'hold': result = clock.hold(structuredClone(op.value)); break;
      case 'frame': result = clock.beginFrame(op.dt); break;
      case 'release': clock.release(op.id); break;
      case 'kind': clock.releaseKind(op.kind); break;
      case 'allow': clock.allowHold = () => op.value; break;
      case 'team': actors.find(a => a.id === op.id)!.team = op.team; break;
      case 'status': actors.find(a => a.id === op.id)!.statuses = structuredClone(op.statuses); break;
    }
    return {result: result ?? null, age: clock.age, active: clock.active, world: clock.worldScale(), overlay: clock.overlay(),
      body: actors.map(a => clock.actorScale(a)), full: actors.map(a => clock.scaleFor(a)), skill: clock.heldBy('skill'), menu: clock.heldBy('menu')};
  });
  return {...recipe, steps};
});
writeFileSync(process.argv[2], JSON.stringify({originalOnly: true, status, courses}));
