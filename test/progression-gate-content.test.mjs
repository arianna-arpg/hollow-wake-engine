import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressionGateContent } from '../dist/progression-gate-content.js';
import { gateMet, gateRowLabel, gateRowProgress } from '../dist/progression-gates.js';

function pack() {
  return {
    schemaVersion: 1, capability: 'progression-gates/v1', contentId: 'example',
    keys: {
      levelPrefix: 'level:', classPrefix: 'class:', classLevelSeparator: ':level:',
      vocationPrefix: 'vocation:', questDonePrefix: 'quest:', questsCompletedKey: 'quests-total',
    },
    classes: [{ id: 'hero', name: 'Hero' }],
    requirements: [{ id: 'hero-rung', mode: 'any', rows: [{ classLevel: { classId: 'hero', level: 10 } }] }],
  };
}

test('gate content owns frozen definitions, indexed groups and safe property-like IDs', () => {
  const input = pack();
  input.classes.push({ id: '__proto__', name: 'Prototype' });
  input.requirements.push({ id: '__proto__', mode: 'all', rows: [] });
  const content = new ProgressionGateContent(input);
  const group = content.requirement('hero-rung');
  input.classes[0].name = 'Changed';
  input.requirements[0].rows[0].classLevel.level = 99;
  assert.equal(content.context.className('hero'), 'Hero');
  assert.equal(content.context.className('__proto__'), 'Prototype');
  assert.equal(content.context.className('toString'), undefined);
  assert.equal(group.rows[0].classLevel.level, 10);
  assert.equal(content.requirement('__proto__').mode, 'all');
  assert.equal(content.requirement('hero-rung'), group);
  assert.throws(() => content.requirement('missing'), /Unknown/);
  assert.throws(() => { group.rows[0].classLevel.level = 20; }, TypeError);
  assert.throws(() => { content.context.questDonePrefix = 'changed'; }, TypeError);
  assert.throws(() => { content.pack = input; }, TypeError);
});

test('loaded gate content uses live accounts with legacy flags and fallback labels', () => {
  const content = new ProgressionGateContent(pack()), context = content.context;
  const group = content.requirement('hero-rung');
  const account = { ledger: { 'class:hero:level:5': 1 }, features: new Set() };
  const owned = () => false;
  assert.equal(gateMet(account, group.rows, group.mode, owned, context), false);
  assert.equal(gateRowProgress(account, group.rows[0], owned, context), .5);
  account.ledger['class:hero:level:10'] = 1;
  assert(gateMet(account, group.rows, group.mode, owned, context));
  assert.equal(gateRowLabel({ classLevel: { classId: 'retired', level: 10 } }, context), 'reach level 10 as the retired');
  account.ledger['quests-total'] = 1;
  assert(gateMet(account, [{ quest: true }], 'any', owned, context));
  assert.equal(context.vocationUnlockKey('job'), 'vocation:job');
  assert.equal(context.questDoneKey('job'), 'quest:job');
});

test('authoring validation rejects malformed content before queries', () => {
  const mutations = [
    input => { input.schemaVersion = 2; },
    input => { input.capability = 'other'; },
    input => { input.contentId = ''; },
    input => { input.keys.levelPrefix = ''; },
    input => { delete input.keys; },
    input => { input.classes.push(input.classes[0]); },
    input => { input.classes[0].name = 7; },
    input => { input.classes = new Array(1); },
    input => { input.requirements.push(input.requirements[0]); },
    input => { input.requirements[0].id = ''; },
    input => { input.requirements[0].mode = 'either'; },
    input => { input.requirements[0].rows = new Array(1); },
    input => { input.requirements[0].rows = [null]; },
    input => { input.requirements[0].rows = [{ feature: 'f', ledger: 'l' }]; },
    input => { input.requirements[0].rows = [{ featre: 'misspelled' }]; },
    input => { input.requirements[0].rows = [{ feature: '' }]; },
    input => { input.requirements[0].rows = [{ unlock: false }]; },
    input => { input.requirements[0].rows = [{ ledger: 1 }]; },
    input => { input.requirements[0].rows = [{ ledger: 'l', n: '1' }]; },
    input => { input.requirements[0].rows = [{ ledger: 'l', n: NaN }]; },
    input => { input.requirements[0].rows = [{ ledger: 'l', n: Infinity }]; },
    input => { input.requirements[0].rows = [{ label: false }]; },
    input => { input.requirements[0].rows = [{ level: 0 }]; },
    input => { input.requirements[0].rows = [{ level: .5 }]; },
    input => { input.requirements[0].rows = [{ classLevel: { classId: '', level: 1 } }]; },
    input => { input.requirements[0].rows = [{ classLevel: { classId: 'hero', level: 1, typo: true } }]; },
    input => { input.requirements[0].rows = [{ quest: false }]; },
    input => { input.requirements[0].rows = [{ vocation: '' }]; },
    input => { input.requirements[0].rows = [new Date()]; },
    input => { input.extra = input; },
  ];
  for (const mutate of mutations) {
    const input = pack();
    mutate(input);
    assert.throws(() => new ProgressionGateContent(input), undefined, mutate.toString());
  }
});

test('authored empty gates, historical IDs and signed fractional counts retain their meaning', () => {
  const input = pack();
  input.classes[0].name = '';
  input.requirements[0].rows = [
    { ledger: '', n: -.5 }, { ledgerPrefix: '', n: 0 }, { classLevel: { classId: 'retired', level: 3 } },
    { quest: 'retired' }, { vocation: true }, { unlock: 'host-owned' }, { feature: 'host-feature' }, {},
  ];
  const content = new ProgressionGateContent(input);
  assert.equal(content.requirement('hero-rung').rows[0].n, -.5);
  assert.equal(content.context.className('hero'), '');
});
