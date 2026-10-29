import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {readyBankFile,readyBankNodes,renderReadyCooldownBank,integrateReadyCooldownBank} from '../adapters/hollow-wake/integrate-ready-cooldown-bank.mjs';
export function verifyReadyBankOverlay(game){
  const file=path.join(game,readyBankFile),original=fs.readFileSync(file,'utf8'),source=original.replaceAll('\r\n','\n'),output=renderReadyCooldownBank(source),faults=[];
  const reject=(name,changed)=>{assert.throws(()=>renderReadyCooldownBank(changed),undefined,name);faults.push(name);};
  reject('repeat-application',output);reject('binding-collision','const engineReadyBankPorts = 0;\n'+source);
  const {ast,nodes}=readyBankNodes(source);
  for(const[name,selected]of Object.entries(nodes)){
    const start=selected[0].getStart(ast),end=selected.at(-1).end,text=source.slice(start,end);
    const changed=text.replace('bank','changedCredit');assert.notEqual(text,changed);
    reject('changed-'+name,source.slice(0,start)+changed+source.slice(end));
    reject('missing-'+name,source.slice(0,start)+source.slice(end));
  }
  for(const newline of ['\n','\r\n']){const marker='// unrelated ready-bank source\n',rendered=renderReadyCooldownBank((marker+source).replaceAll('\n',newline));assert.equal(rendered.replaceAll('\r\n','\n'),marker+output);assert.equal(rendered.includes('\r\n'),newline==='\r\n');}
  const directory=fs.mkdtempSync(path.join(root,'.artifacts/ready-bank-source-')),target=path.join(directory,readyBankFile);fs.mkdirSync(path.dirname(target),{recursive:true});
  const invalid='const engineReadyBankPorts = 0;\n'+original;fs.writeFileSync(target,invalid,{flag:'wx'});assert.throws(()=>integrateReadyCooldownBank(directory));assert.equal(fs.readFileSync(target,'utf8'),invalid);
  assert.equal(fs.readFileSync(file,'utf8'),original);const report={passed:true,directory,game,rejectedFaults:faults.length+1,faults,sourceSha256:sha256(original),inputUnchanged:true,newlineStyles:2,unrelatedSourcePreserved:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/ready-bank-overlay.json',report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){assert.equal(process.argv[2],'--game');const r=verifyReadyBankOverlay(path.resolve(process.argv[3]));console.log({passed:r.passed,faults:r.rejectedFaults,directory:r.directory});}
