import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha256} from './reference-utils.mjs';
import {originalCount} from '../experiments/proc-census/workload.mjs';

export const cases=[32,128,512].flatMap(size=>['sparse','crowded'].map(density=>({size,density})));
export const orders=[
  ['original','scan','scan-control'],['scan','scan-control','original'],['scan-control','original','scan'],
  ['scan-control','scan','original'],['original','scan-control','scan'],['scan','original','scan-control'],
];
export function median(values) {
  assert(values.length);
  const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
export function verifyOriginalCensus() {
  const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/proc-delivery/acceptance.json')));
  const bytes=fs.readFileSync(path.join(root,accepted.sourceBoundary));
  assert.equal(sha256(bytes),accepted.sourceBoundarySha256);
  const reference=JSON.parse(bytes).maps.original.branches.summon.text.replace(/\s/g,'');
  const control=originalCount.toString().split('return ')[1].split(';')[0].replace(/\s/g,'');
  assert(reference.includes('this.'+control),'Control differs from the pinned original census');
  return accepted.sourceBoundarySha256;
}
