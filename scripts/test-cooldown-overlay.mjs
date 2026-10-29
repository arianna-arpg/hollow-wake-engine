import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {cooldownTree,readCooldownExpectations} from './check-cooldown-contract.mjs';
import {cooldownPath,cooldownImport,renderCooldownSource,integrateCooldowns} from '../adapters/hollow-wake/integrate-cooldowns.mjs';

export function verifyCooldownOverlay(sourceGame){
  const original=fs.readFileSync(path.join(sourceGame,cooldownPath)),base=original.toString().replaceAll('\r\n','\n'),{boundary}=readCooldownExpectations();
  renderCooldownSource(base);const tree=cooldownTree(base),{ast,owner,method}=tree,replace=(start,end,text)=>base.slice(0,start)+text+base.slice(end),faults=[];
  faults.push(['missing-method',replace(method.getStart(ast),method.end,'')],['duplicate-method',replace(method.end,method.end,method.getText(ast))],
    ['changed-method',replace(method.body.getStart(ast)+1,method.body.getStart(ast)+1,' void 0; ')],
    ['duplicate-owner',base+'\nclass World {}'],['invalid-syntax',base+'\nconst invalid = ;'],
    ['changed-import',base.replace(boundary.existingImport,boundary.existingImport.replace('import {','import type {'))],
    ['binding-collision',base+'\nconst engineApplyProcCooldown=0;'],
    ['quoted-binding',replace(owner.members.end,owner.members.end,'\n["engineApplyProcCooldown"]() {}')]);
  for(const clause of tree.cases)faults.push(['changed-case:'+clause.expression.text,replace(clause.end,clause.end,'\n void 0;')]);
  const reports=[];
  for(const ending of ['\n','\r\n']){
    const directory=fs.mkdtempSync(path.join(root,'.artifacts/cooldown-overlay-')),file=path.join(directory,cooldownPath);
    fs.mkdirSync(path.dirname(file),{recursive:true});const marked=(replace(owner.members.end,owner.members.end,'\n  retainedCooldownMarker() { return 75; }\n')+'\n// retained cooldown marker\n').replaceAll('\n',ending);
    fs.writeFileSync(file,marked);integrateCooldowns(directory,false);assert.equal(fs.readFileSync(file,'utf8'),marked);
    for(const[name,fault]of faults){const input=fault.replaceAll('\n',ending);fs.writeFileSync(file,input);
      assert.throws(()=>integrateCooldowns(directory),/Unreviewed|Ambiguous|Invalid|binding collision/,'Cooldown source fault escaped: '+name);
      assert.equal(fs.readFileSync(file,'utf8'),input,'Rejected cooldown source was modified');}
    fs.writeFileSync(file,marked);integrateCooldowns(directory);const output=fs.readFileSync(file,'utf8'),before=cooldownTree(marked.replaceAll('\r\n','\n')),after=cooldownTree(output.replaceAll('\r\n','\n'));
    assert.equal(output.includes('\r\n'),ending==='\r\n');assert(output.endsWith(ending+'// retained cooldown marker'+ending));
    assert.equal(after.owner.members.length,before.owner.members.length);
    for(let i=0;i<before.owner.members.length;i++)if(before.owner.members[i]!==before.method)assert.equal(after.owner.members[i].getText(after.ast),before.owner.members[i].getText(before.ast));
    for(let i=0;i<before.cases.length;i++)if(before.cases[i]!==before.clause)assert.equal(after.cases[i].getText(after.ast),before.cases[i].getText(before.ast));
    const withoutCase=t=>t.method.getText(t.ast).replace(t.clause.getText(t.ast),'CASE');assert.equal(withoutCase(before),withoutCase(after));
    assert.equal(output.split(cooldownImport).length-1,1);assert.throws(()=>integrateCooldowns(directory),/binding collision/);assert.equal(fs.readFileSync(file,'utf8'),output);
    reports.push({lineEnding:ending==='\n'?'LF':'CRLF',faults: faults.map(([name])=>name),outputSha256:sha256(output),unchangedOtherMembers:true,unchangedOtherCases:true,dryRunReadOnly:true,repeatRejected:true});
  }
  assert(fs.readFileSync(path.join(sourceGame,cooldownPath)).equals(original));
  const result={faults:faults.length*2,reports,sourceReadOnly:true};writeJSON(path.join(root,'.artifacts/cooldown-overlay-verification.json'),result);console.log('PASS: '+result.faults+' cooldown source faults rejected; predecessor preserved.');return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){const at=process.argv.indexOf('--game');assert(at>=0&&process.argv[at+1],'Provide --game with the pre-cooldown adapter directory');verifyCooldownOverlay(path.resolve(process.argv[at+1]));}
