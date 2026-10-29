import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256} from '../../scripts/reference-utils.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/attack-sequence-boundary.json')));
export const attackSequencesDecision='Delegate the complete attack-sequence controller and content assembly; host supplies geometry, shared skill/status/damage services, delivery queues and semantic presentation';
export const attackSequenceFiles=Object.keys(boundary.files);
export function renderAttackSequenceFile(file,input){
  const expected=boundary.files[file];assert(expected,'Unknown attack sequence boundary');
  assert.equal(sha256(input.replaceAll('\r\n','\n')),expected.inputSha256,'Unreviewed attack sequence source: '+file);
  const output=fs.readFileSync(path.join(root,expected.adapter),'utf8').replaceAll('\r\n','\n');
  return input.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateAttackSequences(game,write=true){
  // Validate both inputs before changing either file.
  const edits=attackSequenceFiles.map(file=>({file,output:renderAttackSequenceFile(file,fs.readFileSync(path.join(game,file),'utf8'))}));
  if(write)for(const edit of edits)fs.writeFileSync(path.join(game,edit.file),edit.output);
  return{files:[...attackSequenceFiles],decision:attackSequencesDecision};
}
