import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { StatRules, StatSheet } from '../dist/index.js';
import { readBuffExpectations } from '../scripts/check-buff-contract.mjs';
const { BuffRuntime } = await import(process.env.HOLLOW_WAKE_BUFF_MODULE ?? '../dist/buffs.js');
const { acceptance, original, expected, decision } = readBuffExpectations();

// The committed native courses drive a plain SDK host. This intentionally covers
// only the 24 actor courses; real World/cue/phase equivalence is an adapter gate.
for (const name of ['buff-lifecycle', 'buff-edges']) test('plain SDK host reproduces the original ' + name + ' courses', () => {
  let source = fs.readFileSync(new URL('../' + acceptance.fixtures.find(r => r.name === name).helper, import.meta.url), 'utf8');
  if (name === decision.fixture) {
    const parsed = ts.createSourceFile('helper.ts', source, ts.ScriptTarget.Latest, true);
    const matches = parsed.statements.filter(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(parsed) === 'course' && n.expression.arguments[0]?.text === decision.course);
    assert.equal(matches.length, 1); const node = matches[0]; let text = node.getText(parsed);
    for (const edit of decision.helperAssertions) {
      assert.equal(edit.course, decision.course); assert.equal(text.split(edit.before).length, 2); text = text.replace(edit.before, edit.after);
    }
    source = source.slice(0, node.getStart(parsed)) + text + source.slice(node.end);
  }
  const parsed = ts.createSourceFile('helper.ts', source, ts.ScriptTarget.Latest, true);
  for (const node of [...parsed.statements].reverse()) if (ts.isImportDeclaration(node)) source = source.slice(0, node.getStart(parsed)) + source.slice(node.end);
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const deepCarve = structuredClone(original.get('buff-lifecycle').rows.find(r => r.name === 'authored-deep-carve-independent-expiration').stages[0].buffs[0].def);
  const definitions = { life: { base: 0 } }; for (const mod of deepCarve.mods) definitions[mod.stat] ??= { base: 0 };
  const rules = new StatRules(definitions);
  class PlainSheet extends StatSheet { constructor() { super(rules); } }
  const runtime = new BuffRuntime({
    publish(p, id, mods) { p.sheet.setSource(id, mods); }, removeSource(p, id) { p.sheet.removeSource(id); }, release() {},
    consume(p, id, count) { p.consumeBuffStacks(id, count); },
  });
  class PlainActor {
    buffs = new Map(); gainEvents = []; charges = new Map(); statuses = [];
    addBuff(...args) { runtime.grant(this, ...args); }
    consumeBuffStacks(...args) { runtime.consume(this, ...args); }
    spendBuffs(...args) { runtime.spend(this, ...args); }
    removeBuff(id) { runtime.remove(this, id); }
    syncBuffSource(id) { runtime.synchronize(this, id); }
    updateTimers(delta) { runtime.advance(this, delta); }
  }
  let result;
  const writeOnly = { writeFileSync(destination, text) { assert.equal(destination, 'capture'); assert.equal(result, undefined); result = JSON.parse(text); } };
  const mod = (stat, kind, value, tags, when) => ({ stat, kind, value, tags, when });
  new Function('fs', 'assert', 'bootSimEngine', 'Actor', 'StatSheet', 'mod', 'SKILLS', 'process', javascript)(writeOnly, assert, () => {}, PlainActor, PlainSheet, mod, { deep_carve: { effects: [deepCarve] } }, { argv: ['', '', 'capture'] });
  assert.deepEqual(result, expected.get(name)); assert.equal(result.courses, 12);
});
