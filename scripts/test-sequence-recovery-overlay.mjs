import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {sequenceRecoveryFile,sequenceRecoveryNodes,renderSequenceRecovery,integrateSequenceRecovery} from '../adapters/hollow-wake/integrate-sequence-recovery.mjs';
export function verifySequenceRecoveryOverlay(game){
  const file=path.join(game,sequenceRecoveryFile),original=fs.readFileSync(file,'utf8'),source=original.replaceAll('\r\n','\n'),output=renderSequenceRecovery(source),faults=[];
  const reject=(name,value)=>{assert.throws(()=>renderSequenceRecovery(value),undefined,name);faults.push(name);};
  reject('repeat-application',output);reject('binding-collision','const engineSequenceRecoveryPorts = 0;\n'+source);
  const {ast,nodes}=sequenceRecoveryNodes(source);
  for(const[name,node]of Object.entries(nodes)){const start=node.getStart(ast),end=node.end,text=source.slice(start,end),changed=text.replace(/\bs\b/,'changedState');assert.notEqual(text,changed);reject('changed-'+name,source.slice(0,start)+changed+source.slice(end));reject('missing-'+name,source.slice(0,start)+source.slice(end));}
  for(const newline of ['\n','\r\n']){const marker='// unrelated sequence source\n',rendered=renderSequenceRecovery((marker+source).replaceAll('\n',newline));assert.equal(rendered.replaceAll('\r\n','\n'),marker+output);assert.equal(rendered.includes('\r\n'),newline==='\r\n');}
  const directory=fs.mkdtempSync(path.join(root,'.artifacts/sequence-recovery-source-')),target=path.join(directory,sequenceRecoveryFile);fs.mkdirSync(path.dirname(target),{recursive:true});const invalid='const engineSequenceRecoveryPorts = 0;\n'+original;fs.writeFileSync(target,invalid,{flag:'wx'});assert.throws(()=>integrateSequenceRecovery(directory));assert.equal(fs.readFileSync(target,'utf8'),invalid);
  assert.equal(fs.readFileSync(file,'utf8'),original);const report={passed:true,directory,game,rejectedFaults:faults.length+1,faults,sourceSha256:sha256(original),inputUnchanged:true,newlineStyles:2,unrelatedSourcePreserved:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/sequence-recovery-overlay.json',report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){assert.equal(process.argv[2],'--game');const r=verifySequenceRecoveryOverlay(path.resolve(process.argv[3]));console.log({passed:r.passed,faults:r.rejectedFaults,directory:r.directory});}
