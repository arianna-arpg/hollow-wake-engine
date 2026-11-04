import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';

const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/character-rules/acceptance.json')));
const digests=Object.assign({},...Object.values(contract.fixtures).map(f=>f.methods));
const hostFiles=['engine/world.ts','meta/account.ts','meta/character.ts','meta/classkit.ts','meta/unlocks.ts'];
const kitArgs={classTierOwned:'a,classId,tierId',ownedKitRungs:'a,c',kitChoicesFor:'a,c',
  resolveClassKit:'a,c,picks',rememberKitPicks:'a,c,picks',kitHasOptions:'a,c',kitRungOf:'c,skillId,engineTierLabel'};
const claims={
  pendingClassUnlocks:'return engineClaims.pendingClassClaims(UNLOCK_CATALOG,a,engineClaimPorts);',
  acknowledgeClassUnlock:'return engineClaims.activateClassClaim(a,u,engineClaimPorts);',
  claimClassUnlock:'return engineClaims.claimEarnedEntry(a,u,view,engineClaimPorts);',
  settleClassUnlocks:'return engineClaims.settleClassClaims(UNLOCK_CATALOG,a,view,engineClaimPorts);'
};
const claimPorts=`
const engineClaimPorts: engineClaims.ClassClaimPorts<Account,Unlockable,Readonly<Record<string,number>>> = {
  owned: isUnlockOwned,
  visible: (a,u,view) => isUnlockVisible(view ? {...a,ledger:view} : a,u),
  clearInvestment: (a,id) => { delete a.invested[id]; },
  grant: grantUnlock,
  markPending: (a,u) => { if (u.kind==='class') a.pendingClassUnlocks.add(u.payload.classId); },
  pending: (a,u) => u.kind==='class' && a.pendingClassUnlocks.has(u.payload.classId),
  activate: (a,u) => u.kind==='class' && a.pendingClassUnlocks.delete(u.payload.classId)
};`;
const accessFunctions={isClassDiscovered:'engineIdentity.isClassDiscovered(a,id)',
  isClassUnlocked:'engineIdentity.isClassUnlocked(a,id)',unlockedClassCount:'engineIdentity.unlockedClassCount(CLASSES,a)'};

function replaceRegion(text,from,to,body) {
  assert.equal(text.split(from).length,2,from);
  const start=text.indexOf(from),end=text.indexOf(to,start);
  assert(end>start,to);
  return text.slice(0,start)+body+text.slice(end);
}

export function renderCharacterSource(file,source) {
  assert(hostFiles.includes(file));
  const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true);
  assert(!/\b(?:engineIdentity|engineKits|engineClaims|engineTierLabel|engineClaimPorts)\b/.test(input),'Character binding name already in use');
  const imports=ast.statements.filter(ts.isImportDeclaration);
  const world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
  const edits=[];
  function checked(name) {
    const node=world ? world.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name)
      : ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name || ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));
    assert(node&&sha256(node.getText(ast))===digests[file+'#'+name],'Unreviewed character source: '+file+'#'+name);
    return node;
  }
  function edit(node,replacement){edits.push([node.getStart(ast),node.end,replacement]);}
  function insert(text){const at=imports.at(-1).end;edits.push([at,at,'\n'+text]);}
  if(file==='engine/world.ts'){
    insert("import * as engineIdentity from '@hollow-wake/engine/character/identity';");
    const body=checked('makePlayerSeat').body;
    edit(body,replaceRegion(body.getText(ast),'      classDef,\n      opening:','      xp: 0,','      ...engineIdentity.createClassIdentity(classDef,bar),\n'));
  } else if(file==='meta/account.ts'){
    insert("import * as engineIdentity from '@hollow-wake/engine/character/identity';");
    for(const [name,expression] of Object.entries(accessFunctions)) {
      const arrow=checked(name).declarationList.declarations.find(d=>d.name.getText(ast)===name).initializer;
      assert(ts.isArrowFunction(arrow));edit(arrow.body,expression);
    }
  } else if(file==='meta/character.ts'){
    insert("import * as engineIdentity from '@hollow-wake/engine/character/identity';");
    const body=checked('rebuildSavedMeta').body;
    let revised=body.getText(ast).replace('CLASSES.find(c => c.id === save.classId)','engineIdentity.findSavedClass(CLASSES,save.classId)');
    revised=replaceRegion(revised,'    classDef,\n    // THE STAMPED OPENING','    xp: save.xp,','    ...engineIdentity.restoreClassIdentity(classDef,save,sanitizeCompanionStances),\n');
    revised=revised.replace('    modeId: save.modeId ?? DEFAULT_MODE_ID,\n    modeStage: save.modeStage ?? 0,\n    charId: save.charId || mintCharId(),','    ...engineIdentity.restoreLifeIdentity(save,DEFAULT_MODE_ID,mintCharId),');
    assert(revised.includes('engineIdentity.findSavedClass(')&&revised.includes('engineIdentity.restoreLifeIdentity('));
    edit(body,revised);
  } else if(file==='meta/classkit.ts'){
    insert("import * as engineKits from '@hollow-wake/engine/character/kits';\nconst engineTierLabel=(id:string)=>CLASS_TIER_BY_ID[id]?.label;");
    // Only drop imports after the pinned seven functions have been accepted.
    for(const [name,args]of Object.entries(kitArgs)){
      edit(checked(name).body,'{ return engineKits.'+name+'('+args+'); }');
    }
  } else {
    insert("import * as engineClaims from '@hollow-wake/engine/character/claims';\n"+claimPorts);
    for(const [name,statement]of Object.entries(claims))edit(checked(name).body,'{ '+statement+' }');
    const grant=checked('grantUnlock');
    const branch=grant.body.statements.find(ts.isSwitchStatement).caseBlock.clauses.find(c=>c.expression?.text==='class');
    assert(branch);edit(branch,"case 'class': engineClaims.grantClassBundle(a,u.payload); break;");
  }
  let output=input;
  for(const [start,end,value]of edits.sort((a,b)=>b[0]-a[0]))output=output.slice(0,start)+value+output.slice(end);
  if(file==='meta/classkit.ts'){
    // A local extension may still use one of the two old imported names.
    for(const [name,needle]of [['kitRungs','kitRungs, '],['classTierId','classTierId, ']]){
      if(output.match(new RegExp('\\b'+name+'\\b','g'))?.length===1)output=output.replace(needle,'');
    }
  }
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}

export function integrateCharacterRules(game,install=true) {
  const changes=hostFiles.map(name=>{
    const file='src/'+name,before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderCharacterSource(name,before.toString('utf8')));
    return {file,before,after};
  });
  if(install)installCharacterSources(game,changes);
  return {files:changes.map(e=>e.file),decision:'class identity, opening kits and earned class activation'};
}
