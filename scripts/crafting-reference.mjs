import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256,verifyReference} from './reference-utils.mjs';
import {prepareVocationObserver,checkVocationObserverTypes,captureVocationObserver} from './vocation-reference.mjs';

export const craftingMethods={
  policy:{
    'engine/crafting.ts':['CRAFT_CFG','baseRollT','liftT','normalTiers','tierQuality','itemQuality','gemQuality','salvageItemYield','salvageSkillYield','salvageSupportYield','sellItemYield','sellSkillYield','sellSupportYield','sellMemoryYield','vendorItemPrice','expertiseRank','expertiseProgress','maxRankFor','studySalvage','bestUnlockedTier','craftableAffixesFor','craftedCount','rollIntoSpan','rollCraftedAffix','rollRerolledAffix'],
    'data/essences.ts':['SALVAGE_CFG','SELL_CFG','VENDOR_ITEM_CFG','ESSENCE_OF_RARITY','ESSENCE_OF_GEM','oracleRerollCost'],
    'engine/itemgen.ts':['affixPoolsFor'],
  },
  actions:{'engine/world.ts':['craftSocket','salvageLane','lockedRefusal','breakOneItem','breakOneGemItem','salvageItem','salvageBulk','salvageLockSet','craftSlots','craftAffix','rerollAffix','spendEssence','grantEssence']},
};
export function craftingMethodHashes(game,name){
  const result={};
  for(const [file,names]of Object.entries(craftingMethods[name])){
    const ast=ts.createSourceFile(file,fs.readFileSync(path.join(game,'src',file),'utf8'),ts.ScriptTarget.Latest,true);
    const world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
    for(const member of names){
      const declaration=world?world.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===member):ast.statements.find(n=>
        ts.isFunctionDeclaration(n)&&n.name?.text===member||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===member));
      assert(declaration,file+'#'+member);result[file+'#'+member]=sha256(declaration.getText(ast).replaceAll('\r\n','\n'));
    }
  }
  return result;
}
export function prepareCraftingObservers(directory,game=path.join(root,'.reference')){
  const fixtures=Object.fromEntries(['policy','actions'].map(name=>{
    const helper='reference/export-crafting-'+name+'.ts';return [name,{helper,helperSha256:sha256(fs.readFileSync(path.join(root,helper)))}];
  }));
  const entries=Object.fromEntries(Object.keys(fixtures).map(name=>[name,prepareVocationObserver(name,game,directory,fixtures)]));
  return {fixtures,entries};
}
export function captureCraftingReference(directory,{types=true,repeat=true}={}){
  const ref=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(ref,lock);
  const {fixtures,entries}=prepareCraftingObservers(directory);let typesSha256;
  if(types)typesSha256=checkVocationObserverTypes(directory,Object.values(entries));
  const runs={};
  for(const [name,entry]of Object.entries(entries)){
    const first=captureVocationObserver(entry,directory,name+'-first');
    const second=repeat?captureVocationObserver(entry,directory,name+'-second'):first;
    assert(first.bytes.equals(second.bytes),'Original '+name+' capture changed between fresh processes');
    runs[name]={...first,secondSha256:second.sha256,secondLogSha256:second.logSha256,methods:craftingMethodHashes(ref,name)};
  }
  verifyReference(ref,lock);return {fixtures,runs,typesSha256};
}
