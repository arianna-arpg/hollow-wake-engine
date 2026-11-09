import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {renderPassiveGrants} from './integrate-passive-grants.mjs';
import {installCharacterSources} from './install-character-sources.mjs';

const file='src/engine/world.ts',editor='src/dev/passiveEditor.ts';
function locate(source){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 const worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1);
 const world=worlds[0],methods=world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='recalcSeat');assert.equal(methods.length,1);
 const rows=[...methods[0].body.statements];
 const starts=rows.filter(n=>n.getText(ast)==='const passiveBuild = beginSdkPassiveGrants(m);');assert.equal(starts.length,1,'Expected reviewed passive integration');
 const end=rows.findIndex(n=>n.getText(ast).startsWith('this.sdkEquipmentSkills.derive(')||
  (ts.isBlock(n)&&n.statements[0]?.getText(ast)==='const grantStats = new Set<string>();'));
 assert(end>rows.indexOf(starts[0]),'Missing downstream equipment phase');
 return {ast,world,start:starts[0].getStart(ast),end:rows[end-1].end};
}
export function renderBuildContributions(source,original,originalEditor){
 const input=source.replaceAll('\r\n','\n');
 assert(!/\b(?:sdkBuildContributions|EngineBuildContributions)\b/.test(input),'Build contributions already present');
 const expected=renderPassiveGrants(original,originalEditor,original,originalEditor).world;
 const a=locate(input),b=locate(expected);
 assert.equal(input.slice(a.start,a.end),expected.slice(b.start,b.end),'Unreviewed build contribution phase');
 const field=`
  private readonly sdkBuildContributions = new EngineBuildContributions<ItemInstance,Modifier,(typeof CONTAINER_DEFS)[number]>({
    beginPassives:m=>beginSdkPassiveGrants(m as PlayerMeta), equipSlots:()=>EQUIP_SLOTS, containers:()=>CONTAINER_DEFS,
    compileItem:compileItemMods, board:containerBoard, misfits:containerMisfits,
    amplification:seatAmplification, amplify:amplifySeatMods, empower:empowerRelicMods,
  });
`;
 const replacement=`const {passiveBuild,passiveMods,gearSheetMods,containerSheetMods,containerPieceMods} = this.sdkBuildContributions.rebuild(m,{
      get relicEffectsSuppressed(){return p.relicEffectsSuppressed;},
      conduits:value=>{p.wornConduits=value;},
      attributes:(attrs,mods)=>{m.attrs=attrs as Attributes;p.attributeValues={...attrs} as Attributes;p.sheet.setSource('attributes',mods);},
      sheet:p.sheet,
    });`;
 const offset=a.ast.statements.filter(ts.isImportDeclaration).at(-1).end;
 let out=input;
 for(const[start,end,text]of [[a.start,a.end,replacement],[a.world.members.pos,a.world.members.pos,field],
  [offset,offset,"\nimport {BuildContributions as EngineBuildContributions} from '@hollow-wake/engine/character/build-contributions';"]].sort((x,y)=>y[0]-x[0]))out=out.slice(0,start)+text+out.slice(end);
 return source.includes('\r\n')?out.replaceAll('\n','\r\n'):out;
}
/** Apply after PassiveGrants and, when wanted, EquipmentSkills. The entire
 * contribution phase must still match the pinned, reviewed passive transform. */
export function integrateBuildContributions(game,write=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
 const raw=Object.fromEntries([file,editor].map(name=>{const bytes=fs.readFileSync(path.join(root,'.reference',name));assert.equal(sha256(bytes),lock.files[name]);return[name,bytes.toString()];}));
 const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderBuildContributions(before.toString(),raw[file],raw[editor]));
 if(write)installCharacterSources(game,[{file,before,after}]);
 return {files:[file],decision:'Ordered passive, gear and container contributions use the SDK; account resolution, skills, live level/resource and companion completion keep their explicit phases.'};
}
