import {writeFileSync} from 'node:fs';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance} from '../src/engine/skills';
import {Satellites} from '../src/engine/satellites'; import {Auroras} from '../src/engine/auroras';
import {Guardians} from '../src/engine/guardians'; import {Creepers} from '../src/engine/creepers';
import {SATELLITES, SATELLITE_IDS, SATELLITE_CFG} from '../src/engine/satelliteSpec';
import {AURORAS, AURORA_IDS, AURORA_CFG} from '../src/engine/auroraSpec';
import {GUARDIANS, GUARDIAN_IDS, GUARDIAN_CFG} from '../src/engine/guardianSpec';
import {CREEPERS, CREEPER_IDS, CREEPER_CFG} from '../src/engine/creeperSpec';
import {SATELLITE_SKILLS} from '../src/data/satellites'; import {AURORA_SKILLS} from '../src/data/auroras';
import '../src/data/guardians'; import {CREEPER_SKILLS} from '../src/data/creepers';

const definitions = {...SATELLITE_SKILLS, ...AURORA_SKILLS, ...CREEPER_SKILLS};
const rules = {
  satellites: {definitions: SATELLITES, ids: SATELLITE_IDS, config: SATELLITE_CFG},
  auroras: {definitions: AURORAS, ids: AURORA_IDS, config: AURORA_CFG},
  guardians: {definitions: GUARDIANS, ids: GUARDIAN_IDS, config: GUARDIAN_CFG},
  creepers: {definitions: CREEPERS, ids: CREEPER_IDS, config: CREEPER_CFG},
};
const recipes: {family: keyof typeof rules; id: string; mutation?: string}[] = [];
for (const [family, rows] of Object.entries(rules)) for (const id of rows.ids) recipes.push({family: family as keyof typeof rules, id});
for (const mutation of ['teleport', 'allegiance', 'removed', 'downed', 'inactive', 'blocked', 'retire-on-hit']) recipes.push({family: 'satellites', id: 'iron_wake', mutation});
for (const mutation of ['removed', 'allegiance', 'inactive']) recipes.push({family: 'satellites', id: 'cinder_wake', mutation});
for (const mutation of ['blocked', 'retire-on-hit', 'teleport']) recipes.push({family: 'creepers', id: 'barrow', mutation});
recipes.push({family: 'auroras', id: 'pall', mutation: 'resize'}, {family: 'guardians', id: 'graveglass', mutation: 'blocked'});
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const courses = [];
for (const recipe of recipes) {
  const controllers = {satellites: new Satellites(), auroras: new Auroras(), guardians: new Guardians(), creepers: new Creepers()};
  const controller = controllers[recipe.family], owner = new Actor('Owner', 'player', {x: 0, y: 0}); owner.id = 1;
  const actors = [owner];
  for (let i = 0; i < 8; i++) {const angle = i * Math.PI / 4; const a = new Actor('Target', 'enemy', {x: 60 * Math.cos(angle), y: 60 * Math.sin(angle)}); a.id = i + 2; actors.push(a);}
  const stat = ({satellites: 'satelliteCount_', auroras: 'auroraCapacity_', guardians: 'guardianCount_', creepers: 'creeperCount_'})[recipe.family] + recipe.id;
  owner.sheet.setBase(stat as any, 2);
  const instances = new Map(Object.entries(definitions).map(([id, def]) => [id, makeSkillInstance(def, 1)]));
  const events: unknown[] = [], steps = []; let frame = 0, blocked = false, active = true;
  const context = {active: () => active, elapsed: (_a: Actor, dt: number) => dt,
    enemies: (a: Actor) => actors.filter(b => b.team !== a.team && !b.dead), hostile: (a: Actor, b: Actor) => a.team !== b.team,
    clear: () => !blocked, instance: (_a: Actor, id: string) => instances.get(id),
    hit: (a: Actor, i: any, target: Actor) => {events.push(['hit', frame, a.id, i.def.id, target.id]); if (recipe.mutation === 'retire-on-hit') controller.retire(a);},
    radius: (_a: Actor, i: any) => i.def.delivery.radius ?? 5,
    launch: (a: Actor, i: any, from: unknown, direction: number) => events.push(['launch', frame, a.id, i.def.id, plain(from), direction]),
    move: (_a: Actor, from: {x: number; y: number}, to: {x: number; y: number}, _radius: number, distance: number) => {
      if (blocked) return {...from}; const length = Math.hypot(to.x - from.x, to.y - from.y), scale = length ? Math.min(1, distance / length) : 0;
      return {x: from.x + (to.x - from.x) * scale, y: from.y + (to.y - from.y) * scale};
    }};
  for (frame = 0; frame < 48; frame++) {
    if (frame === 10) {
      switch (recipe.mutation) {
        case 'teleport': owner.pos = {x: 500, y: 0}; break;
        case 'allegiance': owner.faction = 'new-side'; break;
        case 'removed': owner.sheet.setBase(stat as any, 0); break;
        case 'downed': owner.downed = true; break;
        case 'inactive': active = false; break;
        case 'blocked': blocked = true; break;
        case 'resize': owner.sheet.setBase(stat as any, 3); break;
      }
    }
    controller.update(actors, .25, context);
    if (frame % 4 === 0) {
      if (recipe.family === 'guardians') {
        const result = controllers.guardians.intercept(actors[1], 0, {x: 200, y: 0}, {x: -200, y: 0}, 4, context);
        events.push(['intercept', frame, result ?? null]);
      } else if (recipe.family === 'satellites') {
        const result = controllers.satellites.reflectProjectiles(actors[1], 0, {x: 200, y: 0}, {x: -200, y: 0}, 10, context);
        events.push(['reflect', frame, result ? {...result, owner: result.owner.id} : null]);
      }
    }
    steps.push(plain({visuals: controller.visuals, flights: recipe.family === 'satellites' ? controllers.satellites.flights.visuals : [], events}));
  }
  controller.retire(owner); const retired = plain(controller.visuals);
  controller.clear(); courses.push({name: recipe.family + ':' + recipe.id + ':' + (recipe.mutation ?? 'normal'), recipe,
    actors: actors.map(a => ({id: a.id, radius: a.radius, team: a.team})), steps, retired, cleared: plain(controller.visuals)});
}
writeFileSync(process.argv[2], JSON.stringify({originalOnly: true, contactSelectionOnly: true, rules, definitions, courses}));
