import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha256} from './reference-utils.mjs';
import ts from 'typescript';
import {originalCount,countWorldSummons} from '../experiments/proc-census/workload.mjs';

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

export function verifyWorldCensus() {
  const file=path.join(root,'adapters/hollow-wake/procDelivery.ts'), text=fs.readFileSync(file,'utf8');
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='countWorldSummons');
  assert(fn?.body,'Missing World summon count');
  const compact=value=>value.replace(/\s/g,'');
  const sample=countWorldSummons.toString();
  const sampleBody=sample.slice(sample.indexOf('{'));
  assert.equal(compact(fn.body.getText(ast)),compact(sampleBody));
  assert(compact(text).includes('summonCount:(owner,key)=>countWorldSummons(w.actors,owner,key)'));
  // The first visit changes entries both inside and outside the original
  // length. A dead actor must short-circuit before reading its key.
  function liveCourse(count) {
    const owner={}, match={owner,dead:false,sourceSkillId:'key'}, actors=new Array(4);
    actors[0]={...match,get owner(){delete actors[1];actors[2]=match;actors.push(match);return owner;}};
    actors[1]={get owner(){throw Error('Deleted entry was visited');}};
    actors[3]={owner,dead:true,get sourceSkillId(){throw Error('Dead actor key was read');}};
    return [count(actors,owner,'key'),actors.length];
  }
  assert.deepEqual(liveCourse(originalCount),[2,5]);assert.deepEqual(liveCourse(countWorldSummons),[2,5]);
  return sha256(text);
}
