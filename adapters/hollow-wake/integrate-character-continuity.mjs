import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';

const {fixtures}=JSON.parse(fs.readFileSync(path.join(root,'baseline/character-continuity/acceptance.json')));
const expected=Object.assign({},...Object.values(fixtures).map(f=>f.methods));
const files=['engine/world.ts','meta/account.ts','meta/character.ts','meta/unlocks.ts'];
const accountGroups={
  makeAccount:[
    [['unlockedClasses','pendingClassUnlocks','unlockedClassTiers'],'...engineClassAccount.createClassAccess(STARTER_CLASSES)'],
    [['unlockedSkills','explicitSkillUnlocks','unlockedSupports'],'...engineClassAccount.createGemPools(STARTER_SKILLS,STARTER_SUPPORTS)']
  ],
  serializeAccount:[
    [['unlockedClasses','pendingClassUnlocks','unlockedClassTiers','kitPicks'],'...engineClassAccount.serializeClassAccess(a)'],
    [['unlockedSkills','explicitSkillUnlocks','unlockedSupports'],'...engineClassAccount.serializeGemPools(a)']
  ],
  deserializeAccount:[
    [['unlockedClasses','pendingClassUnlocks','unlockedClassTiers'],'...engineClassAccount.restoreClassAccess(s,STARTER_CLASSES,CLASSES)'],
    [['kitPicks'],'kitPicks: engineClassAccount.restoreKitPicks(s.kitPicks)'],
    [['unlockedSkills','explicitSkillUnlocks','unlockedSupports'],'...engineClassAccount.restoreGemPools(s,STARTER_SKILLS,STARTER_SUPPORTS)']
  ]
};
function unique(source,needle,replacement){
  assert.equal(source.split(needle).length,2,needle);return source.replace(needle,replacement);
}

export function renderCharacterContinuity(file,source) {
  assert(files.includes(file));
  const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true);
  assert(!/\b(?:engineClassAccount|engineClassRewards|engineMercIdentity|engineMercNeighbors)\b/.test(input),'Continuity binding name collision');
  const world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
  const edits=[],imports=ast.statements.filter(ts.isImportDeclaration);
  const insert=text=>{const at=imports.at(-1).end;edits.push([at,at,'\n'+text]);};
  const edit=(node,text)=>edits.push([node.getStart(ast),node.end,text]);
  function checked(name){
    const node=world?world.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name):
      ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
    assert(node?.body&&sha256(node.getText(ast))===expected[file+'#'+name],'Unreviewed continuity method '+file+'#'+name);
    return node.body;
  }
  if(file==='meta/account.ts'){
    insert("import * as engineClassAccount from '@hollow-wake/engine/character/account';");
    for(const [method,groups]of Object.entries(accountGroups)){
      const body=checked(method),ret=body.statements.find(n=>ts.isReturnStatement(n)&&n.expression&&ts.isObjectLiteralExpression(n.expression));
      assert(ret,method);const properties=ret.expression.properties;
      for(const [names,replacement]of groups){
        const start=properties.findIndex(p=>p.name?.getText(ast)===names[0]);assert(start>=0);
        const group=properties.slice(start,start+names.length);assert.deepEqual(group.map(p=>p.name.getText(ast)),names);
        edits.push([group[0].getStart(ast),group.at(-1).end,replacement]);
      }
    }
  }else if(file==='meta/unlocks.ts'){
    insert("import * as engineClassRewards from '@hollow-wake/engine/character/rewards';");
    edit(checked('isSkillUnlockedForSelection'),'{ return engineClassRewards.isSelectableClassSkill(a,id,STARTER_SKILLS,CLASS_BUNDLES); }');
    edit(checked('reconcileClassBundleGems'),`{
  engineClassRewards.reconcileClassRewards(a,CLASS_BUNDLES,MEMORY_UNLOCK_CFG.legacyGemBundles,UNLOCK_CATALOG,
    MEMORY_UNLOCK_CFG.legacyGemBundles ? undefined : MEMORY_UNLOCKS.find(r=>r.tier==='discovery')?.id,investedToward);
}`);
  }else if(file==='engine/world.ts'){
    insert("import * as engineMercIdentity from '@hollow-wake/engine/character/mercenaries';\nconst engineMercNeighbors=(id:string)=>PASSIVE_ADJACENCY[id];");
    edit(checked('trimAllocated'),'{ return engineMercIdentity.trimMercenaryAllocations(snapshot,budget,classStartNode,engineMercNeighbors); }');
    const body=checked('normalizeMercMeta');
    let replacement=unique(body.getText(ast),'const gemLevel = (orig: number): number =>\n      Math.max(1, Math.min(capNow, Math.round(orig * (capNow / capThen))));',
      'const ratio=capNow/capThen;\n    const gemLevel=(level:number)=>engineMercIdentity.normalizedMercenarySkill(level,capNow,ratio);');
    const start=replacement.indexOf('      classDef,\n      // THE STAMPED OPENING'),end=replacement.indexOf('      xp: 0,',start);
    assert(start>=0&&end>start);replacement=replacement.slice(0,start)+'      ...engineMercIdentity.createMercenaryIdentity(classDef,snapshot),\n'+replacement.slice(end);
    edit(body,replacement);
  }else{
    insert("import * as engineMercIdentity from '@hollow-wake/engine/character/mercenaries';");
    const body=checked('applySavedCharacter');
    edit(body,unique(body.getText(ast),'for (const m of save.mercenaries ?? (save.mercenary?.snapshot ? [save.mercenary] : [])) {\n    if (m?.snapshot) world.restoreHiredMerc(m);\n  }',
      'engineMercIdentity.restoreMercenaryCompany(save,member=>world.restoreHiredMerc(member));'));
  }
  let result=input;
  for(const [start,end,text]of edits.sort((a,b)=>b[0]-a[0]))result=result.slice(0,start)+text+result.slice(end);
  if(file==='meta/unlocks.ts'){
    const parsed=ts.createSourceFile(file,result,ts.ScriptTarget.Latest,true),used=new Set();
    function visit(node){if(ts.isImportDeclaration(node))return;if(ts.isIdentifier(node))used.add(node.text);ts.forEachChild(node,visit);}
    visit(parsed);
    if(!used.has('isClassUnlocked')){
      const importNode=parsed.statements.find(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='./account');
      const names=importNode?.importClause?.namedBindings;assert(names&&ts.isNamedImports(names));
      const retained=names.elements.filter(e=>e.name.text!=='isClassUnlocked');assert.equal(retained.length,names.elements.length-1);
      result=result.slice(0,names.getStart(parsed))+'{'+retained.map(n=>n.getText(parsed)).join(', ')+'}'+result.slice(names.end);
    }
  }
  return source.includes('\r\n')?result.replaceAll('\n','\r\n'):result;
}
export function integrateCharacterContinuity(game,install=true) {
  const changes=files.map(name=>{const file='src/'+name,before=fs.readFileSync(path.join(game,file));return {file,before,after:Buffer.from(renderCharacterContinuity(name,before.toString('utf8')))};});
  if(install)installCharacterSources(game,changes);
  return {files:changes.map(c=>c.file),decision:'class account restoration, live reward pools and company identity'};
}
