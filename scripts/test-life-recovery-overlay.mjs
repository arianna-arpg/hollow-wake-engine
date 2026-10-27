import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';import ts from 'typescript';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {readLifeRecoveryExpectations} from './check-life-recovery-contract.mjs';
import {recoveryPaths,recoveryTree,renderLifeRecoverySource,integrateLifeRecovery} from '../adapters/hollow-wake/integrate-life-recovery.mjs';

/** Read a prepared predecessor, testing transformations only on fresh copies. */
export function verifyLifeRecoveryOverlay(sourceGame){
  const {acceptance}=readLifeRecoveryExpectations(),contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-forty-two/adapter-contract.json')));
  assert.equal(contract.source,acceptance.source);assert.equal(contract.sourceLockSha256,acceptance.sourceLockSha256);
  assert.equal(contract.sourceBoundariesSha256,acceptance.sourceBoundaries.sha256);
  const original=Object.fromEntries(['actor','world'].map(kind=>[kind,fs.readFileSync(path.join(sourceGame,recoveryPaths[kind]))]));
  const bases=Object.fromEntries(Object.entries(original).map(([kind,bytes])=>[kind,bytes.toString().replaceAll('\r\n','\n')]));
  const faults=[];
  for(const[kind,base]of Object.entries(bases)){
    renderLifeRecoverySource(base,kind); // Independently frozen member hashes must match before testing faults.
    const tree=recoveryTree(base,kind),{ast,owner,members}=tree,replace=(start,end,text)=>base.slice(0,start)+text+base.slice(end);
    for(const[key,node]of Object.entries(members)){
      faults.push({name:kind+':missing:'+key,kind,source:replace(node.getStart(ast),node.end,'')});
      faults.push({name:kind+':duplicate:'+key,kind,source:replace(node.end,node.end,'\n'+node.getText(ast))});
      faults.push({name:kind+':changed:'+key,kind,source:replace(node.getStart(ast),node.end,node.getText(ast).replace(key,key+'_changed'))});
      if(node.body)faults.push({name:kind+':body:'+key,kind,source:replace(node.body.getStart(ast)+1,node.body.getStart(ast)+1,' void 0; ')});
    }
    if(tree.cases)for(const clause of tree.cases)faults.push({name:'case:'+clause.expression.text,kind,source:replace(clause.end,clause.end,'\n void 0;')});
    faults.push({name:kind+':invalid',kind,source:base+'\nconst invalid = ;'});
    faults.push({name:kind+':duplicate-owner',kind,source:base+'\nclass '+owner.name.text+' {}'});
    faults.push({name:kind+':changed-import',kind,source:base.replace(contract.existingImports[kind],contract.existingImports[kind].replace('import {','import type {'))});
    if(kind==='actor')faults.push({name:'actor:additional-tap-caller',kind,source:base+'\nvoid SIM_TAP.current;'});
    for(const key of contract.reservedNames){
      faults.push({name:kind+':binding:'+key,kind,source:base+'\nconst '+key+' = 0;'});
      faults.push({name:kind+':quoted-binding:'+key,kind,source:replace(owner.members.end,owner.members.end,'\n["'+key+'"]() {}')});
    }
  }
  const reports=[];
  for(const ending of ['\n','\r\n']){
    const game=fs.mkdtempSync(path.join(root,'.artifacts/recovery-overlay-')),written=new Map();fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
    for(const[kind,base]of Object.entries(bases)){
      const tree=recoveryTree(base,kind),at=tree.owner.members.end;
      const marked=base.slice(0,at)+'\n  retainedRecoveryMarker() { return 27; }\n'+base.slice(at)+'\n// retained recovery marker\n';
      const text=marked.replaceAll('\n',ending);fs.writeFileSync(path.join(game,recoveryPaths[kind]),text);written.set(kind,text);
    }
    const binding=path.join(game,recoveryPaths.binding),unchanged=expected=>{for(const[kind,text]of expected)assert.equal(fs.readFileSync(path.join(game,recoveryPaths[kind]),'utf8'),text);};
    integrateLifeRecovery(game,false);unchanged(written);assert(!fs.existsSync(binding));
    for(const fault of faults){
      const expected=new Map(written),text=fault.source.replaceAll('\n',ending);expected.set(fault.kind,text);fs.writeFileSync(path.join(game,recoveryPaths[fault.kind]),text);
      assert.throws(()=>integrateLifeRecovery(game),/Unreviewed|Ambiguous|Invalid|binding collision/,'Recovery fault escaped: '+fault.name);
      unchanged(expected);assert(!fs.existsSync(binding));fs.writeFileSync(path.join(game,recoveryPaths[fault.kind]),written.get(fault.kind));
    }
    fs.writeFileSync(binding,'existing binding');assert.throws(()=>integrateLifeRecovery(game),/already exists/);unchanged(written);assert.equal(fs.readFileSync(binding,'utf8'),'existing binding');fs.unlinkSync(binding);
    integrateLifeRecovery(game);
    for(const[kind,input]of written){
      const output=fs.readFileSync(path.join(game,recoveryPaths[kind]),'utf8');assert.equal(output.includes('\r\n'),ending==='\r\n');assert(output.endsWith(ending+'// retained recovery marker'+ending));
      const before=recoveryTree(input.replaceAll('\r\n','\n'),kind),after=recoveryTree(output.replaceAll('\r\n','\n'),kind);
      const changed=kind==='actor'?['healBy','refillLife']:['executeProc'];
      assert.equal(after.owner.members.length,before.owner.members.length);
      for(let i=0;i<before.owner.members.length;i++){
        const old=before.owner.members[i],next=after.owner.members[i];
        if(!changed.includes(old.name?.text))assert.equal(next.getText(after.ast),old.getText(before.ast),'Unrelated recovery member changed');
        else assert.equal(before.ast.text.slice(old.getStart(before.ast),old.body.getStart(before.ast)),after.ast.text.slice(next.getStart(after.ast),next.body.getStart(after.ast)),'Recovery signature changed');
      }
      const globals=tree=>tree.ast.statements.filter(n=>!ts.isImportDeclaration(n)&&n!==tree.owner).map(n=>n.getText(tree.ast));assert.deepEqual(globals(after),globals(before));
      const imports=tree=>tree.ast.statements.filter(ts.isImportDeclaration).map(n=>n.getText(tree.ast));
      const kept=imports(before).filter(text=>kind!=='actor'||text!==contract.existingImports.actor);
      assert.deepEqual(imports(after),[...kept,...contract.imports[kind]]);
      if(kind==='world')assert.equal(after.members.executeProc.getText(after.ast).replace(after.heal.getText(after.ast),before.heal.getText(before.ast)),before.members.executeProc.getText(before.ast),'Proc context, siblings or rider tail changed');
    }
    assert(fs.readFileSync(binding).equals(fs.readFileSync(path.join(root,'adapters/hollow-wake/lifeRecoveryAdapter.ts'))));
    assert.throws(()=>integrateLifeRecovery(game),/already exists/);
    reports.push({ending,sourceFaultsRejected:faults.length,dryRunUnchanged:true,rejectedInputsUnchanged:true,unrelatedMembersGlobalsAndImportsPreserved:true,methodSignaturesPreserved:true,other21ProcCasesAndRiderTailPreserved:true});
  }
  for(const[kind,bytes]of Object.entries(original))assert(fs.readFileSync(path.join(sourceGame,recoveryPaths[kind])).equals(bytes),'Input graph changed');
  const receipt={decision:contract.decision,source:sourceGame,sourceHashes:Object.fromEntries(Object.entries(original).map(([kind,bytes])=>[kind,sha256(bytes)])),
    contractSha256:sha256(fs.readFileSync(path.join(root,'baseline/milestone-forty-two/adapter-contract.json'))),reports,sourceFaults:faults.length*2,inputUnchanged:true};
  writeJSON(path.join(root,'.artifacts/life-recovery-overlay-verification.json'),receipt);console.log('PASS recovery source controls: '+receipt.sourceFaults+' faults rejected.');return receipt;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const at=process.argv.indexOf('--game');assert(at>=0&&process.argv[at+1],'Provide --game with a prepared predecessor game');verifyLifeRecoveryOverlay(path.resolve(process.argv[at+1]));
}
