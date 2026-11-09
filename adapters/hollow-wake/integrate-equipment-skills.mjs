import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';

const file='src/engine/world.ts';
function locate(source){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1);
  const world=worlds[0],methods=world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='recalcSeat');assert.equal(methods.length,1);
  const rows=[...methods[0].body.statements];
  const grants=rows.filter(n=>ts.isBlock(n)&&n.statements[0]?.getText(ast)==='const grantStats = new Set<string>();');assert.equal(grants.length,1);
  const first=rows.indexOf(grants[0]),last=rows.findIndex(n=>n.getText(ast).startsWith("p.sheet.setSource('level',"));assert(first<last);
  const companion=grants[0].statements.filter(n=>ts.isExpressionStatement(n)&&n.getText(ast).startsWith('this.companionGrants.derive('));assert.equal(companion.length,1);
  const args=companion[0].expression.arguments;assert.equal(args.length,6);
  return {ast,world,start:rows[first].getStart(ast),end:rows[last-1].end,kill:args[3].getText(ast),relevel:args[4].getText(ast)};
}
export function renderEquipmentSkills(source,original){
  const input=source.replaceAll('\r\n','\n'),base=original.replaceAll('\r\n','\n');
  assert(!/\b(?:sdkEquipmentSkills|EngineEquipmentSkills)\b/.test(input),'Equipment skills already present');
  const a=locate(input),b=locate(base);
  assert.equal(input.slice(a.start,a.end),base.slice(b.start,b.end),'Unreviewed equipment skill derivation');
  const field=`
  private readonly sdkEquipmentSkills = new EngineEquipmentSkills<SkillDef,SupportDef,SkillInstance,ItemInstance,ReturnType<typeof packGrantState>,(typeof CLASSES)[number]>({
    skillGrantPrefix:SKILLGRANT_PREFIX, companionGrantPrefix:COMPANION_GRANT_PREFIX, slotGraftPrefix:SLOTGRAFT_PREFIX,
    equipSlots:()=>EQUIP_SLOTS, skill:id=>SKILLS[id], support:id=>SUPPORTS[id],
    parseSkillGrant:parseSkillGrantStat, companionGrantStat, parseSlotGraft:parseSlotGraftStat,
    skillMaxLevel, maxSupportLevel:MAX_SUPPORT_LEVEL, grantSockets:()=>GRANT_CFG.sockets, autoSeat:()=>GRANT_CFG.autoSeat,
    makeSkill:makeSkillInstance, restoreGrant:restoreGrantState, packGrant:packGrantState,
    classes:()=>CLASSES, openingSkills:classOpeningSkills, classSkillStat:c=>classSkillStat(c.id),
    treeGraft:(def,nid)=>treeNodeOf(def,nid)?.graft,
    supportFits:(def,inst)=>supportFitsInstOrCrew(def,inst,this.summonCrewSkills(inst)),
  });
`;
  const replacement=`this.sdkEquipmentSkills.derive({
      seat, actor:p, meta:m, passiveMods, gearSheetMods, containerSheetMods, containerPieceMods,
      passiveGrafts:()=>graftSourcesOf(m.allocated,m.choices,PASSIVE_NODES),
      deriveCompanions:(definitions,sourceName,relicKey)=>this.companionGrants.derive(p,definitions,sourceName,${b.kill},${b.relevel},relicKey),
      deactivateAura:id=>this.deactivateAura(p,id), dismissSummon:id=>this.dismissSummonToggle(p,id),
    });`;
  const offset=a.ast.statements.filter(ts.isImportDeclaration).at(-1).end;
  const edits=[[a.start,a.end,replacement],[a.world.members.pos,a.world.members.pos,field],
    [offset,offset,"\nimport {EquipmentSkills as EngineEquipmentSkills} from '@hollow-wake/engine/skills/equipment';"]];
  let out=input;for(const [start,end,text] of edits.sort((x,y)=>y[0]-x[0]))out=out.slice(0,start)+text+out.slice(end);
  return source.includes('\r\n')?out.replaceAll('\n','\r\n'):out;
}
export function integrateEquipmentSkills(game,install=true){
  const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
  const original=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(original),lock.files[file]);
  const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderEquipmentSkills(before.toString(),original.toString()));
  if(install)installCharacterSources(game,[{file,before,after}]);
  return {files:[file],decision:'Equipment skill grants, bonuses and grafts use the SDK; companion bodies and world effects remain explicit host services.'};
}
