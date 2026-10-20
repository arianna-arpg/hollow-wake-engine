import fs from 'node:fs';
import { Engine } from '../dist/index.js';

const content = JSON.parse(fs.readFileSync(new URL('../content/milestone-one.json', import.meta.url), 'utf8'));
const engine = new Engine(content, 42);
const hero = engine.character({ classId: 'magician', passivePoints: 1 });
hero.equip('lapis-reference', 'ring1');
hero.allocate('cross_int_pursuit');
const skill = engine.skill({
  id: 'ruin', level: 5, sockets: 2, treePoints: 1,
  supports: [{ id: 'corrosion', level: 2 }, { id: 'measured_blows', level: 1 }],
  nodes: ['ruin_studies'],
});
const target = engine.target({ life: 500, mods: [{ stat: 'chaosRes', kind: 'flat', value: .25 }] });
console.log(JSON.stringify({
  capability: 'Resolved spell contact; the host owns travel and casting lifecycle.',
  attributes: hero.attributes,
  preview: engine.preview(hero, skill),
  costs: engine.costs(hero, skill),
  firstHit: engine.resolveHit(hero, skill, target),
  continuation: engine.randomSnapshot(),
}, null, 2));
