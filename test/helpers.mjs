import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Content, Engine } from '../dist/index.js';
export const read = file => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
export const pack = read('content/milestone-one.json');
export const fixture = read('baseline/first-path.json');
export function setup(seed = 1) {
  const engine = new Engine(new Content(pack), seed);
  const character = engine.character(fixture.initial);
  character.equip('lapis-reference', 'ring1');
  character.allocate('cross_int_pursuit');
  const skill = engine.skill({
    ...fixture.initial.skill,
    supports: [{ id: 'corrosion', level: 2 }, { id: 'measured_blows', level: 1 }],
    nodes: ['ruin_studies'],
  });
  return { engine, character, skill };
}
export function equivalent(actual, expected, at = 'root') {
  if (typeof expected === 'number') {
    assert.ok(Number.isFinite(actual), `${at}: nonfinite value`);
    assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)),
      `${at}: expected ${expected}, got ${actual}`);
  } else if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, `${at}: array length`);
    expected.forEach((value, i) => equivalent(actual[i], value, `${at}[${i}]`));
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).filter(k => actual[k] !== undefined).sort(), Object.keys(expected).sort(), `${at}: keys`);
    for (const [key, value] of Object.entries(expected)) equivalent(actual[key], value, `${at}.${key}`);
  } else assert.equal(actual, expected, at);
}
