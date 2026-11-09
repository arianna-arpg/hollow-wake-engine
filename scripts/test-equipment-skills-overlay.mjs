import fs from 'node:fs';import assert from 'node:assert/strict';
import {renderPassiveGrants} from '../adapters/hollow-wake/integrate-passive-grants.mjs';
import {renderEquipmentSkills} from '../adapters/hollow-wake/integrate-equipment-skills.mjs';
const raw=fs.readFileSync(new URL('../.reference/src/engine/world.ts',import.meta.url),'utf8').replaceAll('\r\n','\n');
const editor=fs.readFileSync(new URL('../.reference/src/dev/passiveEditor.ts',import.meta.url),'utf8');
for(const newline of ['\n','\r\n']){
  const original=raw.replaceAll('\n',newline),compiled=renderPassiveGrants(original,editor,original,editor).world.replaceAll('\n',newline);
  const marker=newline+'// unrelated extension'+newline;
  for(const [input,passiveGrafts,port]of [[original,'original','graftSourcesOf(m.allocated,m.choices,PASSIVE_NODES)'],[compiled,'compiled','passiveBuild.grafts']]){
    const options={passiveGrafts},output=renderEquipmentSkills(input+marker,original,options);
    assert(output.endsWith(marker));assert.equal(output.includes('\r\n'),newline==='\r\n');
    assert(output.includes('passiveGrafts:()=>'+port+','));
    assert.throws(()=>renderEquipmentSkills(output,original,options),/already present/);
    assert.throws(()=>renderEquipmentSkills(input.replace('const grantStats = new Set<string>();','const grantStats = new Set<string>(); /* edited */'),original,options),/Unreviewed/);
  }
  assert.throws(()=>renderEquipmentSkills(compiled,original),/Unreviewed/);
  assert.throws(()=>renderEquipmentSkills(original,original,{passiveGrafts:'compiled'}),/Missing compiled passive build/);
  const late=compiled.replace('const passiveBuild = beginSdkPassiveGrants(m);','')
    .replace("p.sheet.setSource('level',","const passiveBuild = beginSdkPassiveGrants(m);"+newline+"p.sheet.setSource('level',");
  assert.throws(()=>renderEquipmentSkills(late,original,{passiveGrafts:'compiled'}),/must precede/);
  assert.throws(()=>renderEquipmentSkills(compiled.replace('for (const s of passiveBuild.grafts) {','for (const s of passiveBuild.grafts.slice(1)) {'),original,{passiveGrafts:'compiled'}),/Unreviewed/);
  assert.throws(()=>renderEquipmentSkills(original,original,{passiveGrafts:'unknown'}),/Unknown passive graft source/);
}
console.log({passed:true,variants:2,newlines:2,unreviewedChangesRefused:true});
