import assert from 'node:assert/strict';

// Deliberately address the emitted private movement method to observe selection
// even when nonfinite coordinates prevent a hit. Getters only observe reads;
// positions stay constant throughout selection. Public update courses are tested
// separately against the retained controller and the frozen original game.
export function challengeTargetingContracts({Challenges}) {
  const passed = [];
  function select(points, {cursor = {x: 0, y: 0}, center = {x: 0, y: 0}} = {}) {
    let afterClamp = false, selected;
    const hits = [], positions = points.map(([x, y]) => ({x, y}));
    const enemies = positions.map((pos, id) => ({id,
      get pos() {if (afterClamp && selected === undefined) selected = id; return pos;}}));
    const host = {def: {id: 'goad', tags: [], delivery: {}}, level: 1};
    const owner = {id: 1000}, spec = {creeper: {speed: 40, strikeInterval: .3, strikePower: .2}};
    const cast = {inst: host, state: {owner, host, spec}};
    const e = {body: {id: 1, pos: {x: 0, y: 0}}, cast, radius: Infinity,
      center: {...center}, creeper: {pos: {...cursor}, radius: 8}, trailAt: Infinity, strikeAt: 0};
    const ports = {time: 1, flashes: [], clampPos: pos => {afterClamp = true; return pos;},
      tags: () => new Set(), modifiers: () => [], createSkill: (def, level) => ({def, level}),
      challengeHit: (_owner, _inst, target) => hits.push(target.id)};
    new Challenges(ports).moveCreeper(e, enemies, 0);
    assert.deepEqual(positions, points.map(([x, y]) => ({x, y})), 'Borrowed coordinates changed');
    if (hits.length) assert.deepEqual(hits, [selected]);
    return selected;
  }
  function check(name, points, expected, options) {
    assert.equal(select(points, options), expected, name); passed.push(name);
  }
  check('no enemies', [], undefined);
  check('one enemy', [[9, 0]], 0);
  check('nearest can occur after the first candidate', [[30, 0], [5, 0], [20, 0]], 1);
  check('nearest can occur last', [[30, 0], [20, 0], [5, 0]], 2);
  check('first equal-distance candidate wins', [[3, 4], [-3, -4], [0, 5]], 0);
  check('first zero-distance candidate wins', [[0, 0], [-0, -0], [1, 0]], 0);
  check('negative coordinates use Euclidean distance', [[-4, -4], [3, 0], [0, -5]], 1);
  check('both axes contribute to distance', [[1, 20], [5, 0]], 1);
  check('cursor position determines proximity', [[0, 0], [99, 0]], 1,
    {cursor: {x: 100, y: 0}, center: {x: 0, y: 0}});
  check('large finite distances must not overflow their metric', [[2e200, 0], [1e200, 0]], 1);
  check('tiny finite distances must not underflow their metric', [[2e-200, 0], [1e-200, 0]], 1);
  check('all infinite distances retain first candidate', [[Infinity, 0], [-Infinity, 0]], 0);
  check('finite candidate follows infinity', [[Infinity, 0], [2, 0]], 1);
  check('finite candidate precedes infinity', [[2, 0], [Infinity, 0]], 0);
  check('subtraction overflow preserves stable infinities', [[-1e308, 0], [-1.5e308, 0]], 0,
    {cursor: {x: 1e308, y: 0}});
  check('leading NaN preserves legacy comparator ordering', [[NaN, 0], [2, 0], [1, 0]], 0);
  check('interior NaN preserves legacy comparator ordering', [[3, 0], [NaN, 0], [1, 0]], 0);
  check('trailing NaN preserves preceding finite order', [[3, 0], [1, 0], [NaN, 0]], 1);
  return {contracts: passed.length, passed};
}

export const challengeTargetingFaults = [
  {name: 'target-tie-last', module: 'challenges', from: 'if (distance < nearest)', to: 'if (distance <= nearest)'},
  {name: 'target-nonfinite-fallback', module: 'challenges', from: 'if (!Number.isFinite(distance))', to: 'if (false)'},
  {name: 'target-squared-distance', module: 'challenges', from: 'const distance = dist(enemy.pos, c.pos);',
    to: 'const distance = (enemy.pos.x - c.pos.x) ** 2 + (enemy.pos.y - c.pos.y) ** 2;'},
  {name: 'target-wrong-origin', module: 'challenges', from: 'const distance = dist(enemy.pos, c.pos);',
    to: 'const distance = dist(enemy.pos, e.center);'},
  {name: 'target-first-only', module: 'challenges', from: 'for (const enemy of enemies) {\n      const distance =',
    to: 'for (const enemy of enemies.slice(0, 1)) {\n      const distance ='},
];
