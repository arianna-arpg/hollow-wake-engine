import {writeFileSync} from 'node:fs';
import {Actor} from '../src/engine/actor';
import {RECENT_KINDS, RECENT_NEVER} from '../src/engine/recency';

function view(a: Actor) {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(a).filter(([,v]) => v !== undefined)), (key, value) =>
    key === 'sheet' ? {$sheet: true} : value instanceof Map ? {$map: [...value]} :
    value instanceof Set ? {$set: [...value]} : value instanceof Float64Array ? {$float64: [...value]} :
    typeof value === 'number' && !Number.isFinite(value) ? {$number: String(value)} : value));
}
const courses = [];
for (const team of ['player', 'ally', 'enemy'] as const) {
  const pos = {x: 19, y: -4}, actor = new Actor('Body', team, pos);
  courses.push({name: team, id: actor.id, input: {name: 'Body', team, pos}, state: view(actor), positionOwned: actor.pos !== pos});
}
writeFileSync(process.argv[2], JSON.stringify({originalOnly: true, recentKinds: RECENT_KINDS, recentNever: RECENT_NEVER, courses}));
