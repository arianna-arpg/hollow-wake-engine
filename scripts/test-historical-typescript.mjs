import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sourceHasher} from './evidence-source.mjs';
import {compileTypeScriptTree} from './historical-typescript.mjs';
import {root,sha256} from './reference-utils.mjs';

test('historical Unity runtime hashes come from their actual release sources', () => {
  const historical = sourceHasher('03eb2d504a9fe410b97d3959a76d4a494c5d3541');
  const reports = JSON.parse(fs.readFileSync(path.join(root,'evidence/live-equipment-adapter/reports.json')));
  const expected = reports.native.sources['dist/stats.js'];
  assert.equal(expected, 'd4b4ce69f7df30fa6e96586fb913b5f1de07da635830f9666352dfbc2749e409');
  assert.equal(historical('dist/stats.js'), expected);
  assert.equal(sourceHasher()('dist/stats.js'),sha256(fs.readFileSync(path.join(root,'dist/stats.js'))));
  for(const name of ['src/stats.ts','package.json','tsconfig.json'])assert.equal(historical(name),sha256(execFileSync('git',['show','03eb2d504a9fe410b97d3959a76d4a494c5d3541:'+name],{cwd:root})));
  assert.throws(()=>historical('dist/missing-output.js'),/Historical source or compiled output is missing/);
  assert.throws(()=>historical('src/missing-input.ts'),/Historical source or compiled output is missing/);
  assert.throws(()=>historical('../dist/stats.js'));
  assert.throws(()=>sourceHasher('main'),/immutable source commit/);
});

const fixture = () => new Map([
  ['package.json', JSON.stringify({type:'module'})],
  ['tsconfig.json', JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',types:[],strict:true,declaration:true,sourceMap:true,rootDir:'src',outDir:'dist'},include:['src']})],
  ['src/value.ts', 'export const value = 41;'],
  ['src/index.ts', "import {value} from './value.js'; export const next = value + 1;"],
]);
test('virtual compilation consumes source bytes and preserves module/source-map layout', () => {
  const files=fixture(),first=compileTypeScriptTree(files,'first');
  assert.match(first.get('dist/value.js').toString(),/export const value = 41;/);
  assert.deepEqual(JSON.parse(first.get('dist/index.js.map')).sources,['../src/index.ts']);
  assert(first.has('dist/index.d.ts'));
  files.set('src/value.ts','export const value = 73;');
  const changed=compileTypeScriptTree(files,'changed');
  assert.notEqual(sha256(changed.get('dist/value.js')),sha256(first.get('dist/value.js')));
  assert.match(changed.get('dist/value.js').toString(),/export const value = 73;/);
});
test('missing historical modules cannot fall back to the current checkout', () => {
  const files=fixture();files.set('src/index.ts',"export {StatSheet} from './stats.js';");
  assert(fs.existsSync(path.join(root,'src/stats.ts')));
  assert.throws(()=>compileTypeScriptTree(files,'missing'),/Historical source did not type-check/);
  files.set('src/index.ts',"export {StatSheet} from '../../../src/stats.js';");
  assert.throws(()=>compileTypeScriptTree(files,'outside'), error => {
    assert(error.actual.some(message => message.includes("Cannot find module '../../../src/stats.js'")));
    assert(!error.actual.some(message => message.includes('not under')));
    return true;
  });
  assert.throws(()=>compileTypeScriptTree(fixture(),'../escape'),/virtual build identity/);
});
