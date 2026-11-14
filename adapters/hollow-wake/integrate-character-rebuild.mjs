import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {renderPassiveGrants} from './integrate-passive-grants.mjs';
import {renderEquipmentSkills} from './integrate-equipment-skills.mjs';
import {renderBuildContributions} from './integrate-build-contributions.mjs';
import {installCharacterSources} from './install-character-sources.mjs';

const file='src/engine/world.ts',editor='src/dev/passiveEditor.ts';
function locate(source){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1);
  const world=worlds[0],methods=world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='recalcSeat');assert.equal(methods.length,1);
  const rows=[...methods[0].body.statements],first=rows.findIndex(n=>n.getText(ast).includes('this.sdkBuildContributions.rebuild('));
  assert(first>=0,'Reviewed contribution adapter is required');
  const equipment=rows.find(n=>ts.isExpressionStatement(n)&&n.getText(ast).startsWith('this.sdkEquipmentSkills.derive('));
  assert(equipment&&ts.isCallExpression(equipment.expression));
  const frame=equipment.expression.arguments[0];assert(ts.isObjectLiteralExpression(frame));
  const companion=frame.properties.find(n=>n.name?.getText(ast)==='deriveCompanions');assert(companion&&ts.isPropertyAssignment(companion));
  const fields=world.members.filter(n=>ts.isPropertyDeclaration(n)&&['sdkBuildContributions','sdkEquipmentSkills'].includes(n.name.getText(ast)));
  assert.equal(fields.length,2);
  return{ast,world,method:methods[0],first:rows[first],last:rows.at(-1),fields,companion:companion.getText(ast)};
}

/** Consolidate only the exact reviewed contribution/equipment integration.
 * Hero selection, relic authorization and relay installation remain host work. */
export function renderCharacterRebuild(source,original,originalEditor){
  const input=source.replaceAll('\r\n','\n');
  assert(!/\b(?:sdkCharacterRebuild|EngineCharacterRebuild)\b/.test(input),'Character rebuild already present');
  const passive=renderPassiveGrants(original,originalEditor,original,originalEditor).world;
  const equipped=renderEquipmentSkills(passive,original,{passiveGrafts:'compiled'});
  const expected=renderBuildContributions(equipped,original,originalEditor).replaceAll('\r\n','\n');
  const a=locate(input),b=locate(expected);
  assert.equal(a.method.getText(a.ast),b.method.getText(b.ast),'Unreviewed live character rebuild');
  const field=`
  private readonly sdkCharacterRebuild = new EngineCharacterRebuild<SkillDef,SupportDef,SkillInstance,ItemInstance,Modifier>({
    contributions:this.sdkBuildContributions, equipment:this.sdkEquipmentSkills,
    levelModifiers:level=>[
      mod('life','flat',(level-1)*PROGRESSION.lifePerLevel),
      mod('mana','flat',(level-1)*PROGRESSION.manaPerLevel),
      mod('accuracy','flat',(level-1)*4),
    ],
  });
`;
  const replacement=`this.sdkCharacterRebuild.rebuild({
      seat, actor:p, meta:m,
      get relicEffectsSuppressed(){return p.relicEffectsSuppressed;},
      conduits:value=>{p.wornConduits=value;},
      attributes:(attrs,mods)=>{m.attrs=attrs as Attributes;p.attributeValues={...attrs} as Attributes;p.sheet.setSource('attributes',mods);},
      ${a.companion},
      deactivateAura:id=>this.deactivateAura(p,id), dismissSummon:id=>this.dismissSummonToggle(p,id),
      syncGuard:()=>this.guardArts.sync(p), refreshBonds:()=>this.companionBonds.refresh(),
    });`;
  const importAt=a.ast.statements.filter(ts.isImportDeclaration).at(-1).end;
  const edits=[[a.first.getStart(a.ast),a.last.end,replacement],
    [Math.max(...a.fields.map(n=>n.end)),Math.max(...a.fields.map(n=>n.end)),field],
    [importAt,importAt,"\nimport {CharacterRebuild as EngineCharacterRebuild} from '@hollow-wake/engine/character/rebuild';"]];
  let out=input;for(const[start,end,text]of edits.sort((x,y)=>y[0]-x[0]))out=out.slice(0,start)+text+out.slice(end);
  return source.includes('\r\n')?out.replaceAll('\n','\r\n'):out;
}

export function integrateCharacterRebuild(game,write=true){
  const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
  const originals=Object.fromEntries([file,editor].map(name=>{
    const bytes=fs.readFileSync(path.join(root,'.reference',name));assert.equal(sha256(bytes),lock.files[name]);return[name,bytes.toString()];
  }));
  const before=fs.readFileSync(path.join(game,file));
  const after=Buffer.from(renderCharacterRebuild(before.toString(),originals[file],originals[editor]));
  if(write)installCharacterSources(game,[{file,before,after}]);
  return{files:[file],decision:'Current character contributions, skill derivation, level sources, resource clamps and ordered guard/bond refresh use the SDK; the host retains body selection and authorized relic inputs.'};
}
