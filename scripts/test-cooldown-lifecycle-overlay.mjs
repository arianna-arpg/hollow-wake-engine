import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {lifecyclePaths,lifecycleNodes,renderCooldownLifecycle,integrateCooldownLifecycle} from '../adapters/hollow-wake/integrate-cooldown-lifecycle.mjs';

export function verifyCooldownLifecycleOverlay(game) {
  const original=Object.fromEntries(lifecyclePaths.map(file=>[file,fs.readFileSync(path.join(game,file),'utf8')]));
  const inputs=Object.fromEntries(Object.entries(original).map(([file,value])=>[file,value.replaceAll('\r\n','\n')]));
  const output=renderCooldownLifecycle(inputs),results=[];
  const reject=(name,modified)=>{assert.throws(()=>renderCooldownLifecycle(modified),undefined,name);results.push({name,rejected:true});};
  reject('repeat-application',output);reject('unexpected-file',{...inputs,'src/extra.ts':''});
  reject('changed-leaf-import',{...inputs,'src/engine/actor.ts':inputs['src/engine/actor.ts'].replace("from './engineAdapter'","from './unknownAdapter'")});
  const extraCaller='\nexport const callerKeepsLeaf = () => advanceCooldown(1, 0, 1);\n';
  assert(renderCooldownLifecycle({...inputs,'src/engine/actor.ts':inputs['src/engine/actor.ts']+extraCaller})['src/engine/actor.ts'].includes('import { advanceCooldown,'));
  for(const file of lifecyclePaths){
    const crlf=Object.fromEntries(Object.entries(inputs).map(([name,value])=>[name,value.replaceAll('\n','\r\n')]));
    assert.equal(renderCooldownLifecycle(crlf)[file].replaceAll('\r\n','\n'),output[file]);
    const sentinel='// unrelated caller source is preserved\n';assert.equal(renderCooldownLifecycle({...inputs,[file]:sentinel+inputs[file]})[file],sentinel+output[file]);
    const {ast,nodes}=lifecycleNodes(file,inputs[file]);
    for(const[name,selected]of Object.entries(nodes)){
      const node=selected[0],text=node.getText(ast),altered=text.replace('cooldown','clockDrift');assert.notEqual(altered,text);
      reject('changed-'+name,{...inputs,[file]:inputs[file].slice(0,node.getStart(ast))+altered+inputs[file].slice(node.end)});
    }
    reject('binding-'+path.basename(file),{...inputs,[file]:'const engineCooldownPricePorts = 0;\n'+inputs[file]});
    const [node]=Object.values(nodes)[0];reject('missing-'+path.basename(file),{...inputs,[file]:inputs[file].slice(0,node.getStart(ast))+inputs[file].slice(node.end)});
  }
  const directory=fs.mkdtempSync(path.join(root,'.artifacts/clock-source-faults-'));
  const wrong={...original,'src/engine/world.ts':'const engineCooldownStampPorts = 0;\n'+original['src/engine/world.ts']};
  for(const[file,content]of Object.entries(wrong)){fs.mkdirSync(path.dirname(path.join(directory,file)),{recursive:true});fs.writeFileSync(path.join(directory,file),content,{flag:'wx'});}
  assert.throws(()=>integrateCooldownLifecycle(directory));for(const[file,content]of Object.entries(wrong))assert.equal(fs.readFileSync(path.join(directory,file),'utf8'),content);
  for(const[file,content]of Object.entries(original))assert.equal(fs.readFileSync(path.join(game,file),'utf8'),content);
  const result={passed:true,directory,game,rejectedFaults:results.length+1,results,latePreflightLeavesAllFilesUnchanged:true,newlineStyles:2,unrelatedSourcePreserved:true,inputHashes:Object.fromEntries(Object.entries(original).map(([file,text])=>[file,sha256(text)]))};
  writeJSON(path.join(directory,'verification.json'),result);writeJSON(path.join(root,'.artifacts/cooldown-lifecycle-overlay.json'),result);return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv[2],'--game');assert(process.argv[3]);const r=verifyCooldownLifecycleOverlay(path.resolve(process.argv[3]));console.log({passed:r.passed,faults:r.rejectedFaults,directory:r.directory});
}
