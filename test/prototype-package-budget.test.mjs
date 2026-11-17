import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prototypePackageBudget,prototypeModuleBudget} from '../scripts/prototype-package-budget.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../baseline/prototype-parity/package-growth.json',import.meta.url)));
const files=()=>Object.entries(manifest.modules).map(([path,b])=>({path,size:b.previousBytes+b.maxGrowthBytes}));
test('prototype size allowances are bounded, detached and cannot discount unrelated modules',()=>{
 const original=files();original.push({path:'dist/unreviewed.js',size:9000});const before=structuredClone(original);
 const result=prototypePackageBudget(original);assert.deepEqual(original,before);assert.equal(result.growthBytes,manifest.maxTotalGrowthBytes);
 assert.equal(result.historicalFiles.at(-1).size,9000);
 const larger=files();larger[0].size++;assert.throws(()=>prototypePackageBudget(larger),/growth exceeded/);
 assert.throws(()=>prototypePackageBudget(files().slice(1)),/Missing parity/);
 assert.throws(()=>prototypePackageBudget([...files(),files()[0]]));
 const name='dist/delayed-bursts.js',bound=manifest.modules[name];
 assert.equal(prototypeModuleBudget(name,bound.previousBytes+bound.maxGrowthBytes).historicalBytes,bound.previousBytes);
 assert.throws(()=>prototypeModuleBudget(name,bound.previousBytes+bound.maxGrowthBytes+1),/growth exceeded/);
 assert.throws(()=>prototypeModuleBudget('dist/unreviewed.js',1),/Unreviewed/);
});
