import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256,verifyReference} from './reference-utils.mjs';
import {prepareVocationObserver,checkVocationObserverTypes,captureVocationObserver} from './vocation-reference.mjs';

export const gemResidenceMethods={
  'engine/gemitems.ts':['SKILL_GEM_BASE','SUPPORT_GEM_BASE','isGemItem','skillGemPayloadOf','supportGemPayloadOf',
    'bagGemItems','findBagGem','freeCellCount','gemItemRarityOf','packSocketRow','packSkillGemPayload',
    'packSupportGemPayload','packGrantState','restoreGrantState','makeSkillGemItem','makeSupportGemItem',
    'skillOfGemItem','bagSkillSupport','supportOfGemItem','writeBackSupportGem','rebuildAnyItem','gemInitials'],
  'engine/itemgen.ts':['nextItemUid','bumpItemUidFloor','rebuildItem','itemGridSize'],
  'engine/skillEmpowerment.ts':['empowermentRank','empowermentNumeral','skillInstanceName'],
};
export function gemResidenceMethodHashes(game){
  const result={};
  for(const [file,names]of Object.entries(gemResidenceMethods)){
    const ast=ts.createSourceFile(file,fs.readFileSync(path.join(game,'src',file),'utf8'),ts.ScriptTarget.Latest,true);
    for(const member of names){
      const declaration=ast.statements.find(n=>(ts.isFunctionDeclaration(n)&&n.name?.text===member)||
        (ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===member)));
      assert(declaration,file+'#'+member);result[file+'#'+member]=sha256(declaration.getText(ast).replaceAll('\r\n','\n'));
    }
  }
  return result;
}
export function prepareGemResidenceObserver(directory,game=path.join(root,'.reference')){
  const helper='reference/export-gem-residence.ts';
  const fixtures={residence:{helper,helperSha256:sha256(fs.readFileSync(path.join(root,helper)))}};
  return {fixtures,entry:prepareVocationObserver('residence',game,directory,fixtures)};
}
export function captureGemResidenceReference(directory){
  const ref=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
  verifyReference(ref,lock);
  const {fixtures,entry}=prepareGemResidenceObserver(directory);
  const typesSha256=checkVocationObserverTypes(directory,[entry]);
  const first=captureVocationObserver(entry,directory,'residence-first'),second=captureVocationObserver(entry,directory,'residence-second');
  assert(first.bytes.equals(second.bytes),'Fresh original residence processes differ');
  verifyReference(ref,lock);
  return {fixtures,typesSha256,runs:{residence:{...first,secondSha256:second.sha256,secondLogSha256:second.logSha256,methods:gemResidenceMethodHashes(ref)}}};
}
