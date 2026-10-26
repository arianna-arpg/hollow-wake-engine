import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {procEffectPaths,procEffectTree,integrateProcEffects} from '../adapters/hollow-wake/integrate-proc-effects.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-nine/adapter-contract.json')));
assert.equal(contract.source,lock.commit);assert.equal(contract.sourceLockSha256,sha256(fs.readFileSync(path.join(root,'baseline/source-lock.json'))));assert.equal(contract.runtimeContractSha256,sha256(fs.readFileSync(path.join(root,'baseline/milestone-thirty-nine/runtime-contract.json'))));
const sources=contract.sourceBoundaries.map(r=>({file:r.file,base:fs.readFileSync(path.join(reference,r.file),'utf8').replaceAll('\r\n','\n')})),faults=[];
for(const {file,base}of sources){
  const {ast,node,owner,cases}=procEffectTree(base,file),replace=(start,end,text)=>base.slice(0,start)+text+base.slice(end),bodyStart=node.body.getStart(ast);
  faults.push({name:file+':body',file,value:replace(bodyStart+1,bodyStart+1,' void 0; ')});
  faults.push({name:file+':signature',file,value:replace(node.parameters[0].name.getStart(ast),node.parameters[0].name.end,'changedParameter')});
  faults.push({name:file+':duplicate-method',file,value:replace(node.end,node.end,'\n'+node.getText(ast))});
  faults.push({name:file+':missing-method',file,value:replace(node.getStart(ast),node.end,'')});
  faults.push({name:file+':invalid-source',file,value:base+'\nconst broken = ;'});
  if(owner){faults.push({name:file+':duplicate-owner',file,value:base+'\nclass '+owner.name.text+' {}'});faults.push({name:file+':quoted-duplicate-method',file,value:replace(node.end,node.end,'\n["'+node.name.text+'"]() {}')});}
  for(const reserved of contract.reservedNames)faults.push({name:file+':collision:'+reserved,file,value:base+'\nconst '+reserved+' = 0;'});
  if(cases)for(const c of cases)if(c.expression.text!=='ward')faults.push({name:'sibling:'+c.expression.text,file,value:replace(c.getStart(ast),c.getStart(ast),'case "unreviewed": ')});
}
const reports=[];
for(const ending of ['\n','\r\n']){
  const game=fs.mkdtempSync(path.join(root,'.artifacts/proc-effects-overlay-')),binding=path.join(game,procEffectPaths.binding),written=new Map();
  for(const {file,base}of sources){const output=path.join(game,file);fs.mkdirSync(path.dirname(output),{recursive:true});const text=(base+'\n// retained unrelated marker\n').replaceAll('\n',ending);fs.writeFileSync(output,text);written.set(file,text);}
  const unchanged=expected=>{for(const [file,text]of expected)assert.equal(fs.readFileSync(path.join(game,file),'utf8'),text,'Partially modified effect input: '+file);};
  integrateProcEffects(game,false);unchanged(written);assert(!fs.existsSync(binding));
  for(const fault of faults){
    const changed=fault.value.replaceAll('\n',ending),expected=new Map(written);expected.set(fault.file,changed);fs.writeFileSync(path.join(game,fault.file),changed);
    assert.throws(()=>integrateProcEffects(game),/Unreviewed|Ambiguous|Invalid|binding collision/,'Source fault escaped: '+fault.name);unchanged(expected);assert(!fs.existsSync(binding));fs.writeFileSync(path.join(game,fault.file),written.get(fault.file));
  }
  fs.writeFileSync(binding,'existing host binding');assert.throws(()=>integrateProcEffects(game),/already exists/);unchanged(written);assert.equal(fs.readFileSync(binding,'utf8'),'existing host binding');fs.unlinkSync(binding);
  integrateProcEffects(game);
  for(const {file,base}of sources){
    const output=fs.readFileSync(path.join(game,file),'utf8');assert.equal(output.includes('\r\n'),ending==='\r\n');assert(output.endsWith(ending+'// retained unrelated marker'+ending));
    const before=procEffectTree(base,file),after=procEffectTree(output.replaceAll('\r\n','\n'),file),text=(n,t)=>n.getText(t.ast);
    assert.equal(base.slice(before.node.getStart(before.ast),before.node.body.getStart(before.ast)),output.replaceAll('\r\n','\n').slice(after.node.getStart(after.ast),after.node.body.getStart(after.ast)),'Changed method signature');
    const top=t=>t.ast.statements.filter(n=>!ts.isImportDeclaration(n));assert.equal(top(before).length,top(after).length);
    for(let i=0;i<top(before).length;i++)if(top(before)[i]!== (before.owner??before.node))assert.equal(text(top(after)[i],after),text(top(before)[i],before),'Unrelated declaration changed');
    if(before.owner){assert.equal(before.owner.members.length,after.owner.members.length);for(let i=0;i<before.owner.members.length;i++)if(before.owner.members[i]!==before.node)assert.equal(text(after.owner.members[i],after),text(before.owner.members[i],before),'Unrelated class member changed');}
    if(before.ward){
      assert.equal(before.node.body.statements.length,after.node.body.statements.length);
      for(let i=0;i<before.node.body.statements.length;i++)if(before.node.body.statements[i]!==before.dispatch)assert.equal(text(after.node.body.statements[i],after),text(before.node.body.statements[i],before),'Context, cue or rider phase changed');
      for(let i=0;i<before.cases.length;i++)if(before.cases[i]!==before.ward)assert.equal(text(after.cases[i],after),text(before.cases[i],before),'Unrelated executor case changed');
    }
  }
  assert.throws(()=>integrateProcEffects(game),/already exists/);reports.push({ending,sourceFaultsRejected:faults.length,noPartialSourceWrites:true,signaturesAndUnrelatedMembersPreserved:true,other21BranchesPreserved:true,contextCueAndRiderPhasesPreserved:true,duplicateRejected:true});
}
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/proc-effects-overlay-verification.json'),{decision:contract.decision,reports,originalUnchanged:true});console.log('Effect source controls passed: '+faults.length*2+' faults rejected across LF and CRLF.');
