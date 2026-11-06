import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root} from './reference-utils.mjs';
import {renderSkillRack,renderSkillRackResume} from '../adapters/hollow-wake/integrate-skill-rack.mjs';

// Preflight only. Verify the actual two host files without copying a checkout.
for(const [file,render,anchor] of [
  ['engine/world.ts',renderSkillRack,'if (!this.meetsRequirements(inst.def.id, seat)) {'],
  ['meta/character.ts',renderSkillRackResume,'if (bar.includes(id)) continue;'],
]){
  const raw=fs.readFileSync(path.join(root,'.reference/src',file),'utf8').replaceAll('\r\n','\n');
  assert(raw.includes(anchor));
  for(const newline of ['\n','\r\n']){
    const original=raw.replaceAll('\n',newline);
    const marker=newline+'// unrelated host extension'+newline;
    const generated=render(original+marker,original);
    assert(generated.endsWith(marker));
    assert.equal(generated.includes('\r\n'),newline==='\r\n');
    assert.throws(()=>render(generated,original),/already present/);
    assert.throws(()=>render(original.replace(anchor,anchor+' /* locally edited */'),original),/Unreviewed/);
  }
}
console.log('Skill rack preflight preserves unrelated World and character changes and refuses edited transfer logic.');
