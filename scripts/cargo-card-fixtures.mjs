import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
export function cargoFixtures(){
  const dir=path.join(root,'baseline/cargo-cards'),accepted=JSON.parse(fs.readFileSync(path.join(dir,'acceptance.json')));
  const bytes=gunzipSync(fs.readFileSync(path.join(dir,'cards.jsonl.gz')));
  assert.equal(sha256(bytes),accepted.files['cards.jsonl'].sha256);
  return {accepted,rows:bytes.toString().trimEnd().split('\n').map(JSON.parse)};
}
export function workshopCargoCases(rows){
  const labels=['skill/firebolt/common','skill/firebolt/magic','skill/firebolt/rare','skill/firebolt/legendary',
    'context/skill_gem/stash/sell/false','context/skill_gem/pack/sell/true','support/multistrike/0','support/multistrike/2',
    'cut/multistrike/7','cut/teeming_vein/0','cut/teeming_vein/47','cut/teeming_vein/48','pin/support/multistrike','pin/skill/firebolt',
    'stack/1/true','stack/2/true','stack/2048/false','context/preformed_memory/pack/sell/false',
    'context/rough_memory/pack/break/false','context/rough_memory/shelf/sell/true','provenance/["v1","cache"]','provenance/[invalid',
    'removed/skill','removed/support'];
  labels.push(rows.find(r=>r.values?.fit?.some(s=>s.fits&&!s.direct)).label);
  return [...new Set(labels)].map(label=>{const r=rows.find(r=>r.label===label);assert(r,label);return r;});
}
