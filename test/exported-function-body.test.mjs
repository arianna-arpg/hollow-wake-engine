import test from 'node:test';
import assert from 'node:assert/strict';
import {exportedFunctionBody} from '../scripts/exported-function-body.mjs';

test('fault selection ignores decoy strings and unexported callables', () => {
  const source = `const decoy = 'export function target('; function hidden() { return 0; }
export function target() { return '{ real }'; }
export function after() { return 9; }`;
  const {start, end} = exportedFunctionBody(source, 'target');
  assert.equal(source.slice(start, end), "{ return '{ real }'; }");
  assert.throws(() => exportedFunctionBody(source, 'hidden'), /Missing/);
});

test('fault selection isolates an immutable named expression body', () => {
  const source = `export const target = function target(a) { return a + 1; };
export function after() { return 9; }`;
  const {start, end} = exportedFunctionBody(source, 'target');
  assert.equal(source.slice(start, end), '{ return a + 1; }');
  assert.equal(source.slice(end), ';\nexport function after() { return 9; }');
});

test('fault selection rejects ambiguous, mutable and unsupported declarations', () => {
  for (const source of [
    'export function target() {} export function target() {}',
    'export let target = function target() {};',
    'export const target = () => 1;',
    'export const target = function other() {};',
    'export const target = function target() {}, extra = 1;',
    'export const target = 3;',
    'export function target( {',
  ]) assert.throws(() => exportedFunctionBody(source, 'target'));
});
